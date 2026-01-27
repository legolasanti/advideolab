import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/crypto';
import { downloadBufferByKey, resolveKeyFromPublicUrl, uploadBuffer } from '../lib/s3';
import { resetUsageForTenant } from '../services/quota';
import { signToken } from '../utils/jwt';
import { sendEmailTest } from '../services/email';
import { getCmsSection, setCmsValue } from '../services/cms';
import { applyPlanChange } from '../services/plan';
import { bootstrapStripePrices } from '../services/stripe';
import { createUgcJob } from '../services/ugcVideoService';
import { sanitizeImage } from '../services/imageProcessing';
import { env } from '../config/env';
import { validateUpload } from '../utils/fileValidation';
import { resolveSafeExternalTarget, UnsafeExternalUrlError } from '../utils/safeUrl';
import { JobStatus, MarketingEventType } from '@prisma/client';

const router = Router();

router.use(requireAuth, requireOwner());

const SYSTEM_CONFIG_ID = 'singleton';

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

const createOwnerJobSchema = z.object({
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

const buildDownloadName = (job: any) => {
  const raw = typeof job?.productName === 'string' ? job.productName : job?.id ?? 'ugc-video';
  const base = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || job.id || 'ugc-video'}.mp4`;
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

const resolveSandboxTenant = async () => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: SYSTEM_CONFIG_ID },
    select: { sandboxTenantId: true },
  });
  if (!config?.sandboxTenantId) return null;
  return prisma.tenant.findUnique({ where: { id: config.sandboxTenantId } });
};

router.get('/tenants', async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      planDetails: true,
      users: {
        where: { role: 'tenant_admin' },
        select: { email: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  const data = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    plan: {
      name: tenant.planDetails?.name ?? null,
      code: tenant.planDetails?.code ?? null,
      monthlyVideoLimit: tenant.monthlyVideoLimit,
      bonusCredits: tenant.bonusCredits,
      videosUsedThisCycle: tenant.videosUsedThisCycle,
      billingCycleStart: tenant.billingCycleStart,
    },
    contactEmail: tenant.users[0]?.email ?? null,
    status: tenant.status,
    requestedPlanCode: tenant.requestedPlanCode,
    createdAt: tenant.createdAt,
    billingNotes: tenant.billingNotes,
    nextBillingDate: tenant.nextBillingDate,
    paymentStatus: tenant.paymentStatus,
  }));
  res.json(data);
});

router.get('/notifications', async (_req, res) => {
  const notifications = await prisma.adminNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { tenant: true },
  });
  res.json(notifications);
});

router.post('/notifications/:notificationId/read', async (req, res) => {
  const existing = await prisma.adminNotification.findUnique({
    where: { id: req.params.notificationId },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  const notification = await prisma.adminNotification.update({
    where: { id: req.params.notificationId },
    data: { readAt: new Date() },
  });
  res.json(notification);
});

router.post('/tenants/:tenantId/approve-plan', async (req, res) => {
  const body = z
    .object({
      planCode: z.string().min(1),
      billingNotes: z.string().optional(),
      nextBillingDate: z.coerce.date().optional(),
      billingStartDate: z.coerce.date().optional(),
      activate: z.boolean().optional(),
      bonusCredits: z.coerce.number().int().min(0).optional(),
      paymentStatus: z.enum(['payment_pending', 'active_paid', 'past_due']).optional(),
    })
    .parse(req.body);

  try {
    const updated = await applyPlanChange(req.params.tenantId, body.planCode, {
      billingNotes: body.billingNotes,
      nextBillingDate: body.nextBillingDate,
      billingStartDate: body.billingStartDate,
      activate: body.activate,
      bonusCredits: body.bonusCredits,
      paymentStatus: body.paymentStatus,
    });
    res.json(updated);
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json(err.response);
    }
    throw err;
  }
});

router.post('/tenants/:tenantId/plan', async (req, res) => {
  const { planCode } = z.object({ planCode: z.string().min(1) }).parse(req.body);
  try {
    const updated = await applyPlanChange(req.params.tenantId, planCode, {
      activate: true,
      billingStartDate: new Date(),
      paymentStatus: 'active_paid',
    });
    res.json(updated);
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json(err.response);
    }
    throw err;
  }
});

router.post('/tenants/:tenantId/reset', async (req, res) => {
  await resetUsageForTenant(req.params.tenantId);
  await prisma.audit.create({
    data: {
      tenantId: req.params.tenantId,
      action: 'owner_quota_reset',
    },
  });
  res.json({ ok: true });
});

router.post('/tenants/:tenantId/suspend', async (req, res) => {
  const { suspend } = z.object({ suspend: z.boolean() }).parse(req.body);
  const tenant = await prisma.tenant.update({
    where: { id: req.params.tenantId },
    data: { status: suspend ? 'suspended' : 'active' },
  });
  res.json(tenant);
});

router.post('/tenants/:tenantId/billing', async (req, res) => {
  const body = z
    .object({
      paymentStatus: z.enum(['payment_pending', 'active_paid', 'past_due']).optional(),
      bonusCredits: z.coerce.number().int().min(0).optional(),
      nextBillingDate: z.coerce.date().optional(),
    })
    .parse(req.body);
  const tenant = await prisma.tenant.update({
    where: { id: req.params.tenantId },
    data: {
      paymentStatus: body.paymentStatus,
      bonusCredits: body.bonusCredits,
      nextBillingDate: body.nextBillingDate,
    },
  });
  await prisma.audit.create({
    data: {
      tenantId: tenant.id,
      action: 'owner_billing_update',
      details: body,
    },
  });
  res.json(tenant);
});

router.post('/tenants/:tenantId/unlimited', async (req, res) => {
  const { unlimited } = z.object({ unlimited: z.boolean() }).parse(req.body);
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.tenantId },
    include: { planDetails: true },
  });
  if (!tenant) {
    return res.status(404).json({ error: 'tenant_not_found' });
  }

  const monthlyVideoLimit = unlimited ? 0 : (tenant.planDetails?.monthlyVideoLimit ?? tenant.monthlyVideoLimit);

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { monthlyVideoLimit },
  });

  await prisma.audit.create({
    data: {
      tenantId: tenant.id,
      action: unlimited ? 'owner_unlimited_enabled' : 'owner_unlimited_disabled',
    },
  });

  return res.json(updated);
});

router.post('/impersonate', async (req, res) => {
  const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const adminUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'tenant_admin' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, tokenVersion: true },
  });
  if (!adminUser) {
    return res.status(404).json({ error: 'Tenant admin not found' });
  }

  const token = signToken({
    sub: adminUser.id,
    role: adminUser.role,
    tenantId: tenant.id,
    ownerId: req.auth?.ownerId,
    impersonatedTenantId: tenant.id,
    tokenVersion: adminUser.tokenVersion ?? 0,
  });

  await prisma.audit.create({
    data: {
      tenantId: tenant.id,
      action: 'owner_impersonate',
      details: {
        ownerId: req.auth?.ownerId ?? null,
        targetTenantId: tenant.id,
        impersonatedUserId: adminUser.id,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    },
  });

  res.json({ token, tenant });
});

router.post('/ugc/uploads/hero', upload.single('image'), async (req, res, next) => {
  try {
    const sandboxTenant = await resolveSandboxTenant();
    if (!sandboxTenant) {
      return res.status(400).json({ error: 'sandbox_not_configured' });
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
    const key = `ugc/inputs/${sandboxTenant.id}/${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${sanitized.ext}`;
    const imageUrl = await uploadBuffer(sanitized.buffer, key, contentType);

    await prisma.asset.create({
      data: {
        tenantId: sandboxTenant.id,
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
});

router.post('/ugc/jobs', async (req, res, next) => {
  try {
    const sandboxTenant = await resolveSandboxTenant();
    if (!sandboxTenant) {
      return res.status(400).json({ error: 'sandbox_not_configured' });
    }
    const parsed = createOwnerJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const payload = parsed.data;
    const result = await createUgcJob({
      tenantId: sandboxTenant.id,
      tenantName: sandboxTenant.name,
      payload,
      skipQuota: true,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/ugc/jobs', async (req, res, next) => {
  try {
    const sandboxTenant = await resolveSandboxTenant();
    if (!sandboxTenant) {
      return res.status(400).json({ error: 'sandbox_not_configured' });
    }
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where: any = { tenantId: sandboxTenant.id };
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

router.get('/ugc/jobs/:jobId', async (req, res, next) => {
  try {
    const sandboxTenant = await resolveSandboxTenant();
    if (!sandboxTenant) {
      return res.status(400).json({ error: 'sandbox_not_configured' });
    }
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, tenantId: sandboxTenant.id },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ ...redactCallbackToken(job), status: normalizeStatus(job.status), videoUrl: resolveVideoUrl(job) });
  } catch (err) {
    next(err);
  }
});

router.get('/ugc/jobs/:jobId/download', async (req, res, next) => {
  try {
    const sandboxTenant = await resolveSandboxTenant();
    if (!sandboxTenant) {
      return res.status(400).json({ error: 'sandbox_not_configured' });
    }
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, tenantId: sandboxTenant.id },
      select: { id: true, productName: true, videoUrl: true, outputs: true },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const videoUrl = resolveVideoUrl(job);
    if (!videoUrl) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const key = resolveKeyFromPublicUrl(videoUrl);
    if (!key) {
      return res.redirect(videoUrl);
    }

    const buffer = await downloadBufferByKey(key);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${buildDownloadName(job)}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/cms/:section', async (req, res) => {
  const data = await getCmsSection(req.params.section);
  res.json(data);
});

router.put('/cms/:section/:key', async (req, res) => {
  const { value } = z.object({ value: z.unknown() }).parse(req.body);
  const record = await setCmsValue(req.params.section, req.params.key, value);
  res.json({ value: record.value });
});

// Coupons
router.get('/coupons', async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(coupons);
});

router.post('/coupons', async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(1),
    type: z.enum(['percent', 'fixed']),
    value: z.coerce.number().int().min(1),
    expiresAt: z.coerce.date().optional().nullable(),
    maxUses: z.coerce.number().int().min(1).optional().nullable(),
  }).parse(req.body);

  const normalizedCode = body.code.trim().toUpperCase();
  const coupon = await prisma.coupon.create({
    data: {
      code: normalizedCode,
      type: body.type,
      value: body.value,
      expiresAt: body.expiresAt ?? undefined,
      maxUses: body.maxUses ?? null,
    },
  });
  res.json(coupon);
});

router.delete('/coupons/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Subscription cancellations
router.get('/cancellations', async (_req, res) => {
  const cancellations = await prisma.subscriptionCancellation.findMany({
    orderBy: { requestedAt: 'desc' },
    include: {
      tenant: { select: { id: true, name: true } },
      user: { select: { email: true } },
    },
  });

  const summary = {
    total: cancellations.length,
    byPlan: {} as Record<string, number>,
    byInterval: {} as Record<string, number>,
    byReason: {} as Record<string, number>,
    avgMonthsActive: 0,
  };

  let monthsSum = 0;
  let monthsCount = 0;

  const items = cancellations.map((entry) => {
    const planKey = entry.planCode ?? 'unknown';
    const intervalKey = entry.billingInterval ?? 'monthly';
    const reasonKey = entry.reason ?? 'unknown';
    summary.byPlan[planKey] = (summary.byPlan[planKey] ?? 0) + 1;
    summary.byInterval[intervalKey] = (summary.byInterval[intervalKey] ?? 0) + 1;
    summary.byReason[reasonKey] = (summary.byReason[reasonKey] ?? 0) + 1;
    if (typeof entry.monthsActive === 'number') {
      monthsSum += entry.monthsActive;
      monthsCount += 1;
    }
    return {
      id: entry.id,
      tenantId: entry.tenantId,
      tenantName: entry.tenant?.name ?? null,
      userEmail: entry.user?.email ?? null,
      planCode: entry.planCode,
      billingInterval: entry.billingInterval,
      reason: entry.reason,
      details: entry.details,
      monthsActive: entry.monthsActive,
      requestedAt: entry.requestedAt,
      effectiveAt: entry.effectiveAt,
      canceledAt: entry.canceledAt,
      stripeSubscriptionId: entry.stripeSubscriptionId,
    };
  });

  summary.avgMonthsActive = monthsCount > 0 ? Math.round((monthsSum / monthsCount) * 10) / 10 : 0;

  res.json({ summary, items });
});


// Blog / Hub
router.get('/blog', async (_req, res) => {
  const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(posts);
});

router.post('/blog', async (req, res) => {
  const body = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    content: z.string().min(1),
    excerpt: z.string().optional(),
    image: z.string().optional(),
    category: z.string().optional(),
    published: z.boolean().optional(),
  }).parse(req.body);

  const post = await prisma.blogPost.create({
    data: {
      title: body.title,
      slug: body.slug,
      content: body.content,
      excerpt: body.excerpt,
      image: body.image,
      category: body.category,
      published: body.published ?? false,
    },
  });
  res.json(post);
});

router.put('/blog/:id', async (req, res) => {
  const body = z.object({
    title: z.string().optional(),
    slug: z.string().optional(),
    content: z.string().optional(),
    excerpt: z.string().optional(),
    image: z.string().optional(),
    category: z.string().optional(),
    published: z.boolean().optional(),
  }).parse(req.body);

  const post = await prisma.blogPost.update({
    where: { id: req.params.id },
    data: body,
  });
  res.json(post);
});

router.delete('/blog/:id', async (req, res) => {
  await prisma.blogPost.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// === Global API Keys Management ===

router.get('/api-keys', async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!config?.apiKeysEncrypted) {
    return res.json({ providers: [] });
  }

  try {
    const keys = JSON.parse(decrypt(config.apiKeysEncrypted));
    const providers = Object.keys(keys).map((provider) => ({
      provider,
      configured: true,
      lastFourChars: keys[provider]?.slice(-4) ?? '****',
      updatedAt: config.updatedAt,
    }));
    return res.json({ providers });
  } catch (error) {
    console.error('[owner] Failed to decrypt API keys:', error);
    return res.json({ providers: [] });
  }
});

router.post('/api-keys', async (req, res) => {
  const body = z
    .object({
      provider: z.string().min(1),
      key: z.string().min(1),
    })
    .parse(req.body);

  const config = await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  let keys: Record<string, string> = {};
  if (config.apiKeysEncrypted) {
    try {
      keys = JSON.parse(decrypt(config.apiKeysEncrypted));
    } catch (error) {
      console.error('[owner] Failed to decrypt existing API keys:', error);
    }
  }

  keys[body.provider] = body.key;

  await prisma.systemConfig.update({
    where: { id: 'singleton' },
    data: { apiKeysEncrypted: encrypt(JSON.stringify(keys)) },
  });

  res.json({ ok: true, provider: body.provider });
});

router.delete('/api-keys/:provider', async (req, res) => {
  const { provider } = req.params;

  const config = await prisma.systemConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!config?.apiKeysEncrypted) {
    return res.status(404).json({ error: 'API keys not configured' });
  }

  try {
    const keys = JSON.parse(decrypt(config.apiKeysEncrypted));
    delete keys[provider];

    await prisma.systemConfig.update({
      where: { id: 'singleton' },
      data: {
        apiKeysEncrypted: Object.keys(keys).length > 0 ? encrypt(JSON.stringify(keys)) : null,
      },
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('[owner] Failed to delete API key:', error);
    return res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// === Global n8n Configuration ===

router.get('/n8n-config', async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: 'singleton' },
  });

  res.json({
    n8nBaseUrl: config?.n8nBaseUrl ?? null,
    n8nProcessPath: config?.n8nProcessPath ?? null,
    n8nInternalTokenSet: Boolean(config?.n8nInternalToken),
  });
});

router.put('/n8n-config', async (req, res) => {
  const body = z
    .object({
      n8nBaseUrl: z.string().url().optional().nullable(),
      n8nProcessPath: z.string().optional().nullable(),
      n8nInternalToken: z.string().optional().nullable(),
    })
    .parse(req.body);

  const updateData: any = {};

  if (body.n8nBaseUrl !== undefined) {
    updateData.n8nBaseUrl = body.n8nBaseUrl?.trim() || null;
  }

  if (body.n8nProcessPath !== undefined) {
    updateData.n8nProcessPath = body.n8nProcessPath?.trim() || null;
  }

  if (updateData.n8nBaseUrl && updateData.n8nProcessPath) {
    if (!String(updateData.n8nProcessPath).startsWith('/')) {
      return res.status(400).json({ error: 'n8n_process_path_invalid' });
    }
    const allowlist = (env.n8nHostAllowlist ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean);
    const url = new URL(String(updateData.n8nProcessPath), String(updateData.n8nBaseUrl)).toString();
    try {
      await resolveSafeExternalTarget(url, {
        allowHttp: !env.isProd,
        allowedHostnames: allowlist,
        isProd: env.isProd,
      });
    } catch (err: any) {
      const message = err instanceof UnsafeExternalUrlError ? err.message : 'Invalid n8n URL';
      return res.status(400).json({ error: 'n8n_url_invalid', message });
    }
  }

  if (body.n8nInternalToken !== undefined) {
    const token = body.n8nInternalToken?.trim();
    if (token && token.length < 32) {
      return res.status(400).json({ error: 'n8n_internal_token_too_short' });
    }
    updateData.n8nInternalToken = token ? encrypt(token) : null;
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: updateData,
    create: { id: 'singleton', ...updateData },
  });

  res.json({
    n8nBaseUrl: config.n8nBaseUrl,
    n8nProcessPath: config.n8nProcessPath,
    n8nInternalTokenSet: Boolean(config.n8nInternalToken),
  });
});

// === Owner Analytics ===

const parseDateParam = (value?: string | string[] | null) => {
  if (!value || Array.isArray(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

router.get('/analytics', async (req, res) => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let start = parseDateParam(req.query.start as string) ?? defaultStart;
  let end = parseDateParam(req.query.end as string) ?? now;

  if (end < start) {
    const temp = start;
    start = end;
    end = temp;
  }

  const range = { gte: start, lte: end };

  const [
    activeTenants,
    newSignups,
    churnCount,
    completedVideos,
    activeTenantsWithPlan,
    activePaidTenants,
  ] = await Promise.all([
    prisma.tenant.count({ where: { status: 'active' } }),
    prisma.tenant.count({ where: { createdAt: range } }),
    prisma.subscriptionCancellation.count({ where: { requestedAt: range } }),
    prisma.job.count({
      where: {
        status: { in: [JobStatus.completed, JobStatus.done] },
        finishedAt: range,
      },
    }),
    prisma.tenant.findMany({
      where: { status: 'active' },
      include: { planDetails: true },
    }),
    prisma.tenant.findMany({
      where: { status: 'active', paymentStatus: 'active_paid', planId: { not: null } },
      include: { planDetails: true },
    }),
  ]);

  const planCounts: Record<string, number> = {};
  for (const tenant of activeTenantsWithPlan) {
    const planCode = tenant.planDetails?.code ?? 'unknown';
    planCounts[planCode] = (planCounts[planCode] ?? 0) + 1;
  }

  const planTotal = Object.values(planCounts).reduce((sum, count) => sum + count, 0);
  const planDistribution = Object.entries(planCounts).map(([planCode, count]) => ({
    planCode,
    count,
    percent: planTotal > 0 ? Math.round((count / planTotal) * 1000) / 10 : 0,
  }));

  const ANNUAL_MRR_MULTIPLIER = 10 / 12;
  const mrrUsd = activePaidTenants.reduce((sum, tenant) => {
    const monthlyPrice = tenant.planDetails?.monthlyPriceUsd ?? 0;
    if (!monthlyPrice) return sum;
    const multiplier = tenant.billingInterval === 'annual' ? ANNUAL_MRR_MULTIPLIER : 1;
    return sum + monthlyPrice * multiplier;
  }, 0);

  const funnelTypes: MarketingEventType[] = [
    MarketingEventType.visit,
    MarketingEventType.signup_started,
    MarketingEventType.checkout_started,
    MarketingEventType.payment_completed,
  ];

  const funnelCounts = await Promise.all(
    funnelTypes.map(async (eventType) => {
      const sessions = await prisma.marketingEvent.findMany({
        where: { eventType, createdAt: range },
        distinct: ['sessionId'],
        select: { sessionId: true },
      });
      return sessions.length;
    }),
  );

  const visitTotal = funnelCounts[0] ?? 0;
  const funnel = funnelTypes.map((eventType, index) => ({
    eventType,
    count: funnelCounts[index] ?? 0,
    percent: visitTotal > 0 ? Math.round(((funnelCounts[index] ?? 0) / visitTotal) * 1000) / 10 : 0,
  }));

  const sourceRows = await prisma.marketingEvent.groupBy({
    by: ['utmSource', 'utmMedium', 'utmCampaign'],
    where: { eventType: MarketingEventType.visit, createdAt: range },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const referrerRows = await prisma.marketingEvent.groupBy({
    by: ['referrer'],
    where: { eventType: MarketingEventType.visit, createdAt: range },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const marketingSources = sourceRows.map((row) => ({
    source: row.utmSource ?? 'direct',
    medium: row.utmMedium ?? 'none',
    campaign: row.utmCampaign ?? '—',
    sessions: row._count?.id ?? 0,
  }));

  const referrers = referrerRows.map((row) => ({
    referrer: row.referrer ?? 'Direct',
    sessions: row._count?.id ?? 0,
  }));

  const churnRate = activeTenants > 0 ? Math.round((churnCount / activeTenants) * 1000) / 10 : 0;

  res.json({
    range: { start, end },
    metrics: {
      activeTenants,
      mrrUsd: Math.round(mrrUsd * 100) / 100,
      newSignups,
      churnCount,
      churnRate,
      totalVideos: completedVideos,
    },
    planDistribution: {
      total: planTotal,
      items: planDistribution,
    },
    funnel,
    marketing: {
      sources: marketingSources,
      referrers,
    },
  });
});

// === All Users Management ===

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: {
      tenant: {
        include: { planDetails: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const data = users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    tenant: {
      id: u.tenant.id,
      name: u.tenant.name,
      plan: u.tenant.planDetails?.name ?? null,
      status: u.tenant.status,
    },
  }));

  res.json({ users: data });
});

const normalizeNullableString = (value?: string | null) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const serializeSystemConfig = (config: any) => ({
  smtpHost: config.smtpHost ?? null,
  smtpPort: config.smtpPort ?? null,
  smtpUser: config.smtpUser ?? null,
  smtpPassSet: Boolean(config.smtpPassEncrypted),
  emailFrom: config.emailFrom ?? null,
  notificationEmail: config.notificationEmail ?? null,
  stripePublishableKey: config.stripePublishableKey ?? null,
  stripeSecretKeySet: Boolean(config.stripeSecretKeyEncrypted),
  stripeWebhookSecretSet: Boolean(config.stripeWebhookSecretEncrypted),
  stripePriceIdStarter: config.stripePriceIdStarter ?? null,
  stripePriceIdGrowth: config.stripePriceIdGrowth ?? null,
  stripePriceIdScale: config.stripePriceIdScale ?? null,
  stripePriceIdStarterAnnual: config.stripePriceIdStarterAnnual ?? null,
  stripePriceIdGrowthAnnual: config.stripePriceIdGrowthAnnual ?? null,
  stripePriceIdScaleAnnual: config.stripePriceIdScaleAnnual ?? null,
  sandboxTenantId: config.sandboxTenantId ?? null,
  customHeadCode: config.customHeadCode ?? null,
  customBodyStart: config.customBodyStart ?? null,
  customBodyEnd: config.customBodyEnd ?? null,
  googleOAuthClientId: config.googleOAuthClientId ?? null,
  googleOAuthClientSecretSet: Boolean(config.googleOAuthClientSecretEncrypted),
  googleOAuthRedirectUri: `${env.API_PUBLIC_URL}/api/auth/google/callback`,
  updatedAt: config.updatedAt,
});

router.get('/system-config', async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: {},
    create: { id: SYSTEM_CONFIG_ID },
  });
  res.json(serializeSystemConfig(config));
});

router.put('/system-config', async (req, res) => {
  const body = z
    .object({
      smtpHost: z.string().optional().nullable(),
      smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
      smtpUser: z.string().optional().nullable(),
      smtpPass: z.string().optional().nullable(),
      emailFrom: z.string().optional().nullable(),
      notificationEmail: z.string().optional().nullable(),
      stripePublishableKey: z.string().optional().nullable(),
      stripeSecretKey: z.string().optional().nullable(),
      stripeWebhookSecret: z.string().optional().nullable(),
      stripePriceIdStarter: z.string().optional().nullable(),
      stripePriceIdGrowth: z.string().optional().nullable(),
      stripePriceIdScale: z.string().optional().nullable(),
      stripePriceIdStarterAnnual: z.string().optional().nullable(),
      stripePriceIdGrowthAnnual: z.string().optional().nullable(),
      stripePriceIdScaleAnnual: z.string().optional().nullable(),
      sandboxTenantId: z.string().optional().nullable(),
      customHeadCode: z.string().optional().nullable(),
      customBodyStart: z.string().optional().nullable(),
      customBodyEnd: z.string().optional().nullable(),
      googleOAuthClientId: z.string().optional().nullable(),
      googleOAuthClientSecret: z.string().optional().nullable(),
    })
    .parse(req.body);

  const updateData: any = {
    smtpHost: normalizeNullableString(body.smtpHost),
    smtpPort: body.smtpPort === undefined ? undefined : body.smtpPort,
    smtpUser: normalizeNullableString(body.smtpUser),
    emailFrom: normalizeNullableString(body.emailFrom),
    notificationEmail: normalizeNullableString(body.notificationEmail),
    stripePublishableKey: normalizeNullableString(body.stripePublishableKey),
    stripePriceIdStarter: normalizeNullableString(body.stripePriceIdStarter),
    stripePriceIdGrowth: normalizeNullableString(body.stripePriceIdGrowth),
    stripePriceIdScale: normalizeNullableString(body.stripePriceIdScale),
    stripePriceIdStarterAnnual: normalizeNullableString(body.stripePriceIdStarterAnnual),
    stripePriceIdGrowthAnnual: normalizeNullableString(body.stripePriceIdGrowthAnnual),
    stripePriceIdScaleAnnual: normalizeNullableString(body.stripePriceIdScaleAnnual),
    sandboxTenantId: normalizeNullableString(body.sandboxTenantId),
    customHeadCode: normalizeNullableString(body.customHeadCode),
    customBodyStart: normalizeNullableString(body.customBodyStart),
    customBodyEnd: normalizeNullableString(body.customBodyEnd),
    googleOAuthClientId: normalizeNullableString(body.googleOAuthClientId),
  };

  if (body.smtpPass !== undefined) {
    const pass = (body.smtpPass ?? '').trim();
    updateData.smtpPassEncrypted = pass.length > 0 ? encrypt(pass) : null;
  }

  if (body.stripeSecretKey !== undefined) {
    const key = (body.stripeSecretKey ?? '').trim();
    updateData.stripeSecretKeyEncrypted = key.length > 0 ? encrypt(key) : null;
  }

  if (body.stripeWebhookSecret !== undefined) {
    const secret = (body.stripeWebhookSecret ?? '').trim();
    updateData.stripeWebhookSecretEncrypted = secret.length > 0 ? encrypt(secret) : null;
  }

  if (body.googleOAuthClientSecret !== undefined) {
    const secret = (body.googleOAuthClientSecret ?? '').trim();
    updateData.googleOAuthClientSecretEncrypted = secret.length > 0 ? encrypt(secret) : null;
  }

  Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

  if (updateData.sandboxTenantId) {
    const exists = await prisma.tenant.findUnique({ where: { id: updateData.sandboxTenantId } });
    if (!exists) {
      return res.status(400).json({ error: 'sandbox_tenant_not_found' });
    }
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: updateData,
    create: { id: SYSTEM_CONFIG_ID, ...updateData },
  });

  res.json(serializeSystemConfig(config));
});

router.post('/stripe/bootstrap', async (_req, res) => {
  const prices = await bootstrapStripePrices();
  const config = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: {},
    create: { id: SYSTEM_CONFIG_ID },
  });
  res.json({ ...serializeSystemConfig(config), ...prices });
});

router.post('/system-config/test-email', async (_req, res) => {
  const ok = await sendEmailTest();
  if (!ok) {
    return res.status(500).json({ ok: false });
  }
  return res.json({ ok: true });
});

// === Showcase Videos Management ===

router.get('/showcase-videos', async (_req, res) => {
  const videos = await prisma.showcaseVideo.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  res.json(videos);
});

router.post('/showcase-videos', async (req, res) => {
  const body = z.object({
    title: z.string().optional().nullable(),
    videoUrl: z.string().url().min(1),
    thumbnailUrl: z.string().url().optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }).parse(req.body);

  const video = await prisma.showcaseVideo.create({
    data: {
      title: body.title ?? null,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    },
  });
  res.json(video);
});

router.put('/showcase-videos/:id', async (req, res) => {
  const body = z.object({
    title: z.string().optional().nullable(),
    videoUrl: z.string().url().optional(),
    thumbnailUrl: z.string().url().optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }).parse(req.body);

  const existing = await prisma.showcaseVideo.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const video = await prisma.showcaseVideo.update({
    where: { id: req.params.id },
    data: {
      title: body.title !== undefined ? body.title : undefined,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl !== undefined ? body.thumbnailUrl : undefined,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    },
  });
  res.json(video);
});

router.delete('/showcase-videos/:id', async (req, res) => {
  const existing = await prisma.showcaseVideo.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Video not found' });
  }
  await prisma.showcaseVideo.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.post('/showcase-videos/reorder', async (req, res) => {
  const body = z.object({
    orderedIds: z.array(z.string().min(1)),
  }).parse(req.body);

  await prisma.$transaction(
    body.orderedIds.map((id, index) =>
      prisma.showcaseVideo.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  const videos = await prisma.showcaseVideo.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  res.json(videos);
});

export default router;
