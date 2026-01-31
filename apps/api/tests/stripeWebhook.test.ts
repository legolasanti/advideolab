import express from 'express';
import request from 'supertest';
import stripeWebhookRoutes from '../src/routes/stripeWebhook';
import { HttpError } from '../src/middleware/errorHandler';

const processStripeWebhook = jest.fn();

jest.mock('../src/services/stripe', () => ({
  processStripeWebhook: (...args: any[]) => processStripeWebhook(...args),
}));

const buildApp = () => {
  const app = express();
  app.use('/api/billing/stripe', stripeWebhookRoutes);
  return app;
};

describe('stripe webhook route', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    processStripeWebhook.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('rejects missing signature', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_stripe_signature' });
  });

  it('accepts valid signature and processes webhook', async () => {
    processStripeWebhook.mockResolvedValue({ received: true });
    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=123,v1=signature')
      .send('{"id":"evt_test"}');
    expect(processStripeWebhook).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('maps HttpError to status code', async () => {
    processStripeWebhook.mockRejectedValue(new HttpError(401, 'stripe_signature_invalid'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/billing/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=123,v1=signature')
      .send('{}');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'stripe_signature_invalid' });
  });
});
