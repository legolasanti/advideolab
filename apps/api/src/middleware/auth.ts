import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';

const AUTH_CACHE_TTL_MS = 30_000;
type AuthCacheEntry =
  | {
      kind: 'owner';
      tokenVersion: number;
      expiresAt: number;
    }
  | {
      kind: 'user';
      tokenVersion: number;
      role: 'tenant_admin' | 'user';
      tenantId: string;
      expiresAt: number;
    };

const authCache = new Map<string, AuthCacheEntry>();

const parseBearerToken = (header: string) => {
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  if (!token) return null;
  const normalized = token.trim();
  return normalized.length > 0 ? normalized : null;
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header) {
    return next();
  }

  const token = parseBearerToken(header);
  if (!token) {
    return next();
  }

  try {
    const claims = verifyToken(token);
    const now = Date.now();
    const tokenVersion = claims.tokenVersion ?? 0;
    const effectiveRole =
      claims.role === 'owner_superadmin' && claims.actingRole ? claims.actingRole : claims.role;

    if (claims.role === 'owner_superadmin') {
      const cacheKey = `owner:${claims.sub}`;
      const cached = authCache.get(cacheKey);
      if (cached && cached.kind === 'owner' && cached.expiresAt > now) {
        if (cached.tokenVersion !== tokenVersion) {
          return next();
        }
      } else {
        const owner = await prisma.owner.findUnique({
          where: { id: claims.sub },
          select: { id: true, tokenVersion: true },
        });
        if (!owner) {
          return next();
        }
        if (owner.tokenVersion !== tokenVersion) {
          return next();
        }
        authCache.set(cacheKey, {
          kind: 'owner',
          tokenVersion: owner.tokenVersion,
          expiresAt: now + AUTH_CACHE_TTL_MS,
        });
      }

      req.auth = {
        role: effectiveRole,
        originalRole: claims.role,
        tenantId: claims.tenantId ?? claims.impersonatedTenantId,
        userId: claims.role === 'owner_superadmin' && claims.actingRole ? undefined : claims.sub,
        ownerId: claims.ownerId ?? claims.sub,
        impersonatedTenantId: claims.impersonatedTenantId,
      };
      return next();
    }

    const expectedTenantId = claims.tenantId ?? claims.impersonatedTenantId;
    if (!expectedTenantId) {
      return next();
    }

    const cacheKey = `user:${claims.sub}`;
    const cached = authCache.get(cacheKey);
    if (cached && cached.kind === 'user' && cached.expiresAt > now) {
      if (
        cached.tokenVersion !== tokenVersion ||
        cached.role !== claims.role ||
        cached.tenantId !== expectedTenantId
      ) {
        return next();
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, tenantId: true, role: true, tokenVersion: true },
      });
      if (!user) {
        return next();
      }
      if (user.tokenVersion !== tokenVersion) {
        return next();
      }
      if (user.role !== claims.role) {
        return next();
      }
      if (user.tenantId !== expectedTenantId) {
        return next();
      }
      authCache.set(cacheKey, {
        kind: 'user',
        tokenVersion: user.tokenVersion,
        role: user.role,
        tenantId: user.tenantId,
        expiresAt: now + AUTH_CACHE_TTL_MS,
      });
    }

    req.auth = {
      role: effectiveRole,
      originalRole: claims.role,
      tenantId: expectedTenantId,
      userId: claims.sub,
      ownerId: claims.ownerId,
      impersonatedTenantId: claims.impersonatedTenantId,
    };
  } catch (err) {
    console.warn('Invalid token', err);
  }
  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

export const requireTenantRole = (roles: Array<'tenant_admin' | 'user'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !req.auth.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!roles.includes(req.auth.role as 'tenant_admin' | 'user')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

export const requireOwner = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.role !== 'owner_superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
