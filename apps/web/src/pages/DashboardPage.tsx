import { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { useUsage } from '../hooks/useUsage';
import { useJobs } from '../hooks/useJobs';
import type { Job } from '../hooks/useJobs';
import { formatPlanSummary } from '../lib/plans';
import api from '../lib/api';

const DashboardPage = () => {
  const { isOwner, tenant, tenantStatus, token } = useAuth();
  const { data: usage } = useUsage(Boolean(token) && !isOwner);
  const { jobs } = useJobs(1, undefined, undefined, !isOwner);
  const recentJobs: Job[] = jobs.slice(0, 5);
  const planLimit = usage?.plan?.monthly_limit ?? null;
  const planCode = usage?.plan?.code ?? null;
  const isUnlimited = Boolean(planCode) && planLimit === null;
  const remaining =
    usage && !isUnlimited && planLimit !== null ? Math.max(planLimit - usage.used, 0) : usage?.credits_left ?? null;
  const status = tenantStatus ?? (isOwner ? 'owner' : 'active');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  if (isOwner) {
    return (
      <section className="space-y-6 text-slate-100">
        <div>
          <h1 className="text-3xl font-semibold text-white">Owner console</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage tenants, billing state, CMS content, and system integrations.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tenants</p>
            <p className="mt-2 text-lg font-semibold text-white">Approve signups & impersonate</p>
            <p className="mt-1 text-sm text-slate-400">Review pending requests, change plans, and open tenant sessions.</p>
          </div>
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">System</p>
            <p className="mt-2 text-lg font-semibold text-white">SMTP + Stripe configuration</p>
            <p className="mt-1 text-sm text-slate-400">Set notification delivery and billing keys without redeploys.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8 text-slate-100">
      <div>
        <h1 className="text-3xl font-semibold text-white">Realtime cockpit</h1>
        <p className="text-sm text-slate-400">Monitor quota drift and the last UGC batches in one place.</p>
      </div>

      {tenantStatus && tenantStatus !== 'active' && (
        <div
          className={`rounded-3xl border p-4 text-sm ${
            tenantStatus === 'pending'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-100'
          }`}
        >
          {tenantStatus === 'pending' ? (
            <div className="space-y-3">
              <p>Your account is pending activation. Complete payment to unlock video generation.</p>
              {activationError && <p className="text-xs text-rose-200">{activationError}</p>}
              <button
                type="button"
                className="rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
                disabled={activationLoading}
                onClick={async () => {
                  setActivationError(null);
                  setActivationLoading(true);
                  try {
                    const { data } = await api.post('/tenant/billing/checkout', {});
                    if (data?.url) {
                      window.location.href = data.url;
                      return;
                    }
                    setActivationError('Checkout URL not available.');
                  } catch (err: any) {
                    console.error(err);
                    const serverError = err?.response?.data?.error;
                    setActivationError(typeof serverError === 'string' ? serverError : 'Unable to start checkout.');
                  } finally {
                    setActivationLoading(false);
                  }
                }}
              >
                {activationLoading ? 'Opening checkout…' : 'Pay now'}
              </button>
            </div>
          ) : (
            'Your account is currently suspended. Reach out to support to resolve billing or compliance issues.'
          )}
        </div>
      )}

      {usage && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Plan</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {isUnlimited
                ? `${usage.plan?.name ?? tenant?.planName ?? usage.plan?.code ?? 'Plan'} · Unlimited videos/month`
                : formatPlanSummary(
                    usage.plan?.code,
                    usage.plan?.name ?? tenant?.planName ?? null,
                    usage.plan?.monthly_limit ?? tenant?.monthlyVideoLimit ?? null,
                  )}
            </p>
            <p className="text-xs text-slate-400 capitalize">Status: {status}</p>
            {isUnlimited ? (
              <p className="text-xs text-slate-400">Unlimited videos</p>
            ) : planLimit !== null ? (
              <p className="text-xs text-slate-400">{planLimit} videos / month</p>
            ) : (
              <p className="text-xs text-slate-400">No plan</p>
            )}
          </div>
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Credits used</p>
            <p className="mt-2 text-2xl font-semibold text-white">{usage.used}</p>
          </div>
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Credits left</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {isUnlimited ? '∞' : remaining !== null ? remaining : '—'}
            </p>
          </div>
        </div>
      )}
      {usage && (
        <div
          className={`rounded-3xl border p-4 text-sm ${
            !isUnlimited && planLimit !== null && planLimit - usage.used <= 0
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
              : !isUnlimited && planLimit !== null && planLimit - usage.used <= 3
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              : 'border-white/5 bg-slate-900/70 text-slate-200'
          }`}
        >
          {isUnlimited
            ? 'Unlimited quota is enabled for this workspace.'
            : planLimit === null
            ? 'No plan assigned yet. Contact support so we can attach your workspace to a plan.'
            : planLimit - usage.used <= 0
            ? "You've reached your monthly video limit. Ping support or your owner contact to upgrade."
            : planLimit - usage.used <= 3
            ? `Only ${Math.max(planLimit - usage.used, 0)} videos remain this cycle. Contact support to pre-upgrade your plan.`
            : 'Keep creating—usage automatically resets on your configured billing day.'}
          {tenant?.requestedPlanCode && (
            <p className="mt-2 text-xs text-amber-200">
              Upgrade requested: {tenant.requestedPlanCode}. We&apos;ll notify you once it&apos;s approved.
            </p>
          )}
        </div>
      )}

      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent jobs</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Newest first</p>
        </div>
        <div className="space-y-4">
          {recentJobs.map((job: Job) => {
            const isProcessing = job.status === 'pending' || job.status === 'processing';
            const statusClass =
              job.status === 'completed'
                ? 'bg-emerald-500/20 text-emerald-200'
                : isProcessing
                ? 'bg-amber-500/20 text-amber-100'
                : job.status === 'failed'
                ? 'bg-rose-500/20 text-rose-100'
                : 'bg-sky-500/20 text-sky-100';
            return (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {job.productName ?? 'UGC video'} • {new Date(job.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {job.language ?? 'multi-lang'} • {job.platform ?? 'multi-platform'} • {job.voiceProfile ?? 'voice profile'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{job.status}</span>
              </div>
            );
          })}
          {recentJobs.length === 0 && <p className="text-sm text-slate-400">No jobs yet.</p>}
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
