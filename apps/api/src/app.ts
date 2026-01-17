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
morgan.token('safe-url', (req) => (req.originalUrl ?? req.url ?? '').split('?')[0]);
app.use(
  morgan(
    env.isProd
      ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
      : ':method :safe-url :status :res[content-length] - :response-time ms',
  ),
);
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
