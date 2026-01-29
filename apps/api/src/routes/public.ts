import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getCmsSection } from '../services/cms';
import { getEmailStatus, sendOwnerContactNotification, sendContactConfirmation, sendEnterpriseContactNotification, sendEnterpriseContactConfirmation } from '../services/email';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { trackMarketingEvent } from '../services/marketing';
import { hashPassword } from '../services/password';
import { MarketingEventType } from '@prisma/client';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: env.isProd ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(10),
  source: z.string().min(1).optional(),
});

const enterpriseContactSchema = z.object({
  name: z.string().min(2).max(128),
  email: z.string().email().max(255),
  phone: z.string().max(32).optional().nullable(),
  companyName: z.string().max(255).optional().nullable(),
  website: z.string().url().max(512).optional().nullable().or(z.literal('')),
  message: z.string().max(2000).optional().nullable(),
});

const analyticsEventSchema = z.object({
  eventType: z.enum(
    [
      MarketingEventType.visit,
      MarketingEventType.signup_started,
      MarketingEventType.signup_completed,
      MarketingEventType.checkout_started,
      MarketingEventType.payment_completed,
    ] as const,
  ),
  sessionId: z.string().min(8).max(128),
  utmSource: z.string().max(128).optional().nullable(),
  utmMedium: z.string().max(128).optional().nullable(),
  utmCampaign: z.string().max(128).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
  landingPage: z.string().max(2048).optional().nullable(),
});

router.get('/cms/:section', async (req, res) => {
  const data = await getCmsSection(req.params.section);
  res.json(data);
});

router.get('/system-config', async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const googleEnabled = Boolean(config.googleOAuthClientId && config.googleOAuthClientSecretEncrypted);
  res.json({
    customHeadCode: config.customHeadCode ?? null,
    customBodyStart: config.customBodyStart ?? null,
    customBodyEnd: config.customBodyEnd ?? null,
    googleOAuthClientId: googleEnabled ? config.googleOAuthClientId : null,
  });
});

router.post('/analytics/event', async (req, res) => {
  try {
    const payload = analyticsEventSchema.parse(req.body);
    await trackMarketingEvent({
      eventType: payload.eventType,
      sessionId: payload.sessionId,
      utmSource: payload.utmSource ?? null,
      utmMedium: payload.utmMedium ?? null,
      utmCampaign: payload.utmCampaign ?? null,
      referrer: payload.referrer ?? null,
      landingPage: payload.landingPage ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, issues: err.issues });
    }
    console.error('[analytics] event capture failed', err);
  }
  return res.json({ ok: true });
});

router.post('/contact', contactLimiter, async (req, res) => {
  try {
    const payload = contactSchema.parse(req.body);
    const source = payload.source ?? '/contact';
    const { configured, notificationEmail: target } = await getEmailStatus();
    console.info('[contact] inbound marketing request', { source, configured: Boolean(target) });

    if (!configured) {
      console.error('[contact] SMTP not configured');
      return res.status(500).json({ ok: false, error: 'email_not_configured' });
    }

    // Send notification to admin
    await sendOwnerContactNotification({
      name: payload.name,
      email: payload.email,
      company: payload.company,
      message: payload.message,
      source,
    });

    // Send confirmation to user
    await sendContactConfirmation({
      email: payload.email,
      name: payload.name,
    });

    return res.json({ ok: true, message: 'Thanks! We received your message and sent you a confirmation email.' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, issues: err.issues });
    }
    console.error('[contact] send failed', err);
    return res.status(500).json({ ok: false, error: 'contact_failed' });
  }
});

// Enterprise Contact Form
router.post('/enterprise-contact', contactLimiter, async (req, res) => {
  try {
    const payload = enterpriseContactSchema.parse(req.body);
    const { configured, notificationEmail: target } = await getEmailStatus();
    console.info('[enterprise-contact] inbound inquiry', { email: payload.email, company: payload.companyName, configured: Boolean(target) });

    // Save to database
    await prisma.enterpriseContactRequest.create({
      data: {
        email: payload.email,
        name: payload.name,
        phone: payload.phone || null,
        companyName: payload.companyName || null,
        website: payload.website || null,
        message: payload.message || null,
        source: 'pricing_page',
      },
    });

    if (!configured) {
      console.warn('[enterprise-contact] SMTP not configured, saved to DB only');
      return res.json({ ok: true, message: 'Thanks! We received your inquiry and will contact you soon.' });
    }

    // Send notification to admin
    await sendEnterpriseContactNotification({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      companyName: payload.companyName,
      website: payload.website,
      message: payload.message,
    });

    // Send confirmation to user
    await sendEnterpriseContactConfirmation({
      email: payload.email,
      name: payload.name,
    });

    return res.json({ ok: true, message: 'Thanks! We received your inquiry and will contact you within 24 hours.' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, issues: err.issues });
    }
    console.error('[enterprise-contact] failed', err);
    return res.status(500).json({ ok: false, error: 'enterprise_contact_failed' });
  }
});

// Blog Public Endpoints
router.get('/blog', async (req, res) => {
  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(posts);
});

router.get('/blog/:slug', async (req, res) => {
  const post = await prisma.blogPost.findUnique({
    where: { slug: req.params.slug },
  });
  const previewToken = typeof req.query.previewToken === 'string' ? req.query.previewToken.trim() : null;
  const ownerPreview = req.auth?.role === 'owner_superadmin';
  const tokenPreview = (() => {
    const expected = env.blogPreviewToken?.trim();
    if (!expected || expected.length < 32) return false;
    if (!previewToken || previewToken.length < 32) return false;
    const providedHash = crypto.createHash('sha256').update(previewToken).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(providedHash, expectedHash);
  })();

  if (!post || (!post.published && !ownerPreview && !tokenPreview)) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json(post);
});

// Showcase Videos (for landing page)
router.get('/showcase-videos', async (_req, res) => {
  const videos = await prisma.showcaseVideo.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json(videos);
});

// Coupon Validation Endpoint
router.post('/coupons/validate', async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const coupon = await prisma.coupon.findUnique({ where: { code } });

  if (!coupon || !coupon.isActive) {
    return res.status(404).json({ valid: false, error: 'Invalid coupon' });
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return res.status(400).json({ valid: false, error: 'Coupon expired' });
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return res.status(400).json({ valid: false, error: 'Coupon usage limit reached' });
  }

  res.json({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
  });
});

// Enterprise Invitation - Validate token
router.get('/enterprise-invitation/:token', async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  // Hash the token to compare with stored hash
  const tokenHash = crypto.createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

  const invitation = await prisma.enterpriseInvitation.findUnique({
    where: { tokenHash },
  });

  if (!invitation) {
    return res.status(404).json({ error: 'invitation_not_found' });
  }

  if (invitation.status === 'cancelled') {
    return res.status(400).json({ error: 'invitation_cancelled' });
  }

  if (invitation.status === 'accepted') {
    return res.status(400).json({ error: 'invitation_already_accepted' });
  }

  if (invitation.expiresAt < new Date()) {
    // Mark as expired if not already
    if (invitation.status !== 'expired') {
      await prisma.enterpriseInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
    }
    return res.status(400).json({ error: 'invitation_expired' });
  }

  res.json({
    id: invitation.id,
    email: invitation.email,
    companyName: invitation.companyName,
    customMonthlyPriceUsd: invitation.customMonthlyPriceUsd,
    customAnnualPriceUsd: invitation.customAnnualPriceUsd,
    billingInterval: invitation.billingInterval,
    maxSubCompanies: invitation.maxSubCompanies,
    maxAdditionalUsers: invitation.maxAdditionalUsers,
    totalVideoCredits: invitation.totalVideoCredits,
    expiresAt: invitation.expiresAt,
  });
});

// Enterprise Invitation - Accept and create account
const acceptInvitationSchema = z.object({
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(128).optional(),
  billingInterval: z.enum(['monthly', 'annual']).optional(),
});

router.post('/enterprise-invitation/:token/accept', contactLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  let body;
  try {
    body = acceptInvitationSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    throw err;
  }

  // Hash the token
  const tokenHash = crypto.createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

  const invitation = await prisma.enterpriseInvitation.findUnique({
    where: { tokenHash },
  });

  if (!invitation) {
    return res.status(404).json({ error: 'invitation_not_found' });
  }

  if (invitation.status !== 'pending') {
    return res.status(400).json({ error: `invitation_${invitation.status}` });
  }

  if (invitation.expiresAt < new Date()) {
    await prisma.enterpriseInvitation.update({
      where: { id: invitation.id },
      data: { status: 'expired' },
    });
    return res.status(400).json({ error: 'invitation_expired' });
  }

  // Check if email is already registered
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });

  if (existingUser) {
    return res.status(400).json({ error: 'email_already_registered' });
  }

  // Hash password
  const passwordHash = await hashPassword(body.password);

  // Create tenant and user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create enterprise tenant
    const tenant = await tx.tenant.create({
      data: {
        name: invitation.companyName,
        status: 'pending', // Will be activated after payment
        tenantType: 'enterprise',
      },
    });

    // Create enterprise settings
    await tx.enterpriseSettings.create({
      data: {
        tenantId: tenant.id,
        maxSubCompanies: invitation.maxSubCompanies,
        maxAdditionalUsers: invitation.maxAdditionalUsers,
        totalVideoCredits: invitation.totalVideoCredits,
        customMonthlyPriceUsd: invitation.customMonthlyPriceUsd,
      },
    });

    // Create admin user
    const user = await tx.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        emailVerifiedAt: new Date(), // Skip verification for enterprise
        role: 'tenant_admin',
        tenantId: tenant.id,
      },
    });

    // Update invitation
    await tx.enterpriseInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        createdTenantId: tenant.id,
      },
    });

    return { tenant, user };
  });

  // TODO: Create Stripe checkout session for enterprise pricing
  // For now, return success and let them log in
  // The payment flow will be handled separately

  res.json({
    success: true,
    message: 'Account created successfully. Please proceed to payment.',
    tenantId: result.tenant.id,
    userId: result.user.id,
    email: result.user.email,
    // In a full implementation, you would return a Stripe checkout URL here
  });
});

// Checkout Status - public endpoint for checking checkout completion
// Used when user returns from Stripe but may not have valid auth token
router.get('/checkout-status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || sessionId.length < 10) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }

  // Find tenant by checkout session ID
  const tenant = await prisma.tenant.findFirst({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      requestedPlanCode: true,
    },
  });

  if (!tenant) {
    // Tenant not found - might still be processing
    return res.json({
      found: false,
      status: 'processing',
      message: 'Payment is being processed. Please wait.',
    });
  }

  const isActive = tenant.status === 'active' && tenant.paymentStatus === 'active_paid';

  res.json({
    found: true,
    tenantId: tenant.id,
    status: tenant.status,
    paymentStatus: tenant.paymentStatus,
    planCode: tenant.requestedPlanCode,
    isActive,
    message: isActive
      ? 'Your account is active. Please log in to continue.'
      : 'Payment is being processed. Please wait.',
  });
});

export default router;
