import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export type RefreshTokenMeta = {
  userId?: string | null;
  ownerId?: string | null;
  tenantId?: string | null;
  tokenVersion?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const resolveExpiry = () => {
  const ttlMs = env.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ttlMs);
};

export const getRefreshCookieName = () => REFRESH_TOKEN_COOKIE_NAME;

export const createRefreshToken = async (meta: RefreshTokenMeta) => {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = resolveExpiry();
  const record = await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: meta.userId ?? null,
      ownerId: meta.ownerId ?? null,
      tenantId: meta.tenantId ?? null,
      tokenVersion: meta.tokenVersion ?? 0,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    },
  });
  return { token, record };
};

export const getRefreshTokenRecord = async (token: string) => {
  const tokenHash = hashToken(token);
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
};

export const revokeRefreshToken = async (token: string) => {
  const tokenHash = hashToken(token);
  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: now },
  });
};

export const rotateRefreshToken = async (token: string, meta: RefreshTokenMeta) => {
  const tokenHash = hashToken(token);
  const now = new Date();
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt || existing.expiresAt < now) {
    return null;
  }

  const newToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const newTokenHash = hashToken(newToken);
  const expiresAt = resolveExpiry();

  const created = await prisma.$transaction(async (trx) => {
    const updated = await trx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (updated.count === 0) return null;
    return trx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: existing.userId ?? meta.userId ?? null,
        ownerId: existing.ownerId ?? meta.ownerId ?? null,
        tenantId: existing.tenantId ?? meta.tenantId ?? null,
        tokenVersion: existing.tokenVersion ?? meta.tokenVersion ?? 0,
        ipAddress: meta.ipAddress ?? existing.ipAddress ?? null,
        userAgent: meta.userAgent ?? existing.userAgent ?? null,
        expiresAt,
      },
    });
  });

  if (!created) {
    return null;
  }

  return { token: newToken, record: created };
};
