import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { differenceInMonths } from 'date-fns';
import { env } from '../config/env';
import {
  activateTenantFromCheckoutSessionId,
  createStripeBillingPortalSessionForTenant,
  createStripeCheckoutSessionForTenant,
  scheduleStripeCancellationForTenant,
} from '../services/stripe';
import { sendSubscriptionCancelledEmail } from '../services/email';
import { computeNextBillingDate } from '../services/quota';

const router = Router();

const marketingSchema = z
  .object({
    sessionId: z.string().min(8).max(128).optional(),
    utmSource: z.string().max(128).optional().nullable(),
    utmMedium: z.string().max(128).optional().nullable(),
    utmCampaign: z.string().max(128).optional().nullable(),
    referrer: z.string().max(2048).optional().nullable(),
    landingPage: z.string().max(2048).optional().nullable(),
  })
  .optional();

router.post(
  '/billing/checkout',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  async (req, res) => {
    if (!req.tenant) {
      return res.status(400).json({ error: 'tenant_missing' });
    }

    if (req.tenant.status === 'active' && req.tenant.planId) {
      return res.status(400).json({ error: 'tenant_already_active' });
    }

    const { planCode, couponCode, billingInterval, marketing } = z
      .object({
        planCode: z.enum(['starter', 'growth', 'scale']).optional(),
        billingInterval: z.enum(['monthly', 'annual']).optional(),
        couponCode: z.string().optional(),
        marketing: marketingSchema,
      })
      .parse(req.body);

    const effectivePlanCode = planCode ?? (req.tenant.requestedPlanCode as 'starter' | 'growth' | 'scale' | null);
    if (!effectivePlanCode) {
      return res.status(400).json({ error: 'plan_missing' });
    }

    if (!req.auth?.userId) {
      return res.status(400).json({ error: 'user_missing' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    if (
      (planCode && planCode !== req.tenant.requestedPlanCode) ||
      (billingInterval && billingInterval !== req.tenant.billingInterval)
    ) {
      await prisma.tenant.update({
        where: { id: req.tenant.id },
        data: {
          ...(planCode ? { requestedPlanCode: planCode } : {}),
          ...(billingInterval ? { billingInterval } : {}),
        },
      });
    }

    const session = await createStripeCheckoutSessionForTenant({
      tenantId: req.tenant.id,
      planCode: effectivePlanCode,
      billingInterval: billingInterval ?? req.tenant.billingInterval ?? 'monthly',
      customerEmail: user.email,
      customerName: req.tenant.billingCompanyName ?? req.tenant.name,
      couponCode,
      successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
      marketing: marketing ?? null,
    });

    res.json({ url: session.url });
  },
);

router.post(
  '/billing/portal',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  async (req, res) => {
    if (!req.tenant) {
      return res.status(400).json({ error: 'tenant_missing' });
    }

    if (!req.auth?.userId) {
      return res.status(400).json({ error: 'user_missing' });
    }

    const { planCode, billingInterval, marketing } = z
      .object({
        planCode: z.enum(['starter', 'growth', 'scale']).optional(),
        billingInterval: z.enum(['monthly', 'annual']).optional(),
        marketing: marketingSchema,
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { email: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const returnUrl = `${env.WEB_BASE_URL}/settings?billing=1`;

    if (planCode && !req.tenant.stripeSubscriptionId) {
      const session = await createStripeCheckoutSessionForTenant({
        tenantId: req.tenant.id,
        planCode,
        billingInterval: billingInterval ?? req.tenant.billingInterval ?? 'monthly',
        customerEmail: user.email,
        customerName: req.tenant.billingCompanyName ?? req.tenant.name,
        successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
        marketing: marketing ?? null,
      });
      return res.json({ url: session.url });
    }

    const portal = await createStripeBillingPortalSessionForTenant({
      tenantId: req.tenant.id,
      customerEmail: user.email,
      customerName: req.tenant.billingCompanyName ?? req.tenant.name,
      returnUrl,
      planCode,
      billingInterval: billingInterval ?? req.tenant.billingInterval ?? 'monthly',
    });

    res.json({ url: portal.url });
  },
);

router.post(
  '/billing/cancel',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  async (req, res) => {
    if (!req.tenant) {
      return res.status(400).json({ error: 'tenant_missing' });
    }

    if (req.tenant.subscriptionCanceledAt) {
      return res.status(400).json({ error: 'subscription_already_canceled' });
    }

    if (req.tenant.subscriptionCancelAt && req.tenant.subscriptionCancelAt > new Date()) {
      return res.json({
        ok: true,
        effectiveAt: req.tenant.subscriptionCancelAt,
        alreadyScheduled: true,
        emailSent: true,
      });
    }

    const body = z
      .object({
        reason: z.enum(['too_expensive', 'missing_features', 'not_using', 'switching_tool', 'buggy', 'other']),
        details: z.string().max(1000).optional().nullable(),
        satisfaction: z.coerce.number().int().min(1).max(5).optional().nullable(),
        wouldReturn: z.enum(['yes', 'no', 'maybe']).optional().nullable(),
      })
      .parse(req.body);

    let billingInterval: 'monthly' | 'annual' = req.tenant.billingInterval ?? 'monthly';
    let stripeSubscriptionId: string | null = null;
    let currentPeriodEnd: number | null = null;
    let effectiveAt: Date | null = null;

    try {
      const result = await scheduleStripeCancellationForTenant(req.tenant.id);
      const subscription = result.subscription;
      billingInterval = result.billingInterval;
      stripeSubscriptionId = subscription.id;
      const subscriptionItem = subscription.items?.data?.[0];
      currentPeriodEnd = subscriptionItem?.current_period_end ?? null;
      effectiveAt =
        subscription.cancel_at && Number.isFinite(subscription.cancel_at)
          ? new Date(subscription.cancel_at * 1000)
          : currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000)
            : null;
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) {
        const message = err.message ?? '';
        const isRecoverable =
          message.includes('Stripe is not configured') || message.includes('Subscription not found');
        if (!isRecoverable) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (!effectiveAt) {
      effectiveAt = req.tenant.nextBillingDate ?? computeNextBillingDate(req.tenant.billingCycleStart);
      currentPeriodEnd = currentPeriodEnd ?? Math.floor(effectiveAt.getTime() / 1000);
    }

    const plan = req.tenant.planId
      ? await prisma.plan.findUnique({ where: { id: req.tenant.planId } })
      : null;
    const planCode = plan?.code ?? req.tenant.requestedPlanCode ?? null;
    const planName = plan?.name ?? planCode ?? 'Plan';
    const subscriptionStart = req.tenant.subscriptionPeriodStart ?? req.tenant.createdAt ?? new Date();
    const monthsActive = Math.max(1, differenceInMonths(new Date(), subscriptionStart) + 1);

    await prisma.subscriptionCancellation.create({
      data: {
        tenantId: req.tenant.id,
        userId: req.auth?.userId ?? null,
        planCode,
        billingInterval,
        reason: body.reason,
        details: {
          details: body.details ?? null,
          satisfaction: body.satisfaction ?? null,
          wouldReturn: body.wouldReturn ?? null,
        },
        monthsActive,
        effectiveAt,
        stripeSubscriptionId,
      },
    });

    await prisma.tenant.update({
      where: { id: req.tenant.id },
      data: {
        subscriptionCancelAt: effectiveAt,
        subscriptionPeriodStart: req.tenant.subscriptionPeriodStart ?? subscriptionStart,
        subscriptionPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : effectiveAt ?? req.tenant.subscriptionPeriodEnd,
        billingInterval,
      },
    });

    await prisma.audit.create({
      data: {
        tenantId: req.tenant.id,
        action: 'subscription_cancel_requested',
        details: {
          reason: body.reason,
          effectiveAt: effectiveAt?.toISOString() ?? null,
        },
      },
    });

    let adminUser: { email: string } | null = null;
    if (req.auth?.userId) {
      adminUser = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { email: true } });
    }

    let emailSent = false;
    if (adminUser?.email && effectiveAt) {
      try {
        emailSent = await sendSubscriptionCancelledEmail({
          email: adminUser.email,
          companyName: req.tenant.name,
          planName,
          effectiveDate: effectiveAt,
        });
      } catch (err) {
        console.warn('[billing] failed to send cancellation email');
        emailSent = false;
      }
    }

    try {
      await prisma.adminNotification.create({
        data: {
          tenantId: req.tenant.id,
          type: 'subscription_cancel',
          message: `${req.tenant.name} requested cancellation (${planName}).`,
          details: {
            tenantId: req.tenant.id,
            planCode,
            effectiveAt: effectiveAt?.toISOString() ?? null,
            reason: body.reason,
            actorUserId: req.auth?.userId ?? null,
          },
        },
      });
    } catch (err) {
      console.warn('[billing] failed to create admin notification');
    }

    res.json({
      ok: true,
      effectiveAt,
      billingInterval,
      emailSent,
    });
  },
);

router.post(
  '/billing/stripe/finalize',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  async (req, res) => {
    if (!req.tenant) {
      return res.status(400).json({ error: 'tenant_missing' });
    }

    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(req.body);

    const updated = await activateTenantFromCheckoutSessionId(req.tenant.id, sessionId);
    res.json({ tenant: updated });
  },
);

router.post(
  '/plan-request',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  async (req, res) => {
    if (!req.tenant) {
      return res.status(400).json({ error: 'tenant_missing' });
    }
    const { planCode } = z
      .object({
        planCode: z.enum(['starter', 'growth', 'scale']),
      })
      .parse(req.body);

    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    await prisma.tenant.update({
      where: { id: req.tenant.id },
      data: { requestedPlanCode: plan.code },
    });

    await prisma.adminNotification.create({
      data: {
        tenantId: req.tenant.id,
        type: 'plan_request',
        message: `${req.tenant.name} requested ${plan.name}`,
        details: {
          tenantId: req.tenant.id,
          planCode,
          actorUserId: req.auth?.userId,
        },
      },
    });

    res.json({ requestedPlanCode: plan.code });
  },
);

export default router;
