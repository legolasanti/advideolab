import express from 'express';
import request from 'supertest';
import authRoutes from '../src/routes/auth';

const getRefreshTokenRecord = jest.fn();
const rotateRefreshToken = jest.fn();
const revokeRefreshToken = jest.fn();

jest.mock('../src/services/refreshTokens', () => ({
  getRefreshTokenRecord: (...args: any[]) => getRefreshTokenRecord(...args),
  rotateRefreshToken: (...args: any[]) => rotateRefreshToken(...args),
  revokeRefreshToken: (...args: any[]) => revokeRefreshToken(...args),
  createRefreshToken: jest.fn(),
  getRefreshCookieName: () => 'refresh_token',
}));

const userFindUnique = jest.fn();
const ownerFindUnique = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: any[]) => userFindUnique(...args),
    },
    owner: {
      findUnique: (...args: any[]) => ownerFindUnique(...args),
    },
  },
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
};

describe('auth refresh', () => {
  beforeEach(() => {
    getRefreshTokenRecord.mockReset();
    rotateRefreshToken.mockReset();
    revokeRefreshToken.mockReset();
    userFindUnique.mockReset();
    ownerFindUnique.mockReset();
  });

  it('refreshes access token for a tenant user', async () => {
    const now = new Date();
    getRefreshTokenRecord.mockResolvedValue({
      tokenHash: 'hash',
      userId: 'user_1',
      tenantId: 'tenant_1',
      tokenVersion: 2,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    rotateRefreshToken.mockResolvedValue({
      token: 'new_refresh_token',
      record: { expiresAt: new Date(now.getTime() + 120_000) },
    });
    userFindUnique.mockResolvedValue({
      id: 'user_1',
      role: 'tenant_admin',
      tenantId: 'tenant_1',
      tokenVersion: 2,
    });

    const app = buildApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=old_refresh_token');

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('tenant_admin');
    expect(res.body.token).toBeDefined();
    expect(rotateRefreshToken).toHaveBeenCalled();
    expect(res.headers['set-cookie'][0]).toContain('refresh_token=');
  });

  it('rejects invalid refresh token', async () => {
    getRefreshTokenRecord.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=missing');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'refresh_invalid' });
    expect(res.headers['set-cookie'][0]).toContain('refresh_token=');
  });
});
