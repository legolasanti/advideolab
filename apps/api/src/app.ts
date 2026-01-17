import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import stripeWebhookRoutes from './routes/stripeWebhook';
import { tenantResolver } from './middleware/tenantResolver';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Stripe requires the raw request body for webhook signature verification.
app.use('/api/billing/stripe', stripeWebhookRoutes);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use(authenticate);
app.use(tenantResolver);

app.use('/api', routes);

app.use(errorHandler);

export default app;
