import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/crypto';
import { resetUsageForTenant } from '../services/quota';
import { signToken } from '../utils/jwt';
import { sendEmailTest } from '../services/email';
import { getCmsSection, setCmsValue } from '../services/cms';
import { applyPlanChange } from '../services/plan';
import { bootstrapStripePrices } from '../services/stripe';

const router = Router();

router.use(requireAuth, requireOwner());

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
    select: { id: true, role: true },
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
  });

  res.json({ token, tenant });
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
    code: z.string().min(1),
    type: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1),
    expiresAt: z.coerce.date().optional(),
  }).parse(req.body);

  const coupon = await prisma.coupon.create({
    data: {
      code: body.code,
      type: body.type,
      value: body.value,
      expiresAt: body.expiresAt,
    },
  });
  res.json(coupon);
});

router.delete('/coupons/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
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

const SYSTEM_CONFIG_ID = 'singleton';

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
  sandboxTenantId: config.sandboxTenantId ?? null,
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
      sandboxTenantId: z.string().optional().nullable(),
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
    sandboxTenantId: normalizeNullableString(body.sandboxTenantId),
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

export default router;
