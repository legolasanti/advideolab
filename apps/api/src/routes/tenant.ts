import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import {
  activateTenantFromCheckoutSessionId,
  createStripeBillingPortalSessionForTenant,
  createStripeCheckoutSessionForTenant,
} from '../services/stripe';

const router = Router();

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

    const { planCode, couponCode } = z
      .object({
        planCode: z.enum(['starter', 'growth', 'scale']).optional(),
        couponCode: z.string().optional(),
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

    if (planCode && planCode !== req.tenant.requestedPlanCode) {
      await prisma.tenant.update({
        where: { id: req.tenant.id },
        data: { requestedPlanCode: planCode },
      });
    }

    const session = await createStripeCheckoutSessionForTenant({
      tenantId: req.tenant.id,
      planCode: effectivePlanCode,
      customerEmail: user.email,
      customerName: req.tenant.billingCompanyName ?? req.tenant.name,
      couponCode,
      successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
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

    const { planCode } = z
      .object({
        planCode: z.enum(['starter', 'growth', 'scale']).optional(),
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
        customerEmail: user.email,
        customerName: req.tenant.billingCompanyName ?? req.tenant.name,
        successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
      });
      return res.json({ url: session.url });
    }

    const portal = await createStripeBillingPortalSessionForTenant({
      tenantId: req.tenant.id,
      customerEmail: user.email,
      customerName: req.tenant.billingCompanyName ?? req.tenant.name,
      returnUrl,
      planCode,
    });

    res.json({ url: portal.url });
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
