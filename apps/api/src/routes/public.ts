import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getCmsSection } from '../services/cms';
import { getEmailStatus, sendOwnerContactNotification } from '../services/email';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(10),
  source: z.string().min(1).optional(),
});

router.get('/cms/:section', async (req, res) => {
  const data = await getCmsSection(req.params.section);
  res.json(data);
});

router.post('/contact', async (req, res) => {
  try {
    const payload = contactSchema.parse(req.body);
    const source = payload.source ?? '/contact';
    const { notificationEmail: target } = await getEmailStatus();
    console.info('[contact] inbound marketing request', { target, payload });
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

  res.json({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
  });
});

export default router;
