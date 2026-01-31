"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobService_1 = require("../src/services/jobService");
const assetCreate = jest.fn();
const jobUpdate = jest.fn();
const jobFindUnique = jest.fn();
jest.mock('../src/lib/prisma', () => ({
    prisma: {
        $transaction: (cb) => cb({
            asset: { create: (...args) => assetCreate(...args) },
            job: {
                update: (...args) => jobUpdate(...args),
                findUnique: (...args) => jobFindUnique(...args),
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
        await (0, jobService_1.completeJobWithOutputs)('job1', 'tenant1', [{ url: 'https://cdn/image1.png', type: 'ugc', size: '9:16' }]);
        expect(assetCreate).toHaveBeenCalled();
        expect(jobUpdate).toHaveBeenCalledWith({
            where: { id: 'job1' },
            data: expect.objectContaining({ status: 'done', cost: 1 }),
        });
    });
});
