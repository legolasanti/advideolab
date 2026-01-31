import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type AnalyticsResponse = {
  range: { start: string; end: string };
  metrics: {
    activeTenants: number;
    mrrUsd: number;
    newSignups: number;
    churnCount: number;
    churnRate: number;
    totalVideos: number;
  };
  planDistribution: {
    total: number;
    items: Array<{ planCode: string; count: number; percent: number }>;
  };
  funnel: Array<{ eventType: string; count: number; percent: number }>;
  marketing: {
    sources: Array<{ source: string; medium: string; campaign: string; sessions: number }>;
    referrers: Array<{ referrer: string; sessions: number }>;
  };
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);

const OwnerAnalyticsPage = () => {
  const { isOwner } = useAuth();
  const [rangePreset, setRangePreset] = useState<'today' | '7d' | '30d' | '90d' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (rangePreset === 'custom') {
      const startDate = customStart ? new Date(`${customStart}T00:00:00`) : startOfDay(now);
      const endDate = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfDay(now);
      return { start: startDate, end: endDate };
    }

    const days =
      rangePreset === 'today' ? 0 : rangePreset === '7d' ? 6 : rangePreset === '30d' ? 29 : 89;
    const startDate = startOfDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
    return { start: startDate, end: endOfDay(now) };
  }, [customEnd, customStart, rangePreset]);

  const analyticsQuery = useQuery<AnalyticsResponse>({
    queryKey: ['ownerAnalytics', start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data } = await api.get('/owner/analytics', {
        params: { start: start.toISOString(), end: end.toISOString() },
      });
      return data as AnalyticsResponse;
    },
    enabled: isOwner,
  });

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  const metrics = analyticsQuery.data?.metrics;
  const planItems = analyticsQuery.data?.planDistribution.items ?? [];
  const funnel = analyticsQuery.data?.funnel ?? [];
  const sources = analyticsQuery.data?.marketing.sources ?? [];
  const referrers = analyticsQuery.data?.marketing.referrers ?? [];

  return (
    <section className="space-y-8 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <h1 className="text-3xl font-semibold text-white">Analytics dashboard</h1>
        <p className="text-sm text-slate-400">Track growth, revenue, and conversion performance across the platform.</p>
      </header>

      <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">Date range</p>
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 days' },
              { id: '30d', label: 'Last 30 days' },
              { id: '90d', label: 'Last 90 days' },
            ] as const).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setRangePreset(preset.id)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  rangePreset === preset.id
                    ? 'bg-indigo-500 text-white'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRangePreset('custom')}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                rangePreset === 'custom'
                  ? 'bg-indigo-500 text-white'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              Custom
            </button>
          </div>
        </div>
        {rangePreset === 'custom' && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs text-slate-400">
              Start date
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-xs text-slate-400">
              End date
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
        )}
      </section>

      {analyticsQuery.isLoading ? (
        <p className="text-sm text-slate-400">Loading analytics...</p>
      ) : analyticsQuery.isError ? (
        <p className="text-sm text-rose-300">Unable to load analytics. Try again shortly.</p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-5">
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Active tenants</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics?.activeTenants ?? 0}</p>
              <p className="text-xs text-slate-400">Current</p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">MRR</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatUsd(metrics?.mrrUsd ?? 0)}</p>
              <p className="text-xs text-slate-400">Current run-rate</p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">New signups</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics?.newSignups ?? 0}</p>
              <p className="text-xs text-slate-400">In range</p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Churn</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics?.churnRate ?? 0}%</p>
              <p className="text-xs text-slate-400">{metrics?.churnCount ?? 0} cancellations</p>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Videos generated</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metrics?.totalVideos ?? 0}</p>
              <p className="text-xs text-slate-400">In range</p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Plan distribution</h2>
              <p className="mt-1 text-sm text-slate-400">Active tenants by plan.</p>
              <div className="mt-4 space-y-3">
                {planItems.length === 0 && <p className="text-sm text-slate-400">No active tenants yet.</p>}
                {planItems.map((plan) => (
                  <div key={plan.planCode} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white capitalize">{plan.planCode}</p>
                      <p className="text-xs text-slate-400">
                        {plan.count} tenants · {plan.percent}%
                      </p>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-indigo-400" style={{ width: `${plan.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Conversion funnel</h2>
              <p className="mt-1 text-sm text-slate-400">Session-based conversion rates.</p>
              <div className="mt-4 space-y-3">
                {funnel.length === 0 && <p className="text-sm text-slate-400">No funnel data yet.</p>}
                {funnel.map((step) => (
                  <div key={step.eventType} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{step.eventType.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-400">
                        {step.count} sessions · {step.percent}%
                      </p>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${step.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Top sources</h2>
              <p className="mt-1 text-sm text-slate-400">UTM sources driving visits.</p>
              <div className="mt-4 space-y-3">
                {sources.length === 0 && <p className="text-sm text-slate-400">No source data yet.</p>}
                {sources.map((source, index) => (
                  <div key={`${source.source}-${source.medium}-${source.campaign}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-sm font-semibold text-white">{source.source}</p>
                    <p className="text-xs text-slate-400">
                      {source.medium} · {source.campaign} · {source.sessions} sessions
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">Top referrers</h2>
              <p className="mt-1 text-sm text-slate-400">External traffic sources.</p>
              <div className="mt-4 space-y-3">
                {referrers.length === 0 && <p className="text-sm text-slate-400">No referrer data yet.</p>}
                {referrers.map((referrer, index) => (
                  <div key={`${referrer.referrer}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-sm font-semibold text-white">{referrer.referrer}</p>
                    <p className="text-xs text-slate-400">{referrer.sessions} sessions</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
};

export default OwnerAnalyticsPage;
