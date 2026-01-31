import type { Tenant, User, Owner } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      auth?: {
        originalRole?: 'owner_superadmin' | 'tenant_admin' | 'user';
        userId?: string;
        ownerId?: string;
        role: 'owner_superadmin' | 'tenant_admin' | 'user';
        tenantId?: string;
        impersonatedTenantId?: string;
      };
    }
  }
}

export {};
