import { completeJobWithOutputs } from '../src/services/jobService';

const assetCreate = jest.fn();
const jobUpdate = jest.fn();
const jobFindUnique = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: (cb: any) =>
      cb({
        asset: { create: (...args: any[]) => assetCreate(...args) },
        job: {
          update: (...args: any[]) => jobUpdate(...args),
          findUnique: (...args: any[]) => jobFindUnique(...args),
        },
      }),
  },
}));

describe('job lifecycle', () => {
  beforeEach(() => {
    assetCreate.mockClear();
    jobUpdate.mockClear();
    jobFindUnique.mockResolvedValue({ options: { platformFocus: 'tiktok_vertical' } });
  });

  it('records outputs and marks job done', async () => {
    await completeJobWithOutputs('job1', 'tenant1', [{ url: 'https://cdn/image1.png', type: 'ugc', size: '9:16' }]);
    expect(assetCreate).toHaveBeenCalled();
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: expect.objectContaining({ status: 'done', cost: 1 }),
    });
  });
});
