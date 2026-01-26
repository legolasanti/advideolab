import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import axios from 'axios';
import { JobStatus } from '@prisma/client';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  createJob,
  completeJobWithOutputs,
  markJobError,
  UnsafeExternalUrlError,
  ExternalAssetTooLargeError,
  WorkflowConfigurationError,
  persistOutputsToStorage,
} from '../services/jobService';
import { prisma } from '../lib/prisma';
import { downloadBufferByKey, resolveKeyFromPublicUrl } from '../lib/s3';
import {
  ensureTenantReadyForUsage,
  QuotaExceededError,
  TenantBlockedError,
  BillingPeriodExpiredError,
} from '../services/quota';
import { env } from '../config/env';

const router = Router();
const videoLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const scrubText = (value: unknown, fallback = '', maxLength = 600) => {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
};

const optionalText = (value: string | undefined) => (value && value.length > 0 ? value : undefined);

const creatorGenderChoices = new Set(['female', 'male']);
const creatorAgeRanges = new Set(['18-25', '25-35', '35-45', '45-55', '55-65', '65+']);
const defaultCallToAction = 'none';
const maxInputAssetBytes = 10 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const hasPngMagic = (buffer: Buffer) =>
  buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);

const hasJpegMagic = (buffer: Buffer) =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const detectMimeType = (buffer: Buffer) => {
  if (hasPngMagic(buffer)) return 'image/png';
  if (hasJpegMagic(buffer)) return 'image/jpeg';
  return null;
};

const publicCdnOrigin = (() => {
  try {
    return new URL(env.PUBLIC_CDN_BASE).origin;
  } catch (_err) {
    return null;
  }
})();

const isPublicCdnAssetUrl = (value: string) => {
  if (!publicCdnOrigin) return false;
  try {
    return new URL(value).origin === publicCdnOrigin;
  } catch (_err) {
    return false;
  }
};

const sanitizeChoice = (value: unknown, fallback: string, allowed: Set<string>) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
};

const resolveRerunOptions = (raw: unknown) => {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const videoCount = clampNumber(record.videoCount ?? 1, 1, 5, 1);
  const creativeBrief = typeof record.creativeBrief === 'string' ? scrubText(record.creativeBrief, '', 1200) : undefined;
  const callToActionRaw = typeof record.callToAction === 'string' ? record.callToAction : undefined;
  const callToAction =
    callToActionRaw && callToActionRaw.trim().length > 0 && callToActionRaw.trim() !== defaultCallToAction
      ? callToActionRaw.trim()
      : undefined;

  return {
    scriptLanguage: scrubText(record.scriptLanguage ?? 'en-US', 'en-US', 16),
    platformFocus: scrubText(record.platformFocus ?? 'tiktok_vertical', 'tiktok_vertical', 32),
    vibe: scrubText(record.vibe ?? 'future_retail', 'future_retail', 32),
    voiceProfile: scrubText(record.voiceProfile ?? 'creator_next_door', 'creator_next_door', 32),
    callToAction,
    videoCount,
    creativeBrief,
    creatorGender: sanitizeChoice(record.creatorGender, 'female', creatorGenderChoices),
    creatorAgeRange: sanitizeChoice(record.creatorAgeRange, '25-35', creatorAgeRanges),
  };
};

const downloadInputAssetBuffer = async (url: string) => {
  const key = resolveKeyFromPublicUrl(url);
  if (key) {
    return downloadBufferByKey(key);
  }
  if (!isPublicCdnAssetUrl(url)) {
    throw new Error('Input asset URL is not allowed');
  }

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: maxInputAssetBytes,
    maxBodyLength: maxInputAssetBytes,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return Buffer.from(response.data);
};

const buildMulterFile = (buffer: Buffer, mimeType: string): Express.Multer.File => {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return {
    fieldname: 'file',
    originalname: `rerun-input.${ext}`,
    encoding: '7bit',
    mimetype: mimeType,
    size: buffer.length,
    destination: '',
    filename: '',
    path: '',
    buffer,
    stream: undefined as any,
  };
};

const callbackSchema = z.object({
  status: z.enum(['done', 'error']),
  outputs: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .max(2048)
          .refine((value) => {
            try {
              const parsed = new URL(value);
              return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch (_err) {
              return false;
            }
          }, 'url must be http(s)'),
        type: z.string().max(128).optional(),
        size: z.number().int().nonnegative().optional(),
        thumbnailUrl: z
          .string()
          .url()
          .max(2048)
          .refine((value) => {
            try {
              const parsed = new URL(value);
              return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch (_err) {
              return false;
            }
          }, 'thumbnailUrl must be http(s)')
          .optional(),
        durationSeconds: z.number().nonnegative().optional(),
      }),
    )
    .max(5)
    .optional(),
  errorMessage: z.string().max(2000).optional(),
});

const parseCallbackToken = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return null;
  return Buffer.from(normalized, 'hex');
};

const callbackTokenFromOptions = (options: unknown) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  return parseCallbackToken((options as { callbackToken?: unknown }).callbackToken);
};

const callbackTokenHashFromOptions = (options: unknown) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  return parseCallbackToken((options as { callbackTokenHash?: unknown }).callbackTokenHash);
};

const redactCallbackToken = <T extends { options?: unknown }>(job: T) => {
  const options = job.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return job;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { callbackToken: _callbackToken, callbackTokenHash: _callbackTokenHash, ...rest } = options as Record<string, unknown>;
  return { ...job, options: rest };
};

router.post(
  '/',
  requireAuth,
  requireTenantRole(['tenant_admin', 'user']),
  videoLimiter,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.auth?.tenantId || !req.file) {
        return res.status(400).json({ error: 'Missing data' });
      }
      const currentUser = await prisma.user.findUnique({
        where: { id: req.auth.userId ?? '' },
        select: { id: true, email: true },
      });
      if (!currentUser) {
        return res.status(401).json({ error: 'User not found' });
      }
      const videoCount = clampNumber(req.body.video_count ?? req.body.variant_count ?? 1, 1, 5, 1);
      const tenant = await ensureTenantReadyForUsage(req.auth.tenantId, videoCount);
      const tenantAdmin = await prisma.user.findFirst({
        where: { tenantId: tenant.id, role: 'tenant_admin' },
        orderBy: { createdAt: 'asc' },
        select: { email: true },
      });
      const tenantContactEmail = tenantAdmin?.email ?? currentUser.email;
      const creativeBrief = optionalText(scrubText(req.body.creative_brief ?? '', '', 1200));
      const rawCallToAction = scrubText(req.body.call_to_action ?? defaultCallToAction, defaultCallToAction, 32) || defaultCallToAction;
      const callToAction = rawCallToAction === 'none' ? undefined : rawCallToAction;
      const creatorGender = sanitizeChoice(req.body.creator_gender, 'female', creatorGenderChoices);
      const creatorAgeRange = sanitizeChoice(req.body.creator_age_range, '25-35', creatorAgeRanges);
      const options = {
        scriptLanguage: scrubText(req.body.script_language ?? 'en-US', 'en-US', 16),
        platformFocus: scrubText(req.body.platform_focus ?? 'tiktok_vertical', 'tiktok_vertical', 32),
        vibe: scrubText(req.body.vibe ?? 'future_retail', 'future_retail', 32),
        voiceProfile: scrubText(req.body.voice_profile ?? 'creator_next_door', 'creator_next_door', 32),
        callToAction,
        videoCount,
        creativeBrief,
        creatorGender,
        creatorAgeRange,
      };
      const result = await createJob({
        tenant,
        file: req.file,
        options,
        initiatingUserEmail: currentUser.email,
        tenantContactEmail,
      });
      return res.json(result.outputs ? { outputs: result.outputs } : { job_id: result.jobId });
    } catch (err) {
      if (err instanceof TenantBlockedError) {
        const status = err.code === 'plan_missing' ? 402 : 403;
        return res.status(status).json({ code: err.code, message: err.message });
      }
      if (err instanceof WorkflowConfigurationError) {
        return res.status(400).json({ code: err.code, message: err.message });
      }
      if (err instanceof QuotaExceededError) {
        return res.status(402).json({
          code: 'quota_exceeded',
          message: 'Your monthly video limit is reached. Please upgrade your plan or wait until the next cycle.',
        });
      }
      if (err instanceof BillingPeriodExpiredError) {
        return res.status(402).json({
          code: err.code,
          message: 'Your billing period has ended. Please renew or update the plan before launching jobs.',
        });
      }
      next(err);
    }
  },
);

router.get('/jobs', requireAuth, requireTenantRole(['tenant_admin', 'user']), async (req, res) => {
  if (!req.auth?.tenantId) {
    return res.status(400).json({ error: 'Tenant missing' });
  }
  const page = Number(req.query.page ?? 1);
  const status = req.query.status as string | undefined;
  const limit = clampNumber(req.query.limit ?? 20, 1, 50, 20);
  // Determine strict viewing limit based on plan
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth.tenantId },
    include: { planDetails: true },
  });

  let planLimit = 10; // Default / Starter
  const code = tenant?.planDetails?.code || 'starter';

  if (code === 'growth') planLimit = 20;
  if (code === 'scale') planLimit = 30;

  // Ensure request limit doesn't exceed plan limit
  const effectiveLimit = Math.min(limit, planLimit);
  const pageSize = effectiveLimit;

  const where: any = { tenantId: req.auth.tenantId };
  if (status) {
    where.status = status;
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize, // Enforce strict limit
      include: { assets: true },
    }),
    prisma.job.count({ where }),
  ]);

  res.json({
    data: jobs.map((job) => redactCallbackToken(job as any)),
    pagination: { page, pageSize, total },
  });
});

router.get('/jobs/:id', requireAuth, requireTenantRole(['tenant_admin', 'user']), async (req, res) => {
  if (!req.auth?.tenantId) {
    return res.status(400).json({ error: 'Tenant missing' });
  }
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, tenantId: req.auth.tenantId },
    include: { assets: true },
  });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(redactCallbackToken(job as any));
});

router.post('/jobs/:id/callback', async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      tenantId: true,
      status: true,
      options: true,
      finishedAt: true,
      outputs: true,
      updatedAt: true,
    },
  });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const expectedToken = callbackTokenFromOptions(job.options);
  const expectedTokenHash = callbackTokenHashFromOptions(job.options);
  const headerToken = req.header('x-callback-token');
  const queryToken =
    env.allowCallbackTokenQuery && typeof req.query.token === 'string' ? req.query.token : undefined;
  const providedToken = parseCallbackToken(headerToken ?? queryToken);

  const authorized = (() => {
    if (!providedToken) return false;
    if (expectedTokenHash) {
      const providedHash = crypto.createHash('sha256').update(providedToken).digest();
      return crypto.timingSafeEqual(providedHash, expectedTokenHash);
    }
    if (expectedToken) {
      return crypto.timingSafeEqual(providedToken, expectedToken);
    }
    return false;
  })();

  if (!authorized) {
    // Avoid leaking whether a job exists without a valid token.
    return res.status(404).json({ error: 'Job not found' });
  }

  const finalizedStatuses = new Set<JobStatus>([
    JobStatus.done,
    JobStatus.error,
    JobStatus.completed,
    JobStatus.failed,
  ]);

  if (job.finishedAt || finalizedStatuses.has(job.status)) {
    return res.json({ ok: true });
  }

  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }
  const { status, outputs, errorMessage } = parsed.data;
  if (status === 'error') {
    await markJobError(job.id, job.tenantId, errorMessage ?? 'n8n reported error');
    return res.json({ ok: true });
  }

  if (!outputs || outputs.length === 0) {
    return res.status(400).json({ error: 'Missing outputs' });
  }

  const claimed = await prisma.job.updateMany({
    where: {
      id: job.id,
      finishedAt: null,
      status: { in: [JobStatus.pending, JobStatus.running] },
    },
    data: { status: JobStatus.processing },
  });

  if (claimed.count === 0) {
    return res.json({ ok: true });
  }

  let storedOutputs;
  try {
    storedOutputs = await persistOutputsToStorage(job.tenantId, job.id, outputs);
  } catch (err) {
    console.error('[callback] failed to persist outputs', err);
    if (err instanceof UnsafeExternalUrlError || err instanceof ExternalAssetTooLargeError) {
      await markJobError(job.id, job.tenantId, err.message || 'Invalid output URL');
      return res.json({ ok: true });
    }
    await prisma.job.updateMany({
      where: { id: job.id, status: JobStatus.processing, finishedAt: null },
      data: { status: JobStatus.running },
    });
    return res.status(500).json({ error: 'output_persist_failed' });
  }

  const jobOptions =
    job && typeof job.options === 'object' && job.options !== null ? (job.options as { videoCount?: number }) : {};
  const completedCount = clampNumber(jobOptions.videoCount ?? 1, 1, 5, 1);
  try {
    await completeJobWithOutputs(job.id, job.tenantId, storedOutputs, completedCount);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[callback] failed to finalize job', err);
    await prisma.job.updateMany({
      where: { id: job.id, status: JobStatus.processing, finishedAt: null },
      data: { status: JobStatus.running },
    });
    return res.status(500).json({ error: 'job_finalize_failed' });
  }
});

router.post('/jobs/:id/rerun', requireAuth, requireTenantRole(['tenant_admin']), async (req, res, next) => {
  try {
    if (!req.auth?.tenantId) {
      return res.status(400).json({ error: 'Tenant missing' });
    }
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId: req.auth.tenantId },
      select: { id: true, tenantId: true, inputAssetId: true, options: true },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.inputAssetId) {
      return res.status(400).json({ error: 'Original input unavailable' });
    }

    const inputAsset = await prisma.asset.findFirst({
      where: { id: job.inputAssetId, tenantId: job.tenantId },
      select: { url: true },
    });
    if (!inputAsset) {
      return res.status(404).json({ error: 'Input asset not found' });
    }

    const buffer = await downloadInputAssetBuffer(inputAsset.url);
    if (buffer.length > maxInputAssetBytes) {
      return res.status(400).json({ error: 'Input asset too large' });
    }

    const mimeType = detectMimeType(buffer);
    if (!mimeType) {
      return res.status(400).json({ error: 'Unsupported input asset type' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.auth.userId ?? '' },
      select: { id: true, email: true },
    });
    if (!currentUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const options = resolveRerunOptions(job.options);
    const tenant = await ensureTenantReadyForUsage(req.auth.tenantId, options.videoCount);
    const tenantAdmin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'tenant_admin' },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    const tenantContactEmail = tenantAdmin?.email ?? currentUser.email;

    const file = buildMulterFile(buffer, mimeType);
    const result = await createJob({
      tenant,
      file,
      options,
      initiatingUserEmail: currentUser.email,
      tenantContactEmail,
    });

    return res.json(result.outputs ? { outputs: result.outputs } : { job_id: result.jobId });
  } catch (err) {
    if (err instanceof TenantBlockedError) {
      const status = err.code === 'plan_missing' ? 402 : 403;
      return res.status(status).json({ code: err.code, message: err.message });
    }
    if (err instanceof WorkflowConfigurationError) {
      return res.status(400).json({ code: err.code, message: err.message });
    }
    if (err instanceof QuotaExceededError) {
      return res.status(402).json({
        code: 'quota_exceeded',
        message: 'Your monthly video limit is reached. Please upgrade your plan or wait until the next cycle.',
      });
    }
    if (err instanceof BillingPeriodExpiredError) {
      return res.status(402).json({
        code: err.code,
        message: 'Your billing period has ended. Please renew or update the plan before launching jobs.',
      });
    }
    return next(err);
  }
});

export default router;
