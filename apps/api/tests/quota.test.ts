import { ensureTenantWithinQuota, incrementUsageOnSuccess, QuotaExceededError } from '../src/services/quota';

const findUniqueMock = jest.fn();
const updateMock = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: (...args: any[]) => findUniqueMock(...args),
      update: (...args: any[]) => updateMock(...args),
    },
  },
}));

const baseTenant = {
  id: 'tenant_1',
  monthlyVideoLimit: 10,
  videosUsedThisCycle: 0,
  status: 'active',
  billingCycleStart: new Date(),
  planDetails: {
    id: 'plan_starter',
    name: 'Starter',
    code: 'starter',
    monthlyPriceUsd: 69,
    monthlyVideoLimit: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe('quota service', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    updateMock.mockReset();
  });

  it('allows job creation when usage is below limit', async () => {
    findUniqueMock.mockResolvedValue({
      ...baseTenant,
      videosUsedThisCycle: 5,
    });
    await expect(ensureTenantWithinQuota('tenant_1')).resolves.toMatchObject({
      id: 'tenant_1',
    });
  });

  it('throws when usage matches the limit', async () => {
    findUniqueMock.mockResolvedValue({
      ...baseTenant,
      videosUsedThisCycle: 10,
    });
    await expect(ensureTenantWithinQuota('tenant_1')).rejects.toThrow(QuotaExceededError);
  });

  it('increments usage after successful job completion', async () => {
    updateMock.mockResolvedValue({});
    await incrementUsageOnSuccess('tenant_1');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'tenant_1' },
      data: { videosUsedThisCycle: { increment: 1 } },
    });
  });
});
