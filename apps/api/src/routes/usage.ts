import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getUsageStats } from '../services/quota';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  if (!req.auth?.tenantId) {
    return res.status(400).json({ error: 'Tenant scope missing' });
  }
  const stats = await getUsageStats(req.auth.tenantId);
  return res.json({
    plan: {
      name: stats.planName,
      code: stats.planCode,
      monthly_limit: stats.limit,
    },
    used: stats.used,
    credits_left: stats.creditsLeft,
    reset_day: stats.tenant.resetDay,
    billing_cycle_start: stats.billingCycleStart,
    next_billing_date: stats.nextBillingDate,
    usage_cycle_start: stats.usageCycleStart,
    usage_cycle_end: stats.usageCycleEnd,
    subscription_period_end: stats.subscriptionPeriodEnd ?? null,
    bonus_credits: stats.bonusCredits,
  });
});

export default router;
