import express from 'express';
import request from 'supertest';
import videoRoutes from '../src/routes/videos';

const jobFindFirst = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    job: {
      findFirst: (...args: any[]) => jobFindFirst(...args),
    },
  },
}));

const buildApp = () => {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = {
      role: 'tenant_admin',
      tenantId: 'tenant_1',
      userId: 'user_1',
    };
    next();
  });
  app.use('/videos', videoRoutes);
  return app;
};

describe('tenant isolation', () => {
  beforeEach(() => {
    jobFindFirst.mockReset();
  });

  it('scopes job lookups to the authenticated tenant', async () => {
    jobFindFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).get('/videos/jobs/job_123');

    expect(jobFindFirst).toHaveBeenCalledWith({
      where: { id: 'job_123', tenantId: 'tenant_1' },
      include: { assets: true },
    });
    expect(res.status).toBe(404);
  });
});
