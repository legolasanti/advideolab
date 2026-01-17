import type { PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { computeNextBillingDate } from './quota';
import { sendPlanApprovedNotification } from './email';

export type ApplyPlanChangeOptions = {
  billingNotes?: string;
  nextBillingDate?: Date;
  billingStartDate?: Date;
  activate?: boolean;
  resetUsage?: boolean;
  bonusCredits?: number;
  paymentStatus?: PaymentStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  appliedCouponCode?: string | null;
  auditAction?: string;
  auditDetails?: Record<string, unknown>;
};

export const applyPlanChange = async (tenantId: string, planCode: string, options: ApplyPlanChangeOptions = {}) => {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    throw Object.assign(new Error('plan_not_found'), { status: 404, response: { error: 'plan_not_found' } });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw Object.assign(new Error('tenant_not_found'), { status: 404, response: { error: 'tenant_not_found' } });
  }

  const resetUsage = options.resetUsage !== false;
  const billingCycleStart = options.billingStartDate ?? tenant.billingCycleStart ?? new Date();
  const computedNextBillingDate =
    options.nextBillingDate ??
    (options.billingStartDate
      ? computeNextBillingDate(billingCycleStart)
      : tenant.nextBillingDate ?? computeNextBillingDate(billingCycleStart));

  const updateData: Record<string, unknown> = {
    planId: plan.id,
    monthlyVideoLimit: plan.monthlyVideoLimit,
    ...(resetUsage ? { videosUsedThisCycle: 0 } : {}),
    bonusCredits: options.bonusCredits ?? tenant.bonusCredits,
    ...(options.billingStartDate || resetUsage ? { billingCycleStart } : {}),
    status: options.activate === false ? tenant.status : 'active',
    requestedPlanCode: null,
    billingNotes: options.billingNotes ?? tenant.billingNotes,
    ...(options.nextBillingDate || options.billingStartDate || resetUsage ? { nextBillingDate: computedNextBillingDate } : {}),
    paymentStatus: options.paymentStatus ?? (options.activate ? 'active_paid' : tenant.paymentStatus),
    stripeCustomerId: options.stripeCustomerId,
    stripeSubscriptionId: options.stripeSubscriptionId,
    stripeCheckoutSessionId: options.stripeCheckoutSessionId,
    appliedCouponCode: options.appliedCouponCode,
  };

  Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: updateData,
  });

  await prisma.audit.create({
    data: {
      tenantId: tenant.id,
      action: options.auditAction ?? 'owner_plan_approved',
      details: {
        toPlan: plan.code,
        activated: updated.status,
        ...(options.auditDetails ?? {}),
      },
    },
  });

  if (updated.status === 'active' && tenant.status !== 'active') {
    const adminUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'tenant_admin' },
      orderBy: { createdAt: 'asc' },
    });
    if (adminUser) {
      await sendPlanApprovedNotification({
        tenant: updated,
        user: adminUser,
        plan,
        nextBillingDate: computedNextBillingDate,
      });
    }
  }

  return updated;
};
