import { Router } from 'express';
import express from 'express';
import { processStripeWebhook } from '../services/stripe';

const router = Router();

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    return res.status(400).json({ error: 'missing_stripe_signature' });
  }

  try {
    await processStripeWebhook(req.body as Buffer, signature);
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[stripe][webhook] error', err);
    return res.status(400).json({ error: err?.message ?? 'webhook_failed' });
  }
});

export default router;

