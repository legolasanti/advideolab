import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  createJob,
  completeJobWithOutputs,
  markJobError,
  WorkflowConfigurationError,
  persistOutputsToStorage,
} from '../services/jobService';
import { prisma } from '../lib/prisma';
import {
  incrementUsageOnSuccess,
  ensureTenantReadyForUsage,
  QuotaExceededError,
  TenantBlockedError,
  BillingPeriodExpiredError,
} from '../services/quota';

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

const sanitizeChoice = (value: unknown, fallback: string, allowed: Set<string>) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
};

const callbackSchema = z.object({
  status: z.enum(['done', 'error']),
  outputs: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.string().optional(),
        size: z.number().int().nonnegative().optional(),
        thumbnailUrl: z.string().url().optional(),
        durationSeconds: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  errorMessage: z.string().optional(),
});

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
    data: jobs,
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
  res.json(job);
});

router.post('/jobs/:id/callback', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
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

  let storedOutputs;
  try {
    storedOutputs = await persistOutputsToStorage(job.tenantId, job.id, outputs);
  } catch (err) {
    console.error('[callback] failed to persist outputs', err);
    return res.status(500).json({ error: 'output_persist_failed' });
  }

  await completeJobWithOutputs(job.id, job.tenantId, storedOutputs);
  const jobOptions =
    job && typeof job.options === 'object' && job.options !== null ? (job.options as { videoCount?: number }) : {};
  const completedCount = typeof jobOptions.videoCount === 'number' ? jobOptions.videoCount : 1;
  await incrementUsageOnSuccess(job.tenantId, completedCount);
  res.json({ ok: true });
});

router.post('/jobs/:id/rerun', requireAuth, requireTenantRole(['tenant_admin']), async (req, res) => {
  if (!req.auth?.tenantId) {
    return res.status(400).json({ error: 'Tenant missing' });
  }
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, tenantId: req.auth.tenantId },
  });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (!job.inputAssetId) {
    return res.status(400).json({ error: 'Original input unavailable' });
  }

  // For MVP we simply duplicate options and rely on front-end to re-upload when needed.
  return res.status(501).json({ error: 'Re-run not implemented in this build' });
});

export default router;
