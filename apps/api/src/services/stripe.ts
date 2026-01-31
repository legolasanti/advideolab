import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { subMonths } from 'date-fns';
import type { Coupon, Plan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import { HttpError } from '../middleware/errorHandler';
import { applyPlanChange } from './plan';
import { trackMarketingEvent } from './marketing';
import { MarketingEventType } from '@prisma/client';

const SYSTEM_CONFIG_ID = 'singleton';

type PlanCode = 'starter' | 'growth' | 'scale';
type BillingInterval = 'monthly' | 'annual';
type StripePriceIds = {
  monthly: Record<PlanCode, string | null>;
  annual: Record<PlanCode, string | null>;
};

type StripeSecrets = {
  stripe: Stripe;
  webhookSecret: string | null;
  priceIds: StripePriceIds;
};

export type TenantInvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  created: number;
};

const normalizeCode = (code?: string | null) => (code ?? '').trim().toUpperCase();
const normalizeInterval = (value?: string | null): BillingInterval | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'annual' || normalized === 'year' || normalized === 'yearly') return 'annual';
  if (normalized === 'monthly' || normalized === 'month') return 'monthly';
  return null;
};

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
      monthly: {
        starter: config.stripePriceIdStarter ?? null,
        growth: config.stripePriceIdGrowth ?? null,
        scale: config.stripePriceIdScale ?? null,
      },
      annual: {
        starter: config.stripePriceIdStarterAnnual ?? null,
        growth: config.stripePriceIdGrowthAnnual ?? null,
        scale: config.stripePriceIdScaleAnnual ?? null,
      },
    },
  };
};

const lookupKeyForPlan = (planCode: string, interval: BillingInterval) => `ugcvideo_${planCode}_${interval}`;

const resolvePlanPriceId = (
  planCode: PlanCode,
  interval: BillingInterval,
  priceIds: StripeSecrets['priceIds'],
) => {
  const priceId = priceIds[interval][planCode];
  if (!priceId) {
    throw new HttpError(400, `Stripe price ID missing for plan '${planCode}' (${interval}). Configure it in Owner Settings.`);
  }
  return priceId;
};

const resolvePlanFromPriceId = (
  priceId: string | null | undefined,
  priceIds: StripeSecrets['priceIds'],
  fallbackMetadata?: Record<string, string> | null,
  recurringInterval?: string | null,
): { planCode: PlanCode; billingInterval: BillingInterval } | null => {
  if (!priceId) return null;
  for (const interval of ['monthly', 'annual'] as const) {
    for (const planCode of ['starter', 'growth', 'scale'] as const) {
      if (priceIds[interval][planCode] === priceId) {
        return { planCode, billingInterval: interval };
      }
    }
  }
  const metaCode = (fallbackMetadata?.plan_code ?? '').toLowerCase();
  const metaInterval = normalizeInterval(fallbackMetadata?.billing_interval ?? null);
  if (metaCode === 'starter' || metaCode === 'growth' || metaCode === 'scale') {
    const inferredInterval = metaInterval ?? (recurringInterval === 'year' ? 'annual' : 'monthly');
    return { planCode: metaCode, billingInterval: inferredInterval };
  }
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

  const created: StripePriceIds = {
    monthly: { starter: null, growth: null, scale: null },
    annual: { starter: null, growth: null, scale: null },
  };

  const resolveExistingPrice = async (planCode: PlanCode, interval: BillingInterval) => {
    const configuredId = priceIds[interval][planCode];
    if (configuredId) {
      try {
        const existing = await stripe.prices.retrieve(configuredId);
        if (existing && !('deleted' in existing) && existing.active) {
          return existing;
        }
      } catch (_err) {
        // fall through to lookup-key search / creation
      }
    }

    const existing = await stripe.prices.list({
      lookup_keys: [lookupKeyForPlan(planCode, interval)],
      active: true,
      limit: 1,
      expand: ['data.product'],
    });

    return existing.data[0] ?? null;
  };

  for (const code of ['starter', 'growth', 'scale'] as const) {
    const plan = byCode.get(code) as Plan;
    const monthlyExisting = await resolveExistingPrice(code, 'monthly');
    const annualExisting = await resolveExistingPrice(code, 'annual');

    const productId = (() => {
      const candidate = monthlyExisting?.product ?? annualExisting?.product;
      if (!candidate) return null;
      return typeof candidate === 'string' ? candidate : candidate.id;
    })();

    const product =
      productId ??
      (await stripe.products.create({
        name: `UGC Studio · ${plan.name}`,
        metadata: {
          plan_code: plan.code,
        },
      })).id;

    if (monthlyExisting) {
      created.monthly[code] = monthlyExisting.id;
    } else {
      const price = await stripe.prices.create({
        product,
        currency: 'usd',
        unit_amount: plan.monthlyPriceUsd * 100,
        recurring: { interval: 'month' },
        lookup_key: lookupKeyForPlan(code, 'monthly'),
        metadata: {
          plan_code: plan.code,
          billing_interval: 'monthly',
        },
      });
      created.monthly[code] = price.id;
    }

    if (annualExisting) {
      created.annual[code] = annualExisting.id;
    } else {
      const annualPrice = await stripe.prices.create({
        product,
        currency: 'usd',
        unit_amount: plan.monthlyPriceUsd * 10 * 100,
        recurring: { interval: 'year' },
        lookup_key: lookupKeyForPlan(code, 'annual'),
        metadata: {
          plan_code: plan.code,
          billing_interval: 'annual',
        },
      });
      created.annual[code] = annualPrice.id;
    }
  }

  const updated = await prisma.systemConfig.upsert({
    where: { id: SYSTEM_CONFIG_ID },
    update: {
      stripePriceIdStarter: created.monthly.starter,
      stripePriceIdGrowth: created.monthly.growth,
      stripePriceIdScale: created.monthly.scale,
      stripePriceIdStarterAnnual: created.annual.starter,
      stripePriceIdGrowthAnnual: created.annual.growth,
      stripePriceIdScaleAnnual: created.annual.scale,
    },
    create: {
      id: SYSTEM_CONFIG_ID,
      stripePriceIdStarter: created.monthly.starter,
      stripePriceIdGrowth: created.monthly.growth,
      stripePriceIdScale: created.monthly.scale,
      stripePriceIdStarterAnnual: created.annual.starter,
      stripePriceIdGrowthAnnual: created.annual.growth,
      stripePriceIdScaleAnnual: created.annual.scale,
    },
  });

  return {
    stripePriceIdStarter: updated.stripePriceIdStarter ?? null,
    stripePriceIdGrowth: updated.stripePriceIdGrowth ?? null,
    stripePriceIdScale: updated.stripePriceIdScale ?? null,
    stripePriceIdStarterAnnual: updated.stripePriceIdStarterAnnual ?? null,
    stripePriceIdGrowthAnnual: updated.stripePriceIdGrowthAnnual ?? null,
    stripePriceIdScaleAnnual: updated.stripePriceIdScaleAnnual ?? null,
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
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new HttpError(400, 'Coupon usage limit reached.');
  }
  return coupon;
};

const claimCouponUsage = async (code: string) => {
  return prisma.$transaction(async (trx) => {
    const coupon = await trx.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      return { applied: false, reason: 'inactive' as const };
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { applied: false, reason: 'expired' as const };
    }
    if (coupon.maxUses === null) {
      await trx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
      return { applied: true as const };
    }
    const updated = await trx.coupon.updateMany({
      where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count === 0) {
      return { applied: false, reason: 'limit' as const };
    }
    return { applied: true as const };
  });
};

export const createStripeCheckoutSessionForTenant = async (args: {
  tenantId: string;
  planCode: PlanCode;
  billingInterval?: BillingInterval;
  customerEmail: string;
  customerName?: string | null;
  couponCode?: string | null;
  marketing?: {
    sessionId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    referrer?: string | null;
    landingPage?: string | null;
  } | null;
  successUrl: string;
  cancelUrl: string;
}) => {
  const { stripe, priceIds } = await getStripeSecrets();
  const billingInterval = args.billingInterval ?? 'monthly';

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }

  const priceId = resolvePlanPriceId(args.planCode, billingInterval, priceIds);

  const coupon = await validateCouponCode(args.couponCode);
  const stripeCouponId = coupon ? await ensureStripeCoupon(stripe, coupon) : null;

  const customerId = await ensureStripeCustomerId(
    stripe,
    tenant.id,
    args.customerEmail,
    args.customerName ?? tenant.billingCompanyName ?? tenant.name,
  );

  const marketingSessionId = args.marketing?.sessionId?.trim() || '';
  const marketingUtmSource = args.marketing?.utmSource?.trim() || '';
  const marketingUtmMedium = args.marketing?.utmMedium?.trim() || '';
  const marketingUtmCampaign = args.marketing?.utmCampaign?.trim() || '';
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
      billing_interval: billingInterval,
      marketing_session_id: marketingSessionId,
      utm_source: marketingUtmSource,
      utm_medium: marketingUtmMedium,
      utm_campaign: marketingUtmCampaign,
    },
    subscription_data: {
      metadata: {
        tenant_id: tenant.id,
        plan_code: args.planCode,
        coupon_code: coupon?.code ?? '',
        billing_interval: billingInterval,
        marketing_session_id: marketingSessionId,
        utm_source: marketingUtmSource,
        utm_medium: marketingUtmMedium,
        utm_campaign: marketingUtmCampaign,
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
      billingInterval,
    },
  });

  if (!session.url) {
    throw new HttpError(500, 'Stripe did not return a checkout URL.');
  }

  if (marketingSessionId) {
    try {
      await trackMarketingEvent({
        eventType: MarketingEventType.checkout_started,
        sessionId: marketingSessionId,
        tenantId: tenant.id,
        utmSource: args.marketing?.utmSource ?? null,
        utmMedium: args.marketing?.utmMedium ?? null,
        utmCampaign: args.marketing?.utmCampaign ?? null,
        referrer: args.marketing?.referrer ?? null,
        landingPage: args.marketing?.landingPage ?? null,
      });
    } catch (err) {
      console.warn('[analytics] checkout_started capture failed', err);
    }
  }

  return { url: session.url, id: session.id };
};

export const createStripeBillingPortalSessionForTenant = async (args: {
  tenantId: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  planCode?: PlanCode;
  billingInterval?: BillingInterval;
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

    const targetInterval = args.billingInterval ?? tenant.billingInterval ?? 'monthly';
    const targetPriceId = resolvePlanPriceId(args.planCode, targetInterval, priceIds);
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

export const listStripeInvoicesForTenant = async (tenantId: string): Promise<TenantInvoiceSummary[]> => {
  const { stripe } = await getStripeSecrets();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }

  if (!tenant.stripeCustomerId) {
    return [];
  }

  const since = Math.floor(subMonths(new Date(), 12).getTime() / 1000);
  const invoices = await stripe.invoices.list({
    customer: tenant.stripeCustomerId,
    created: { gte: since },
    limit: 100,
  });

  return invoices.data
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number ?? null,
      status: invoice.status ?? null,
      amountDue: invoice.amount_due ?? 0,
      amountPaid: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? 'usd',
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      periodStart: invoice.period_start ?? null,
      periodEnd: invoice.period_end ?? null,
      created: invoice.created ?? 0,
    }))
    .sort((a, b) => b.created - a.created);
};

export const scheduleStripeCancellationForTenant = async (tenantId: string) => {
  const { stripe } = await getStripeSecrets();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new HttpError(404, 'Tenant not found.');
  }
  if (!tenant.stripeSubscriptionId) {
    throw new HttpError(400, 'Subscription not found.');
  }

  const subscription = (await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
    cancel_at_period_end: true,
  })) as Stripe.Subscription;
  const item = subscription.items.data[0];
  const interval: BillingInterval = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
  return { subscription, billingInterval: interval };
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

  const planCode = (session.metadata?.plan_code as PlanCode | undefined) ?? null;
  if (!planCode) {
    throw new HttpError(400, 'Missing plan code on checkout session.');
  }

  const couponCode = normalizeCode(session.metadata?.coupon_code ?? '');
  const sessionInterval = normalizeInterval(session.metadata?.billing_interval ?? null);

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  const subscription = typeof session.subscription === 'string' ? null : session.subscription;
  const subscriptionItem = subscription?.items?.data?.[0];
  const recurringInterval = subscriptionItem?.price?.recurring?.interval ?? null;
  const billingInterval = sessionInterval ?? (recurringInterval === 'year' ? 'annual' : 'monthly');
  const subscriptionPeriodStart = subscriptionItem ? new Date(subscriptionItem.current_period_start * 1000) : null;
  const subscriptionPeriodEnd = subscriptionItem ? new Date(subscriptionItem.current_period_end * 1000) : null;
  const subscriptionCancelAt =
    subscription?.cancel_at && Number.isFinite(subscription.cancel_at)
      ? new Date(subscription.cancel_at * 1000)
      : null;

  const alreadyApplied = normalizeCode(tenant.appliedCouponCode) === couponCode && Boolean(couponCode);

  const updatedTenant = await applyPlanChange(tenant.id, planCode, {
    activate: true,
    billingStartDate: subscriptionPeriodStart ?? new Date(),
    paymentStatus: 'active_paid',
    billingInterval,
    subscriptionPeriodStart,
    subscriptionPeriodEnd,
    subscriptionCancelAt,
    subscriptionCanceledAt: null,
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
    const claim = await claimCouponUsage(couponCode);
    if (!claim.applied && claim.reason === 'limit') {
      console.warn('[stripe] Coupon usage limit reached during checkout activation', {
        couponCode,
        tenantId,
        sessionId,
      });
    }
  }

  return updatedTenant;
};

export const processStripeWebhook = async (rawBody: Buffer, signatureHeader: string) => {
  const { stripe, webhookSecret } = await getStripeSecrets();
  if (!webhookSecret) {
    throw new HttpError(400, 'Stripe webhook secret is not configured.');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);

  const ensureStripeEventClaimed = async () => {
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          status: 'processing',
          attempts: 1,
        },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.stripeWebhookEvent.findUnique({
          where: { eventId: event.id },
          select: { status: true },
        });
        if (!existing) {
          throw err;
        }

        if (existing.status === 'processed') {
          return false;
        }

        if (existing.status === 'processing') {
          throw new HttpError(409, 'stripe_event_in_progress');
        }

        const claimed = await prisma.stripeWebhookEvent.updateMany({
          where: { eventId: event.id, status: 'failed' },
          data: {
            status: 'processing',
            attempts: { increment: 1 },
            lastError: null,
            processedAt: null,
          },
        });
        if (claimed.count === 0) {
          throw new HttpError(409, 'stripe_event_in_progress');
        }
        return true;
      }

      throw err;
    }
  };

  const claimed = await ensureStripeEventClaimed();
  if (!claimed) {
    return { received: true };
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const marketingSessionId = session.metadata?.marketing_session_id ?? null;
        if (marketingSessionId) {
          try {
            await trackMarketingEvent({
              eventType: MarketingEventType.payment_completed,
              sessionId: marketingSessionId,
              tenantId: tenantId ?? null,
              utmSource: session.metadata?.utm_source ?? null,
              utmMedium: session.metadata?.utm_medium ?? null,
              utmCampaign: session.metadata?.utm_campaign ?? null,
            });
          } catch (err) {
            console.warn('[analytics] payment_completed capture failed', err);
          }
        }
        if (tenantId) {
          await activateTenantFromCheckoutSessionId(tenantId, session.id);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.parent?.subscription_details?.subscription ?? null;
        const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
        if (subscriptionId) {
          await prisma.tenant.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { paymentStatus: 'past_due' },
          });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.parent?.subscription_details?.subscription ?? null;
        const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
        if (!subscriptionId) break;
        const tenant = await prisma.tenant.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
        if (!tenant) break;

        const { priceIds } = await getStripeSecrets();
        const subscriptionObj = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        });
        const price = subscriptionObj.items.data[0]?.price;
        const subscriptionItem = subscriptionObj.items.data[0];
        const subscriptionPeriodStart = subscriptionItem
          ? new Date(subscriptionItem.current_period_start * 1000)
          : null;
        const subscriptionPeriodEnd = subscriptionItem ? new Date(subscriptionItem.current_period_end * 1000) : null;
        const planMatch = resolvePlanFromPriceId(
          price?.id ?? null,
          priceIds,
          price?.metadata ?? null,
          price?.recurring?.interval ?? null,
        );

        if (planMatch) {
          await applyPlanChange(tenant.id, planMatch.planCode, {
            activate: true,
            resetUsage: false,
            paymentStatus: 'active_paid',
            billingInterval: planMatch.billingInterval,
            stripeCustomerId: subscriptionObj.customer as string,
            stripeSubscriptionId: subscriptionObj.id,
            billingStartDate: subscriptionPeriodStart ?? undefined,
            subscriptionPeriodStart,
            subscriptionPeriodEnd,
            subscriptionCancelAt:
              subscriptionObj.cancel_at && Number.isFinite(subscriptionObj.cancel_at)
                ? new Date(subscriptionObj.cancel_at * 1000)
                : null,
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
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const tenant = await prisma.tenant.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
        if (!tenant) break;

        const { priceIds } = await getStripeSecrets();
        const subscriptionItem = subscription.items.data[0];
        const price = subscriptionItem?.price;
        const planMatch = resolvePlanFromPriceId(
          price?.id ?? null,
          priceIds,
          price?.metadata ?? null,
          price?.recurring?.interval ?? null,
        );
        const subscriptionPeriodStart = subscriptionItem
          ? new Date(subscriptionItem.current_period_start * 1000)
          : null;
        const subscriptionPeriodEnd = subscriptionItem ? new Date(subscriptionItem.current_period_end * 1000) : null;
        const cancelAt =
          subscription.cancel_at && Number.isFinite(subscription.cancel_at)
            ? new Date(subscription.cancel_at * 1000)
            : null;
        const canceledAt =
          subscription.canceled_at && Number.isFinite(subscription.canceled_at)
            ? new Date(subscription.canceled_at * 1000)
            : event.type === 'customer.subscription.deleted'
              ? new Date()
              : null;
        const interval = planMatch?.billingInterval ?? (price?.recurring?.interval === 'year' ? 'annual' : 'monthly');

        if (event.type === 'customer.subscription.deleted') {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              paymentStatus: 'past_due',
              subscriptionPeriodStart: subscriptionPeriodStart ?? tenant.subscriptionPeriodStart,
              subscriptionPeriodEnd: subscriptionPeriodEnd ?? tenant.subscriptionPeriodEnd,
              subscriptionCancelAt: cancelAt ?? tenant.subscriptionCancelAt,
              subscriptionCanceledAt: canceledAt,
              billingInterval: interval ?? tenant.billingInterval,
            },
          });
        } else {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionPeriodStart: subscriptionPeriodStart ?? tenant.subscriptionPeriodStart,
              subscriptionPeriodEnd: subscriptionPeriodEnd ?? tenant.subscriptionPeriodEnd,
              subscriptionCancelAt: cancelAt ?? tenant.subscriptionCancelAt,
              billingInterval: interval ?? tenant.billingInterval,
            },
          });
        }
        break;
      }
      default:
        break;
    }

    await prisma.stripeWebhookEvent.updateMany({
      where: { eventId: event.id, status: 'processing' },
      data: {
        status: 'processed',
        processedAt: new Date(),
        lastError: null,
      },
    });

    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook_failed';
    await prisma.stripeWebhookEvent
      .updateMany({
        where: { eventId: event.id, status: 'processing' },
        data: {
          status: 'failed',
          lastError: message.slice(0, 1000),
        },
      })
      .catch(() => undefined);
    throw err;
  }
};
