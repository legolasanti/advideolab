import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

const tenantCache = new Map<string, { tenant: any; expiresAt: number }>();
const CACHE_TTL = 60_000;

export const tenantResolver = async (req: Request, _res: Response, next: NextFunction) => {
  if (req.auth?.role === 'owner_superadmin') {
    req.tenant = undefined;
    return next();
  }

  const tenantId = req.auth?.tenantId;
  if (!tenantId) {
    req.tenant = undefined;
    return next();
  }

  const cached = tenantCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    req.tenant = cached.tenant;
    return next();
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) {
    tenantCache.set(tenantId, { tenant, expiresAt: Date.now() + CACHE_TTL });
  }
  req.tenant = tenant ?? undefined;
  next();
};
