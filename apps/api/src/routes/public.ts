import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getCmsSection } from '../services/cms';
import { getEmailStatus, sendOwnerContactNotification } from '../services/email';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { trackMarketingEvent } from '../services/marketing';
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
    const { notificationEmail: target } = await getEmailStatus();
    console.info('[contact] inbound marketing request', { source, configured: Boolean(target) });
    await sendOwnerContactNotification({
      name: payload.name,
      email: payload.email,
      company: payload.company,
      message: payload.message,
      source,
    });
    return res.json({ ok: true, message: 'Thanks! We received your message.' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, issues: err.issues });
    }
    console.error('[contact] send failed', err);
    return res.status(500).json({ ok: false, error: 'contact_failed' });
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

export default router;
