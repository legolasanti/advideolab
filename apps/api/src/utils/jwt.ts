import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthClaims = {
  sub: string;
  role: 'owner_superadmin' | 'tenant_admin' | 'user';
  tenantId?: string;
  ownerId?: string;
  impersonatedTenantId?: string;
  actingRole?: 'tenant_admin' | 'user';
  tokenVersion?: number;
};

const resolveDefaultIssuer = () => {
  try {
    return new URL(env.API_PUBLIC_URL).origin;
  } catch (_err) {
    return env.API_PUBLIC_URL;
  }
};

const resolveJwtIssuer = () => env.jwtIssuer?.trim() || resolveDefaultIssuer();
const resolveJwtAudience = () => (env.jwtAudience?.trim() ? env.jwtAudience.trim() : undefined);

// Safe default: 1h in ALL environments
// Allowed range: 15m to 24h (to prevent excessively short or long tokens)
const SAFE_DEFAULT_EXPIRY = '1h';
const MIN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const MAX_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

const parseExpiryToSeconds = (value: string): number | null => {
  const match = value.match(/^(\d+)(ms|s|m|h|d|w|y)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (match[2] ?? 's').toLowerCase();
  switch (unit) {
    case 'ms':
      return Math.floor(num / 1000);
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 60 * 60;
    case 'd':
      return num * 24 * 60 * 60;
    case 'w':
      return num * 7 * 24 * 60 * 60;
    case 'y':
      return num * 365 * 24 * 60 * 60;
    default:
      return null;
  }
};

const resolveJwtExpiresIn = (): SignOptions['expiresIn'] => {
  const raw = env.jwtExpiresIn?.trim();

  // No custom value: use safe default
  if (!raw) return SAFE_DEFAULT_EXPIRY;

  // Validate the provided value
  const seconds = parseExpiryToSeconds(raw);
  if (seconds === null) {
    console.warn(`[jwt] Invalid JWT_EXPIRES_IN value "${raw}", using safe default ${SAFE_DEFAULT_EXPIRY}`);
    return SAFE_DEFAULT_EXPIRY;
  }

  // Enforce safe range (15m to 24h)
  if (seconds < MIN_EXPIRY_SECONDS) {
    console.warn(`[jwt] JWT_EXPIRES_IN "${raw}" is too short (min 15m), using safe default ${SAFE_DEFAULT_EXPIRY}`);
    return SAFE_DEFAULT_EXPIRY;
  }
  if (seconds > MAX_EXPIRY_SECONDS) {
    console.warn(`[jwt] JWT_EXPIRES_IN "${raw}" is too long (max 24h), using safe default ${SAFE_DEFAULT_EXPIRY}`);
    return SAFE_DEFAULT_EXPIRY;
  }

  // Value is valid and within range
  return raw as SignOptions['expiresIn'];
};

export const signToken = (payload: AuthClaims) => {
  const issuer = resolveJwtIssuer();
  const audience = resolveJwtAudience();
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: resolveJwtExpiresIn(),
    issuer,
    ...(audience ? { audience } : {}),
  });
};

export const verifyToken = (token: string) => {
  const issuer = resolveJwtIssuer();
  const audience = resolveJwtAudience();
  const enforceIssAud = env.isProd || env.jwtEnforceIssAud;
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    ...(enforceIssAud ? { issuer } : {}),
    ...(enforceIssAud && audience ? { audience } : {}),
  }) as AuthClaims;
};
