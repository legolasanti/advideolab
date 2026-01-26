import { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import os from 'node:os';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../lib/prisma';
import { uploadBuffer } from '../lib/s3';
import { env } from '../config/env';
import { decrypt } from '../lib/crypto';
import { completeUgcJobFromUpload, createUgcJob } from '../services/ugcVideoService';
import { validateUpload } from '../utils/fileValidation';
import { sanitizeImage } from '../services/imageProcessing';

const router = Router();

const publicCdn = (() => {
  try {
    const base = new URL(env.PUBLIC_CDN_BASE);
    const basePath = base.pathname.replace(/\/$/, '');
    return { origin: base.origin, basePath };
  } catch (_err) {
    return null;
  }
})();

const isPublicCdnAssetUrl = (value: string) => {
  if (!publicCdn) return false;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== publicCdn.origin) return false;
    const pathname = parsed.pathname.replace(/\/$/, '');
    return pathname === publicCdn.basePath || pathname.startsWith(`${publicCdn.basePath}/`);
  } catch (_err) {
    return false;
  }
};

const createJobSchema = z.object({
  imageUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => isPublicCdnAssetUrl(value), { message: 'imageUrl must be an uploaded asset URL' }),
  productName: z.string().min(1).max(256),
  prompt: z.string().max(2000).optional().nullable(),
  language: z.string().min(2).max(12),
  gender: z.string().min(1).max(32),
  ageRange: z.string().min(1).max(32),
  platform: z.string().max(64).optional().nullable(),
  voiceProfile: z.string().max(64).optional().nullable(),
  cta: z.string().max(64).optional().nullable(),
});

const statusMap: Record<string, string> = {
  done: 'completed',
  running: 'processing',
  error: 'failed',
};

const normalizeStatus = (status: string) => statusMap[status] ?? status;

const largeUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      cb(null, `${safeName}-${file.fieldname}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'application/octet-stream',
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('unsupported_file_type'));
    }
    cb(null, true);
  },
});

const handleLargeUploadErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (String(err?.message ?? '') === 'unsupported_file_type') {
    return res.status(400).json({ error: 'unsupported_file_type' });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'upload_failed', code: err.code });
  }
  return next(err);
};

const resolveVideoUrl = (job: any) => {
  if (job.videoUrl) return job.videoUrl;
  const outputs = job.outputs;
  if (Array.isArray(outputs) && outputs.length > 0) {
    const first = outputs[0];
    if (first && typeof first === 'object' && 'url' in first) {
      return (first as any).url as string;
    }
  }
  return undefined;
};

const redactCallbackToken = (job: any) => {
  const options = job?.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return job;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { callbackToken: _callbackToken, callbackTokenHash: _callbackTokenHash, ...rest } = options as Record<string, unknown>;
  return { ...job, options: rest };
};

const parseCallbackToken = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return null;
  return Buffer.from(normalized, 'hex');
};

const callbackTokenHashFromOptions = (options: unknown) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  return parseCallbackToken((options as { callbackTokenHash?: unknown }).callbackTokenHash);
};

router.post(
  '/uploads/hero',
  requireAuth,
  requireTenantRole(['tenant_admin', 'user']),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.tenant || !req.auth?.tenantId) {
        return res.status(400).json({ error: 'Tenant missing' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' });
      }
      try {
        validateUpload(req.file);
      } catch (err: any) {
        return res.status(400).json({ error: err?.message ?? 'Invalid upload' });
      }

      let sanitized;
      try {
        sanitized = await sanitizeImage(req.file);
      } catch (_err) {
        return res.status(400).json({ error: 'Invalid image file' });
      }

      const contentType = sanitized.ext === 'png' ? 'image/png' : 'image/jpeg';
      const key = `ugc/inputs/${req.auth.tenantId}/${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${sanitized.ext}`;
      const imageUrl = await uploadBuffer(sanitized.buffer, key, contentType);

      await prisma.asset.create({
        data: {
          tenantId: req.auth.tenantId,
          type: 'input',
          url: imageUrl,
          meta: {
            kind: 'ugc_hero',
            originalName: req.file.originalname,
          },
        },
      });

      res.json({ imageUrl });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/jobs', requireAuth, requireTenantRole(['tenant_admin', 'user']), async (req, res, next) => {
  try {
    if (!req.auth?.tenantId) {
      return res.status(400).json({ error: 'Tenant missing' });
    }
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const payload = parsed.data;
    const result = await createUgcJob({
      tenantId: req.auth.tenantId,
      tenantName: req.tenant?.name,
      userId: req.auth.userId,
      payload,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/jobs', requireAuth, requireTenantRole(['tenant_admin', 'user']), async (req, res, next) => {
  try {
    if (!req.auth?.tenantId) {
      return res.status(400).json({ error: 'Tenant missing' });
    }
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where: any = { tenantId: req.auth.tenantId };
    if (statusParam) {
      const statusFilterMap: Record<string, string[]> = {
        completed: ['completed', 'done'],
        processing: ['processing', 'running'],
        failed: ['failed', 'error'],
      };
      where.status = { in: statusFilterMap[statusParam] ?? [statusParam] };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    const data = jobs.map((job) => ({
      ...redactCallbackToken(job),
      status: normalizeStatus(job.status),
      videoUrl: resolveVideoUrl(job),
    }));

    res.json({
      data,
      pagination: { page, pageSize: limit, total },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:jobId', requireAuth, requireTenantRole(['tenant_admin', 'user']), async (req, res, next) => {
  try {
    if (!req.auth?.tenantId) {
      return res.status(400).json({ error: 'Tenant missing' });
    }
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, tenantId: req.auth.tenantId },
  });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ ...redactCallbackToken(job), status: normalizeStatus(job.status), videoUrl: resolveVideoUrl(job) });
} catch (err) {
    next(err);
  }
});

router.post(
  '/jobs/:jobId/upload-video',
  largeUpload.single('video'),
  async (req: Request, res: Response) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      select: { id: true, options: true },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const expectedTokenHash = callbackTokenHashFromOptions(job.options);
    const providedToken = (req.header('x-callback-token') ?? req.header('x-internal-api-token'))?.trim();

    if (expectedTokenHash) {
      const providedBytes = parseCallbackToken(providedToken);
      if (!providedBytes) {
        return res.status(404).json({ error: 'Job not found' });
      }
      const providedHash = crypto.createHash('sha256').update(providedBytes).digest();
      const authorized = crypto.timingSafeEqual(providedHash, expectedTokenHash);
      if (!authorized) {
        return res.status(404).json({ error: 'Job not found' });
      }
    } else {
      // Backwards compatibility: jobs created before per-job callback tokens existed.
      if (!providedToken || providedToken.length < 32) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const config = await prisma.systemConfig.findUnique({
        where: { id: 'singleton' },
        select: { n8nInternalToken: true },
      });

      let expectedToken: string | null = env.n8nInternalToken?.trim() ?? null;
      if (config?.n8nInternalToken) {
        try {
          expectedToken = decrypt(config.n8nInternalToken).trim();
        } catch (_err) {
          expectedToken = null;
        }
      }

      if (!expectedToken || expectedToken.length < 32) {
        return res.status(503).json({ error: 'internal_token_not_configured' });
      }

      const providedHash = crypto.createHash('sha256').update(providedToken).digest();
      const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
      const authorized = crypto.timingSafeEqual(providedHash, expectedHash);
      if (!authorized) {
        return res.status(404).json({ error: 'Job not found' });
      }
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Missing video file' });
    }
    try {
      const metadata = req.body?.metadata
        ? (() => {
            try {
              return JSON.parse(req.body.metadata as string);
            } catch (_err) {
              return req.body.metadata;
            }
          })()
        : undefined;

      const result = await completeUgcJobFromUpload({
        jobId: req.params.jobId,
        file: req.file,
        provider: req.body?.model ?? 'sora-2',
        providerJobId: req.body?.rawProviderId ?? req.body?.providerJobId ?? null,
        durationSeconds: (req.body?.durationSeconds as string | undefined) ?? req.body?.duration_seconds,
        metadata,
      });
      res.json(result);
    } catch (err: any) {
      if (err?.message === 'job_not_found') {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (err?.message === 'job_not_in_processable_state') {
        return res.status(409).json({ error: 'Job already finalized' });
      }
      console.error('[ugc] Callback processing failed', err);
      res.status(500).json({ error: 'callback_failed' });
    }
  },
  handleLargeUploadErrors,
);

export default router;
