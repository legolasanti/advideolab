import Stripe from 'stripe';
import type { Coupon, Plan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import { HttpError } from '../middleware/errorHandler';
import { applyPlanChange } from './plan';

const SYSTEM_CONFIG_ID = 'singleton';

type StripeSecrets = {
  stripe: Stripe;
  webhookSecret: string | null;
  priceIds: Record<'starter' | 'growth' | 'scale', string | null>;
};

const normalizeCode = (code?: string | null) => (code ?? '').trim().toUpperCase();

const getStripeSecrets = async (): Promise<StripeSecrets> => {
  const config = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: {},
    create: { id: SYSTEM_CONFIG_ID },
  });

  if (!config.stripeSecretKeyEncrypted) {
    throw new HttpError(400, 'Stripe is not configured (missing secret key).');
  }

  const secretKey = decrypt(config.stripeSecretKeyEncrypted);
  const webhookSecret = config.stripeWebhookSecretEncrypted ? decrypt(config.stripeWebhookSecretEncrypted) : null;

  const stripe = new Stripe(secretKey, {
    typescript: true,
  });

  return {
    stripe,
    webhookSecret,
    priceIds: {
      starter: config.stripePriceIdStarter ?? null,
      growth: config.stripePriceIdGrowth ?? null,
      scale: config.stripePriceIdScale ?? null,
    },
  };
};

const lookupKeyForPlan = (planCode: string) => `ugcvideo_${planCode}_monthly`;

const resolvePlanPriceId = (planCode: 'starter' | 'growth' | 'scale', priceIds: StripeSecrets['priceIds']) => {
  const priceId = priceIds[planCode];
  if (!priceId) {
    throw new HttpError(400, `Stripe price ID missing for plan '${planCode}'. Configure it in Owner Settings.`);
  }
  return priceId;
};

const resolvePlanCodeFromPriceId = (
  priceId: string | null | undefined,
  priceIds: StripeSecrets['priceIds'],
  fallbackMetadata?: Record<string, string> | null,
): 'starter' | 'growth' | 'scale' | null => {
  if (!priceId) return null;
  if (priceId === priceIds.starter) return 'starter';
  if (priceId === priceIds.growth) return 'growth';
  if (priceId === priceIds.scale) return 'scale';
  const metaCode = (fallbackMetadata?.plan_code ?? '').toLowerCase();
  if (metaCode === 'starter' || metaCode === 'growth' || metaCode === 'scale') return metaCode;
  return null;
};

const ensureStripeCustomerId = async (stripe: Stripe, tenantId: string, email: string, name: string) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenant_id: tenant.id },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

export const bootstrapStripePrices = async () => {
  const { stripe, priceIds } = await getStripeSecrets();

  const plans = await prisma.plan.findMany({
    where: { code: { in: ['starter', 'growth', 'scale'] } },
    orderBy: { monthlyPriceUsd: 'asc' },
  });

  const byCode = new Map(plans.map((plan) => [plan.code, plan]));
  for (const code of ['starter', 'growth', 'scale'] as const) {
    if (!byCode.get(code)) {
      throw new HttpError(500, `Plan '${code}' missing in database.`);
    }
  }

  const created: Partial<Record<'starter' | 'growth' | 'scale', string>> = {};

  for (const code of ['starter', 'growth', 'scale'] as const) {
    const plan = byCode.get(code) as Plan;
    const lookupKey = lookupKeyForPlan(code);

    const configuredId = priceIds[code];
    if (configuredId) {
      try {
        const existing = await stripe.prices.retrieve(configuredId);
        if (existing && !('deleted' in existing) && existing.active) {
          created[code] = existing.id;
          continue;
        }
      } catch (_err) {
        // fall through to lookup-key search / creation
      }
    }

    const existing = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
      expand: ['data.product'],
    });

    const existingPrice = existing.data[0];
    if (existingPrice) {
      created[code] = existingPrice.id;
      continue;
    }

    const product = await stripe.products.create({
      name: `UGC Studio · ${plan.name}`,
      metadata: {
        plan_code: plan.code,
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: plan.monthlyPriceUsd * 100,
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      metadata: {
        plan_code: plan.code,
      },
    });

    created[code] = price.id;
  }

  const updated = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: {
      stripePriceIdStarter: created.starter,
      stripePriceIdGrowth: created.growth,
      stripePriceIdScale: created.scale,
    },
    create: {
      id: SYSTEM_CONFIG_ID,
      stripePriceIdStarter: created.starter,
      stripePriceIdGrowth: created.growth,
      stripePriceIdScale: created.scale,
    },
  });

  return {
    stripePriceIdStarter: updated.stripePriceIdStarter ?? null,
    stripePriceIdGrowth: updated.stripePriceIdGrowth ?? null,
    stripePriceIdScale: updated.stripePriceIdScale ?? null,
  };
};

const ensureStripeCoupon = async (stripe: Stripe, coupon: Coupon) => {
  if (coupon.stripeCouponId) {
    return coupon.stripeCouponId;
  }

  const createParams: Stripe.CouponCreateParams = {
    duration: 'once',
    name: coupon.code,
    metadata: {
      internal_coupon_id: coupon.id,
      internal_coupon_code: coupon.code,
    },
  };

  if (coupon.type === 'percent') {
    createParams.percent_off = coupon.value;
  } else {
    createParams.amount_off = coupon.value * 100;
    createParams.currency = 'usd';
  }

  if (coupon.expiresAt) {
    createParams.redeem_by = Math.floor(new Date(coupon.expiresAt).getTime() / 1000);
  }

  const created = await stripe.coupons.create(createParams);

  await prisma.coupon.update({
    where: { id: coupon.id },
    data: { stripeCouponId: created.id },
  });

  return created.id;
};

const validateCouponCode = async (rawCode?: string | null) => {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) {
    throw new HttpError(400, 'Invalid coupon code.');
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new HttpError(400, 'Coupon expired.');
  }
  return coupon;
};

export const createStripeCheckoutSessionForTenant = async (args: {
  tenantId: string;
  planCode: 'starter' | 'growth' | 'scale';
  customerEmail: string;
  customerName?: string | null;
  couponCode?: string | null;
  successUrl: string;
  cancelUrl: string;
}) => {
  const { stripe, priceIds } = await getStripeSecrets();

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }

  const priceId = resolvePlanPriceId(args.planCode, priceIds);

  const coupon = await validateCouponCode(args.couponCode);
  const stripeCouponId = coupon ? await ensureStripeCoupon(stripe, coupon) : null;

  const customerId = await ensureStripeCustomerId(
    stripe,
    tenant.id,
    args.customerEmail,
    args.customerName ?? tenant.billingCompanyName ?? tenant.name,
  );

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: tenant.id,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    line_items: [{ price: priceId, quantity: 1 }],
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    metadata: {
      tenant_id: tenant.id,
      plan_code: args.planCode,
      coupon_code: coupon?.code ?? '',
    },
    subscription_data: {
      metadata: {
        tenant_id: tenant.id,
        plan_code: args.planCode,
        coupon_code: coupon?.code ?? '',
      },
    },
    ...(stripeCouponId
      ? {
          discounts: [{ coupon: stripeCouponId }],
        }
      : {}),
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      stripeCustomerId: customerId,
      stripeCheckoutSessionId: session.id,
      billingCompanyName: tenant.billingCompanyName ?? tenant.name,
    },
  });

  if (!session.url) {
    throw new HttpError(500, 'Stripe did not return a checkout URL.');
  }

  return { url: session.url, id: session.id };
};

export const createStripeBillingPortalSessionForTenant = async (args: {
  tenantId: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  planCode?: 'starter' | 'growth' | 'scale';
}) => {
  const { stripe, priceIds } = await getStripeSecrets();

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }

  const customerId = await ensureStripeCustomerId(stripe, tenant.id, args.customerEmail, args.customerName);

  if (tenant.stripeSubscriptionId && args.planCode) {
    const subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });
    const item = subscription.items.data[0];
    if (!item) {
      throw new HttpError(400, 'Subscription item not found.');
    }

    const targetPriceId = resolvePlanPriceId(args.planCode, priceIds);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: args.returnUrl,
      flow_data: {
        type: 'subscription_update_confirm',
        after_completion: {
          type: 'redirect',
          redirect: { return_url: args.returnUrl },
        },
        subscription_update_confirm: {
          subscription: subscription.id,
          items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
        },
      },
    });

    if (!session.url) {
      throw new HttpError(500, 'Stripe did not return a billing portal URL.');
    }
    return { url: session.url };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: args.returnUrl,
  });

  if (!session.url) {
    throw new HttpError(500, 'Stripe did not return a billing portal URL.');
  }
  return { url: session.url };
};

export const activateTenantFromCheckoutSessionId = async (tenantId: string, sessionId: string) => {
  const { stripe } = await getStripeSecrets();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });

  if (session.client_reference_id !== tenant.id && session.metadata?.tenant_id !== tenant.id) {
    throw new HttpError(403, 'Checkout session does not belong to this tenant.');
  }

  const paymentStatus = session.payment_status;
  if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    if (paymentStatus === 'unpaid' || paymentStatus === 'pending') {
      throw new HttpError(409, 'payment_processing');
    }
    throw new HttpError(400, 'payment_not_completed');
  }

  const planCode = (session.metadata?.plan_code as 'starter' | 'growth' | 'scale' | undefined) ?? null;
  if (!planCode) {
    throw new HttpError(400, 'Missing plan code on checkout session.');
  }

  const couponCode = normalizeCode(session.metadata?.coupon_code ?? '');

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  const alreadyApplied = normalizeCode(tenant.appliedCouponCode) === couponCode && Boolean(couponCode);

  const updatedTenant = await applyPlanChange(tenant.id, planCode, {
    activate: true,
    billingStartDate: new Date(),
    paymentStatus: 'active_paid',
    stripeCustomerId,
    stripeSubscriptionId,
    stripeCheckoutSessionId: session.id,
    appliedCouponCode: couponCode || null,
    auditAction: 'stripe_checkout_paid',
    auditDetails: {
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      coupon_code: couponCode || null,
    },
  });

  if (couponCode && !alreadyApplied) {
    await prisma.coupon.updateMany({
      where: { code: couponCode },
      data: { usedCount: { increment: 1 } },
    });
  }

  return updatedTenant;
};

export const processStripeWebhook = async (rawBody: Buffer, signatureHeader: string) => {
  const { stripe, webhookSecret } = await getStripeSecrets();
  if (!webhookSecret) {
    throw new HttpError(400, 'Stripe webhook secret is not configured.');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenant_id;
      if (!tenantId) return { received: true };
      await activateTenantFromCheckoutSessionId(tenantId, session.id);
      return { received: true };
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription ?? null;
      const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      if (!subscriptionId) return { received: true };
      await prisma.tenant.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { paymentStatus: 'past_due' },
      });
      return { received: true };
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription ?? null;
      const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
      if (!subscriptionId) return { received: true };
      const tenant = await prisma.tenant.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
      if (!tenant) return { received: true };

      const { priceIds } = await getStripeSecrets();
      const subscriptionObj = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      });
      const price = subscriptionObj.items.data[0]?.price;
      const subscriptionItem = subscriptionObj.items.data[0];
      const billingStartDate = subscriptionItem
        ? new Date(subscriptionItem.current_period_start * 1000)
        : undefined;
      const nextBillingDate = subscriptionItem ? new Date(subscriptionItem.current_period_end * 1000) : undefined;
      const activePlanCode = resolvePlanCodeFromPriceId(price?.id, priceIds, price?.metadata ?? null);

      if (activePlanCode) {
        await applyPlanChange(tenant.id, activePlanCode, {
          activate: true,
          resetUsage: false,
          paymentStatus: 'active_paid',
          stripeCustomerId: subscriptionObj.customer as string,
          stripeSubscriptionId: subscriptionObj.id,
          billingStartDate,
          nextBillingDate,
          auditAction: 'stripe_subscription_paid',
          auditDetails: {
            stripe_subscription_id: subscriptionObj.id,
            stripe_invoice_id: invoice.id,
            stripe_price_id: price?.id ?? null,
            stripe_subscription_status: subscriptionObj.status,
          },
        });
      } else {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { paymentStatus: 'active_paid' },
        });
      }
      return { received: true };
    }
    default:
      return { received: true };
  }
};
