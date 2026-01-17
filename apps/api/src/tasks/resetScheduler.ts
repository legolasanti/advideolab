import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { resetUsageForTenant } from '../services/quota';

export const scheduleMonthlyResets = () => {
  cron.schedule('0 2 * * *', async () => {
    const today = new Date().getDate();
    const tenants = await prisma.tenant.findMany({
      where: { resetDay: today },
    });
    for (const tenant of tenants) {
      await resetUsageForTenant(tenant.id);
      await prisma.audit.create({
        data: {
          tenantId: tenant.id,
          action: 'auto_quota_reset',
        },
      });
    }
    console.log(`Reset quotas for ${tenants.length} tenants`);
  });
};
