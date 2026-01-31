import express from 'express';
import request from 'supertest';
import { JobStatus } from '@prisma/client';
import videoRoutes from '../src/routes/videos';

const jobFindUnique = jest.fn();
const jobUpdateMany = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    job: {
      findUnique: (...args: any[]) => jobFindUnique(...args),
      updateMany: (...args: any[]) => jobUpdateMany(...args),
    },
  },
}));

const persistOutputsToStorage = jest.fn();
const completeJobWithOutputs = jest.fn();
const markJobError = jest.fn();

jest.mock('../src/services/jobService', () => ({
  createJob: jest.fn(),
  completeJobWithOutputs: (...args: any[]) => completeJobWithOutputs(...args),
  markJobError: (...args: any[]) => markJobError(...args),
  UnsafeExternalUrlError: class UnsafeExternalUrlError extends Error {},
  ExternalAssetTooLargeError: class ExternalAssetTooLargeError extends Error {},
  WorkflowConfigurationError: class WorkflowConfigurationError extends Error {},
  persistOutputsToStorage: (...args: any[]) => persistOutputsToStorage(...args),
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/videos', videoRoutes);
  return app;
};

describe('n8n callback', () => {
  const callbackToken = 'a'.repeat(64);

  beforeEach(() => {
    jobFindUnique.mockReset();
    jobUpdateMany.mockReset();
    persistOutputsToStorage.mockReset();
    completeJobWithOutputs.mockReset();
    markJobError.mockReset();
  });

  it('rejects invalid callback token', async () => {
    jobFindUnique.mockResolvedValue({
      id: 'job_1',
      tenantId: 'tenant_1',
      status: JobStatus.running,
      options: { callbackToken },
      finishedAt: null,
      outputs: null,
      updatedAt: new Date(),
    });

    const app = buildApp();
    const res = await request(app)
      .post('/videos/jobs/job_1/callback')
      .set('x-callback-token', 'b'.repeat(64))
      .send({ status: 'done', outputs: [{ url: 'https://cdn.example.com/out.mp4' }] });

    expect(res.status).toBe(404);
    expect(persistOutputsToStorage).not.toHaveBeenCalled();
  });

  it('stores outputs and completes job on success', async () => {
    jobFindUnique.mockResolvedValue({
      id: 'job_1',
      tenantId: 'tenant_1',
      status: JobStatus.running,
      options: { callbackToken, videoCount: 1 },
      finishedAt: null,
      outputs: null,
      updatedAt: new Date(),
    });
    jobUpdateMany.mockResolvedValue({ count: 1 });
    persistOutputsToStorage.mockResolvedValue([
      { url: 'https://cdn.example.com/out.mp4', type: 'video/mp4', size: 123 },
    ]);
    completeJobWithOutputs.mockResolvedValue(undefined);

    const app = buildApp();
    const res = await request(app)
      .post('/videos/jobs/job_1/callback')
      .set('x-callback-token', callbackToken)
      .send({ status: 'done', outputs: [{ url: 'https://cdn.example.com/out.mp4', type: 'video/mp4', size: 123 }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(persistOutputsToStorage).toHaveBeenCalled();
    expect(completeJobWithOutputs).toHaveBeenCalled();
  });

  it('marks job error when status=error', async () => {
    jobFindUnique.mockResolvedValue({
      id: 'job_2',
      tenantId: 'tenant_2',
      status: JobStatus.running,
      options: { callbackToken },
      finishedAt: null,
      outputs: null,
      updatedAt: new Date(),
    });

    const app = buildApp();
    const res = await request(app)
      .post('/videos/jobs/job_2/callback')
      .set('x-callback-token', callbackToken)
      .send({ status: 'error', errorMessage: 'workflow_failed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(markJobError).toHaveBeenCalledWith('job_2', 'tenant_2', 'workflow_failed');
  });
});
