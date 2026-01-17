import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { useUsage } from '../hooks/useUsage';
import { PLAN_DEFINITIONS, formatPlanSummary } from '../lib/plans';
import type { PlanCode } from '../lib/plans';

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { tenant, token, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: usage } = useUsage(Boolean(token));
  const [message, setMessage] = useState<string | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const planLimit = usage?.plan?.monthly_limit ?? null;
  const isUnlimited = Boolean(usage?.plan?.code) && planLimit === null;
  const needsPayment = tenant?.status === 'pending' || tenant?.paymentStatus === 'payment_pending';

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
    if (searchParams.get('billing') !== '1') return;
    setMessage('Billing updated. Refreshing…');
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ['usage'] });
    const next = new URLSearchParams(searchParams);
    next.delete('billing');
    setSearchParams(next, { replace: true });
  }, [queryClient, refreshProfile, searchParams, setSearchParams]);

  const openStripe = async (planCode?: PlanCode) => {
    setMessage(null);
    setStripeLoading(true);
    try {
      const payload = planCode ? { planCode } : {};
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
          <button
            type="button"
            className="rounded-lg bg-indigo-500 hover:bg-indigo-400 transition-colors px-4 py-2 text-white disabled:opacity-50 font-semibold"
            disabled={activationLoading}
            onClick={async () => {
              setMessage(null);
              setActivationLoading(true);
              try {
                const { data } = await api.post('/tenant/billing/checkout', { planCode: selectedPlan });
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
          </button>
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
        <label className="text-sm font-medium text-slate-300">Select a plan</label>
        <select
          value={selectedPlan}
          onChange={(event) => setSelectedPlan(event.target.value as PlanCode)}
          className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-white"
        >
          {Object.values(PLAN_DEFINITIONS).map((plan) => (
            <option key={plan.code} value={plan.code}>
              {plan.name} · {plan.quota} videos/month · ${plan.priceUsd}/mo
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <button
            type="button"
            className="rounded-lg bg-white/5 hover:bg-white/10 transition-colors px-4 py-2 text-white disabled:opacity-50 font-semibold"
            disabled={stripeLoading || needsPayment}
            onClick={() => openStripe()}
          >
            {stripeLoading ? 'Opening Stripe…' : 'Manage billing in Stripe'}
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2 text-white disabled:opacity-50 font-semibold"
            disabled={stripeLoading || needsPayment || selectedPlan === currentPlanCode}
            onClick={() => openStripe(selectedPlan)}
          >
            {stripeLoading ? 'Opening Stripe…' : `Switch to ${PLAN_DEFINITIONS[selectedPlan].name}`}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Plan changes are handled securely in Stripe. It can take a few seconds after checkout for your new quota to
          appear.
        </p>
      </div>
    </section>
  );
};

export default SettingsPage;
