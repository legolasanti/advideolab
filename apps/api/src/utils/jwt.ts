import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthClaims = {
  sub: string;
  role: 'owner_superadmin' | 'tenant_admin' | 'user';
  tenantId?: string;
  ownerId?: string;
  impersonatedTenantId?: string;
  actingRole?: 'tenant_admin' | 'user';
};

export const signToken = (payload: AuthClaims) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET) as AuthClaims;
};
