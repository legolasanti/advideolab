import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { resetUsageForTenant, resolveUsageCycle, computeNextBillingDate } from '../services/quota';
import { cleanupStaleJobs } from '../services/ugcVideoService';

export const scheduleMonthlyResets = () => {
  // Reset tenant quotas every 15 minutes
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

  // Cleanup stale jobs every 5 minutes
  // This catches jobs that have been running for too long (15+ minutes)
  // and marks them as failed with credit refund and admin notification
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await cleanupStaleJobs();
      if (result.cleaned > 0) {
        console.log(`[job-cleanup] Cleaned up ${result.cleaned} stale jobs`);
      }
    } catch (err) {
      console.error('[job-cleanup] Failed to cleanup stale jobs:', err);
    }
  });
};
