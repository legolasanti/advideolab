import { Router } from 'express';
import express from 'express';
import { processStripeWebhook } from '../services/stripe';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

// Stripe webhook with strict body size limit (1MB max)
// This prevents memory exhaustion attacks while allowing legitimate Stripe events
router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    return res.status(400).json({ error: 'missing_stripe_signature' });
  }

  try {
    await processStripeWebhook(req.body as Buffer, signature);
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[stripe][webhook] error', err);
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(400).json({ error: err?.message ?? 'webhook_failed' });
  }
});

export default router;
