import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().optional(),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  JWT_ENFORCE_ISS_AUD: z.enum(['true', 'false']).default('false'),
  S3_ENDPOINT: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  PUBLIC_CDN_BASE: z.string(),
  S3_OBJECT_ACL: z.enum(['private', 'public-read']).optional(),
  API_PUBLIC_URL: z.string().url(),
  COMPOSE_SERVICE_URL: z.string().optional(),
  COMPOSE_INTERNAL_TOKEN: z.string().min(32).optional(),
  USE_CLOUDINARY: z.enum(['true', 'false']).default('false'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  N8N_SYNC: z.enum(['true', 'false']).default('false'),
  // Legacy env vars (kept optional; prefer SystemConfig-managed settings).
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_INTERNAL_TOKEN: z.string().optional(),
  N8N_HOST_ALLOWLIST: z.string().optional(),
  N8N_TRUSTED_HOST_ALLOWLIST: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(32).transform((value) => value.trim()),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX: z.string().default('100'),
  ALLOW_CALLBACK_TOKEN_QUERY: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  OWNER_NOTIFY_EMAIL: z.string().optional(),
  OWNER_NOTIFICATION_EMAIL: z.string().optional(),
  WEB_BASE_URL: z.string().url().default('http://localhost:4173'),
  OUTPUT_DOWNLOAD_HOST_ALLOWLIST: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  BLOG_PREVIEW_TOKEN: z.string().min(32).optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  REFRESH_TOKEN_TTL_DAYS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = {
  ...parsed.data,
  port: parseInt(parsed.data.PORT, 10),
  rateLimitWindowMs: parseInt(parsed.data.RATE_LIMIT_WINDOW_MS, 10),
  rateLimitMax: parseInt(parsed.data.RATE_LIMIT_MAX, 10),
  isProd: parsed.data.NODE_ENV === 'production',
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  jwtIssuer: parsed.data.JWT_ISSUER,
  jwtAudience: parsed.data.JWT_AUDIENCE,
  jwtEnforceIssAud: parsed.data.JWT_ENFORCE_ISS_AUD === 'true',
  allowCallbackTokenQuery: parsed.data.ALLOW_CALLBACK_TOKEN_QUERY === 'true',
  useCloudinary: parsed.data.USE_CLOUDINARY === 'true',
  n8nSync: parsed.data.N8N_SYNC === 'true',
  SMTP_HOST: parsed.data.SMTP_HOST,
  SMTP_PORT: parsed.data.SMTP_PORT,
  SMTP_USER: parsed.data.SMTP_USER,
  SMTP_PASS: parsed.data.SMTP_PASS,
  EMAIL_FROM: parsed.data.EMAIL_FROM,
  OWNER_NOTIFY_EMAIL: parsed.data.OWNER_NOTIFY_EMAIL ?? parsed.data.OWNER_NOTIFICATION_EMAIL,
  ownerNotificationEmail:
    parsed.data.OWNER_NOTIFY_EMAIL ?? parsed.data.OWNER_NOTIFICATION_EMAIL ?? null,
  WEB_BASE_URL: parsed.data.WEB_BASE_URL,
  n8nWebhookUrl: parsed.data.N8N_WEBHOOK_URL,
  n8nInternalToken: parsed.data.N8N_INTERNAL_TOKEN,
  composeInternalToken: parsed.data.COMPOSE_INTERNAL_TOKEN,
  n8nHostAllowlist: parsed.data.N8N_HOST_ALLOWLIST,
  n8nTrustedHostAllowlist: parsed.data.N8N_TRUSTED_HOST_ALLOWLIST,
  s3ObjectAcl: parsed.data.S3_OBJECT_ACL ?? 'public-read',
  outputDownloadHostAllowlist: parsed.data.OUTPUT_DOWNLOAD_HOST_ALLOWLIST,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS,
  blogPreviewToken: parsed.data.BLOG_PREVIEW_TOKEN,
  sentryDsn: parsed.data.SENTRY_DSN?.trim() || null,
  sentryEnvironment: parsed.data.SENTRY_ENVIRONMENT?.trim() || undefined,
  sentryTracesSampleRate: (() => {
    const raw = parsed.data.SENTRY_TRACES_SAMPLE_RATE;
    if (!raw) return undefined;
    const parsedRate = Number(raw);
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1) {
      console.warn('[sentry] Invalid SENTRY_TRACES_SAMPLE_RATE, expected 0-1');
      return undefined;
    }
    return parsedRate;
  })(),
  refreshTokenTtlDays: (() => {
    const raw = parsed.data.REFRESH_TOKEN_TTL_DAYS;
    if (!raw) return 30;
    const parsedDays = Number(raw);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      console.warn('[auth] Invalid REFRESH_TOKEN_TTL_DAYS, using default of 30');
      return 30;
    }
    return Math.min(Math.floor(parsedDays), 365);
  })(),
  trustProxy: (() => {
    const raw = parsed.data.TRUST_PROXY?.trim();
    const isProd = parsed.data.NODE_ENV === 'production';
    if (!raw) return isProd ? 1 : false;
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true') return true;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
    return raw;
  })(),
};
