import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header) {
    return next();
  }

  const [, token] = header.split(' ');
  if (!token) {
    return next();
  }

  try {
    const claims = verifyToken(token);
    const effectiveRole =
      claims.role === 'owner_superadmin' && claims.actingRole ? claims.actingRole : claims.role;
    req.auth = {
      role: effectiveRole,
      originalRole: claims.role,
      tenantId: claims.tenantId ?? claims.impersonatedTenantId,
      userId:
        claims.role === 'owner_superadmin' && claims.actingRole ? undefined : claims.sub,
      ownerId: claims.ownerId ?? (claims.role === 'owner_superadmin' ? claims.sub : undefined),
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
