import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { useUsage } from '../hooks/useUsage';
import { PLAN_DEFINITIONS, formatPlanSummary } from '../lib/plans';
import type { PlanCode } from '../lib/plans';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import { getMarketingContext } from '../lib/marketing';

type InvoiceSummary = {
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

const formatInvoiceAmount = (amount: number, currency: string) => {
  const normalized = (currency || 'usd').toUpperCase();
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalized,
    maximumFractionDigits: 2,
  }).format(amount / 100);
};

const formatInvoiceDate = (timestamp: number | null) => {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toLocaleDateString();
};

const formatInvoiceStatus = (status?: string | null) => {
  if (!status) return 'unknown';
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { tenant, token, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: usage } = useUsage(Boolean(token));
  const [message, setMessage] = useState<string | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>(tenant?.billingInterval ?? 'monthly');
  const [cancelReason, setCancelReason] = useState('too_expensive');
  const [cancelDetails, setCancelDetails] = useState('');
  const [cancelSatisfaction, setCancelSatisfaction] = useState('3');
  const [cancelWouldReturn, setCancelWouldReturn] = useState('maybe');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const planLimit = usage?.plan?.monthly_limit ?? null;
  const isUnlimited = Boolean(usage?.plan?.code) && planLimit === null;
  const needsPayment = tenant?.status === 'pending' || tenant?.paymentStatus === 'payment_pending';
  const cancellationScheduled =
    tenant?.subscriptionCancelAt && new Date(tenant.subscriptionCancelAt).getTime() > Date.now();

  const deriveCurrentPlanCode = (): PlanCode => {
    if (usage?.plan?.code && usage.plan.code in PLAN_DEFINITIONS) {
      return usage.plan.code as PlanCode;
    }
    if (tenant?.planCode && tenant.planCode in PLAN_DEFINITIONS) {
      return tenant.planCode as PlanCode;
    }
    if (tenant?.requestedPlanCode && tenant.requestedPlanCode in PLAN_DEFINITIONS) {
      return tenant.requestedPlanCode as PlanCode;
    }
    return 'starter';
  };

  const currentPlanCode = useMemo(() => deriveCurrentPlanCode(), [tenant, usage]);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(currentPlanCode);

  useEffect(() => {
    setSelectedPlan(currentPlanCode);
  }, [currentPlanCode]);

  useEffect(() => {
    if (tenant?.billingInterval) {
      setBillingInterval(tenant.billingInterval);
    }
  }, [tenant?.billingInterval]);

  useEffect(() => {
    if (searchParams.get('billing') !== '1') return;
    setMessage('Billing updated. Refreshing…');
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ['usage'] });
    const next = new URLSearchParams(searchParams);
    next.delete('billing');
    setSearchParams(next, { replace: true });
  }, [queryClient, refreshProfile, searchParams, setSearchParams]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setInvoiceLoading(true);
    setInvoiceError(null);
    api
      .get('/tenant/billing/invoices')
      .then(({ data }) => {
        if (cancelled) return;
        setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const serverError = err?.response?.data?.error;
        setInvoiceError(typeof serverError === 'string' ? serverError : 'Unable to load invoices.');
      })
      .finally(() => {
        if (cancelled) return;
        setInvoiceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant?.stripeCustomerId]);

  const openStripe = async (planCode?: PlanCode, interval?: 'monthly' | 'annual') => {
    setMessage(null);
    setStripeLoading(true);
    try {
      const payload = planCode ? { planCode, billingInterval: interval ?? billingInterval } : { billingInterval: interval ?? billingInterval };
      const { data } = await api.post('/tenant/billing/portal', payload);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setMessage('Stripe URL not available.');
    } catch (err: any) {
      console.error(err);
      const serverError = err?.response?.data?.error;
      setMessage(typeof serverError === 'string' ? serverError : 'Unable to open Stripe.');
    } finally {
      setStripeLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Tenant settings</h1>
        <p className="text-slate-400">Manage your subscription plan and request quota changes.</p>
      </div>
      {message && <p className="rounded-md bg-green-900/50 px-3 py-2 text-sm text-green-200">{message}</p>}

      {needsPayment && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Activation required</h2>
          <p className="text-sm text-amber-100">
            Your workspace is pending activation. Complete payment to unlock video generation.
          </p>
          <Button
            type="button"
            size="md"
            disabled={activationLoading}
            onClick={async () => {
              setMessage(null);
              setActivationLoading(true);
              try {
                const marketing = getMarketingContext();
                const { data } = await api.post('/tenant/billing/checkout', {
                  planCode: selectedPlan,
                  billingInterval,
                  marketing,
                });
                if (data?.url) {
                  window.location.href = data.url;
                  return;
                }
                setMessage('Checkout URL not available.');
              } catch (err: any) {
                console.error(err);
                const serverError = err?.response?.data?.error;
                setMessage(typeof serverError === 'string' ? serverError : 'Unable to start checkout.');
              } finally {
                setActivationLoading(false);
              }
            }}
          >
            {activationLoading ? 'Opening checkout…' : 'Pay now'}
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Plan & billing</h2>
        <p className="text-sm text-slate-400">
          You&apos;re currently on{' '}
          {isUnlimited
            ? `${usage?.plan?.name ?? tenant?.planName ?? usage?.plan?.code ?? 'Plan'} · Unlimited videos/month`
            : formatPlanSummary(
                usage?.plan?.code,
                usage?.plan?.name ?? tenant?.planName ?? null,
                usage?.plan?.monthly_limit ?? tenant?.monthlyVideoLimit ?? null,
              )}{' '}
          · status {tenant?.status ?? 'pending'}.
        </p>
        <div className="inline-flex rounded-full border border-white/10 bg-slate-900/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => setBillingInterval('monthly')}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              billingInterval === 'monthly' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval('annual')}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              billingInterval === 'annual' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            Annual · 2 months free
          </button>
        </div>
        <FormField label="Select a plan">
          <select
            value={selectedPlan}
            onChange={(event) => setSelectedPlan(event.target.value as PlanCode)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
          >
            {Object.values(PLAN_DEFINITIONS).map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} · {plan.quota} videos/month · $
                {billingInterval === 'annual' ? plan.annualPriceUsd : plan.priceUsd}
                {billingInterval === 'annual' ? '/yr' : '/mo'}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            disabled={stripeLoading || needsPayment}
            onClick={() => openStripe()}
          >
            {stripeLoading ? 'Opening Stripe…' : 'Manage billing in Stripe'}
          </Button>
          <Button
            type="button"
            disabled={
              stripeLoading ||
              needsPayment ||
              (selectedPlan === currentPlanCode && billingInterval === (tenant?.billingInterval ?? 'monthly'))
            }
            onClick={() => openStripe(selectedPlan, billingInterval)}
          >
            {stripeLoading ? 'Opening Stripe…' : `Switch to ${PLAN_DEFINITIONS[selectedPlan].name}`}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Plan changes are handled securely in Stripe. It can take a few seconds after checkout for your new quota to
          appear.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Billing history</h2>
          <p className="text-sm text-slate-400">Download invoices and receipts from the last 12 months.</p>
        </div>

        {invoiceLoading && <p className="text-sm text-slate-400">Loading invoices…</p>}
        {invoiceError && <p className="text-sm text-rose-300">{invoiceError}</p>}

        {!invoiceLoading && !invoiceError && invoices.length === 0 && (
          <p className="text-sm text-slate-400">No invoices yet. Your Stripe history will appear here after billing.</p>
        )}

        <div className="space-y-3">
          {invoices.map((invoice) => {
            const periodStart = formatInvoiceDate(invoice.periodStart ?? invoice.created);
            const periodEnd = formatInvoiceDate(invoice.periodEnd);
            const periodLabel = periodEnd ? `${periodStart} → ${periodEnd}` : periodStart ?? '—';
            const amount = invoice.amountPaid > 0 ? invoice.amountPaid : invoice.amountDue;
            const statusLabel = formatInvoiceStatus(invoice.status);
            const invoiceLabel = invoice.number ? `Invoice ${invoice.number}` : `Invoice ${invoice.id.slice(-8)}`;

            return (
              <div
                key={invoice.id}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{invoiceLabel}</p>
                  <p className="text-xs text-slate-400">Period {periodLabel}</p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <p className="text-sm font-semibold text-white">{formatInvoiceAmount(amount, invoice.currency)}</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">
                    {statusLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoice.hostedInvoiceUrl && (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-white transition hover:border-white/30 hover:bg-white/10"
                    >
                      View invoice
                    </a>
                  )}
                  {invoice.invoicePdf && (
                    <a
                      href={invoice.invoicePdf}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:border-white/30 hover:bg-white/20"
                    >
                      Download PDF
                    </a>
                  )}
                  {!invoice.hostedInvoiceUrl && !invoice.invoicePdf && (
                    <span className="text-xs text-slate-500">Links unavailable</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Cancel subscription</h2>
        <p className="text-sm text-slate-400">
          We hate to see you go. Share a quick exit survey so we can improve.
        </p>

        {cancellationScheduled ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Cancellation is scheduled for{' '}
            <span className="font-semibold">
              {new Date(tenant?.subscriptionCancelAt ?? '').toLocaleDateString()}
            </span>
            . You will keep access until then.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Main reason
              <select
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
              >
                <option value="too_expensive">Too expensive</option>
                <option value="missing_features">Missing features</option>
                <option value="not_using">Not using enough</option>
                <option value="switching_tool">Switching to another tool</option>
                <option value="buggy">Technical issues / bugs</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Satisfaction (1-5)
              <select
                value={cancelSatisfaction}
                onChange={(event) => setCancelSatisfaction(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
              >
                <option value="1">1 - Very dissatisfied</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 - Very satisfied</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Would you return?
              <select
                value={cancelWouldReturn}
                onChange={(event) => setCancelWouldReturn(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
              >
                <option value="yes">Yes</option>
                <option value="maybe">Maybe</option>
                <option value="no">No</option>
              </select>
            </label>
            <FormField
              label="Anything we can improve?"
              className="md:col-span-2"
              hint="Tell us what would make you stay."
            >
              <textarea
                value={cancelDetails}
                onChange={(event) => setCancelDetails(event.target.value)}
                rows={3}
                placeholder="Tell us what would make you stay"
                className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
              />
            </FormField>
          </div>
        )}

        {cancelSuccess && <p className="text-sm text-emerald-200">{cancelSuccess}</p>}
        {cancelError && <p className="text-sm text-rose-300">{cancelError}</p>}

        {!cancellationScheduled && (
          <Button
            type="button"
            variant="danger"
            disabled={cancelLoading || needsPayment}
            onClick={async () => {
              setCancelSuccess(null);
              setCancelError(null);
              if (cancelReason === 'other' && !cancelDetails.trim()) {
                setCancelError('Please share a short note for the "Other" reason.');
                return;
              }
              const confirmed = window.confirm(
                'Are you sure? Your subscription will remain active until the end of the current billing period.',
              );
              if (!confirmed) return;
              setCancelLoading(true);
              try {
                const { data } = await api.post('/tenant/billing/cancel', {
                  reason: cancelReason,
                  details: cancelDetails.trim() || undefined,
                  satisfaction: Number(cancelSatisfaction),
                  wouldReturn: cancelWouldReturn,
                });
                const effective = data?.effectiveAt ? new Date(data.effectiveAt).toLocaleDateString() : null;
                const scheduledCopy = effective
                  ? `Cancellation scheduled for ${effective}.`
                  : 'Cancellation scheduled. You will receive a confirmation email shortly.';
                setCancelSuccess(data?.alreadyScheduled ? 'Cancellation is already scheduled for this billing period.' : scheduledCopy);
                if (data?.emailSent === false) {
                  setCancelError('Cancellation was scheduled, but we could not send the confirmation email. Please contact support.');
                }
                refreshProfile();
              } catch (err: any) {
                const serverError = err?.response?.data?.error;
                if (serverError === 'cancel_already_scheduled') {
                  setCancelSuccess('Cancellation is already scheduled for the end of your billing period.');
                  await refreshProfile();
                  return;
                }
                if (serverError === 'subscription_already_canceled') {
                  setCancelError('Your subscription is already canceled.');
                  return;
                }
                setCancelError(typeof serverError === 'string' ? serverError : 'Unable to cancel subscription.');
              } finally {
                setCancelLoading(false);
              }
            }}
          >
            {cancelLoading ? 'Submitting...' : 'Cancel subscription'}
          </Button>
        )}
      </div>
    </section>
  );
};

export default SettingsPage;
