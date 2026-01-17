import type { Prisma } from '@prisma/client';
import { addMonths, lastDayOfMonth } from 'date-fns';
import { prisma } from '../lib/prisma';

const tenantWithPlanInclude = {
  planDetails: true,
} satisfies Prisma.TenantInclude;

export type TenantWithPlan = Prisma.TenantGetPayload<{ include: typeof tenantWithPlanInclude }>;

export class QuotaExceededError extends Error {
  code = 'quota_exceeded';

  constructor(message = 'Monthly video limit reached') {
    super(message);
  }
}

export class BillingPeriodExpiredError extends Error {
  code = 'billing_period_ended';

  constructor(message = 'Billing period ended') {
    super(message);
  }
}

export class TenantBlockedError extends Error {
  code: 'tenant_pending' | 'tenant_suspended' | 'plan_missing';

  constructor(code: TenantBlockedError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const isUnlimitedTenant = (tenant: TenantWithPlan) => Boolean(tenant.planId) && tenant.monthlyVideoLimit === 0;

const calculateLimit = (tenant: TenantWithPlan): number | null => {
  if (!tenant.planId) return null;
  if (isUnlimitedTenant(tenant)) return null;
  return tenant.monthlyVideoLimit + (tenant.bonusCredits ?? 0);
};

export const computeNextBillingDate = (cycleStart: Date) => {
  const start = new Date(cycleStart);
  const candidate = addMonths(start, 1);
  const startDay = start.getDate();
  const lastDay = lastDayOfMonth(candidate).getDate();
  candidate.setDate(Math.min(startDay, lastDay));
  candidate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  return candidate;
};

const resolveNextBillingDate = (tenant: TenantWithPlan) => {
  if (tenant.nextBillingDate) {
    return tenant.nextBillingDate;
  }
  return computeNextBillingDate(tenant.billingCycleStart);
};

const buildUsageStats = (tenant: TenantWithPlan) => {
  const limit = calculateLimit(tenant);
  const used = tenant.videosUsedThisCycle;
  return {
    tenant,
    used,
    limit,
    creditsLeft: typeof limit === 'number' ? Math.max(limit - used, 0) : null,
    planName: tenant.planDetails?.name ?? null,
    planCode: tenant.planDetails?.code ?? null,
    billingCycleStart: tenant.billingCycleStart,
    nextBillingDate: resolveNextBillingDate(tenant),
    bonusCredits: tenant.bonusCredits ?? 0,
  };
};

export type UsageStats = ReturnType<typeof buildUsageStats>;

export const getUsageStats = async (tenantId: string) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: tenantWithPlanInclude,
  });
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  return buildUsageStats(tenant);
};

export const ensureTenantWithinQuota = async (tenantId: string, requestedVideos = 1) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: tenantWithPlanInclude,
  });
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  enforceTenantQuota(tenant, requestedVideos);
  return tenant;
};

export const ensureTenantReadyForUsage = async (tenantId: string, requestedVideos = 1) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: tenantWithPlanInclude,
  });
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  if (tenant.status === 'pending') {
    throw new TenantBlockedError('tenant_pending', 'Your account is pending activation. Please wait for billing confirmation.');
  }
  if (tenant.status === 'suspended') {
    throw new TenantBlockedError('tenant_suspended', 'Your account is suspended. Contact support for assistance.');
  }
  if (tenant.paymentStatus === 'past_due') {
    throw new TenantBlockedError('plan_missing', 'Billing is past due. Please renew your plan before launching jobs.');
  }
  if (!tenant.planId) {
    throw new TenantBlockedError('plan_missing', 'Your plan is not active yet. Please contact support.');
  }
  enforceTenantQuota(tenant, requestedVideos);
  return tenant;
};

const enforceBillingWindow = (tenant: TenantWithPlan) => {
  const nextBilling = resolveNextBillingDate(tenant);
  if (nextBilling && new Date() > new Date(nextBilling)) {
    throw new BillingPeriodExpiredError('Your billing period has ended. Please renew before launching new jobs.');
  }
};

export const enforceTenantQuota = (tenant: TenantWithPlan, requestedVideos = 1) => {
  if (!isUnlimitedTenant(tenant)) {
    enforceBillingWindow(tenant);
  }
  const limit = calculateLimit(tenant);
  if (typeof limit === 'number' && limit > 0 && tenant.videosUsedThisCycle + requestedVideos > limit) {
    throw new QuotaExceededError();
  }
};

export const incrementUsageOnSuccess = async (tenantId: string, incrementBy = 1) => {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      videosUsedThisCycle: { increment: incrementBy },
    },
  });
};

export const resetUsageForTenant = async (tenantId: string) => {
  const billingCycleStart = new Date();
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      videosUsedThisCycle: 0,
      billingCycleStart,
      nextBillingDate: computeNextBillingDate(billingCycleStart),
    },
  });
};
