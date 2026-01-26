import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { resetUsageForTenant, resolveUsageCycle, computeNextBillingDate } from '../services/quota';

export const scheduleMonthlyResets = () => {
  cron.schedule('*/15 * * * *', async () => {
    const now = new Date();
    const tenants = await prisma.tenant.findMany({
      where: {
        OR: [
          { nextBillingDate: { lte: now } },
          { nextBillingDate: null },
        ],
      },
    });
    let resetCount = 0;
    for (const tenant of tenants) {
      const computedNext = tenant.nextBillingDate ?? computeNextBillingDate(tenant.billingCycleStart);
      if (computedNext > now) {
        continue;
      }
      const { cycleStart, nextDate } = resolveUsageCycle(tenant, now);
      await resetUsageForTenant(tenant.id, { cycleStart, nextBillingDate: nextDate });
      await prisma.audit.create({
        data: {
          tenantId: tenant.id,
          action: 'auto_quota_reset',
          details: {
            cycleStart: cycleStart.toISOString(),
            nextBillingDate: nextDate.toISOString(),
          },
        },
      });
      resetCount += 1;
    }
    console.log(`Reset quotas for ${resetCount} tenants`);
  });
};
