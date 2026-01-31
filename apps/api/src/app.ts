import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import routes from './routes';
import stripeWebhookRoutes from './routes/stripeWebhook';
import { tenantResolver } from './middleware/tenantResolver';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = express();
const sentryEnabled = Boolean(env.sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: env.sentryDsn ?? undefined,
    environment: env.sentryEnvironment ?? env.NODE_ENV,
    tracesSampleRate: env.sentryTracesSampleRate ?? (env.isProd ? 0.1 : 1.0),
  });
}

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

const normalizeOrigin = (value: string) => {
  const trimmed = value.trim().replace(/\/$/, '');
  try {
    return new URL(trimmed).origin;
  } catch (_err) {
    return trimmed;
  }
};
const resolvedAllowedOrigins = (() => {
  const configured = (env.allowedOrigins ?? '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
  const fallback = (() => {
    try {
      return new URL(env.WEB_BASE_URL).origin;
    } catch (_err) {
      return null;
    }
  })();
  return new Set<string>([...configured, ...(fallback ? [fallback] : [])]);
})();

if (sentryEnabled) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

app.use(helmet());
app.use(
  cors({
    origin: env.isProd
      ? (origin, callback) => {
          if (!origin) return callback(null, false);
          callback(null, resolvedAllowedOrigins.has(normalizeOrigin(origin)));
        }
      : true,
    credentials: true,
  }),
);

// Stripe requires the raw request body for webhook signature verification.
app.use('/api/billing/stripe', stripeWebhookRoutes);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb', parameterLimit: 1000 }));
morgan.token('safe-url', (req: any) => String(req.originalUrl ?? req.url ?? '').split('?')[0]);
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
    keyGenerator: (req: any) => ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown'),
  }),
);

// Health check endpoint for container orchestration
// Returns 200 only if API is ready (including DB connectivity)
app.get('/healthz', async (_req, res) => {
  const checks: { database: boolean; timestamp: string } = {
    database: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Fast DB connectivity check (< 5s timeout handled by Prisma)
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    console.error('[healthz] Database check failed:', err);
  }

  const healthy = checks.database;
  return res.status(healthy ? 200 : 503).json({ ok: healthy, checks });
});

app.use(authenticate);
app.use(tenantResolver);

app.use('/api', routes);

if (sentryEnabled) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(errorHandler);

export default app;
