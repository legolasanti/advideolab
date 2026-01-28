import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const reasonLabels: Record<string, string> = {
  too_expensive: 'Too expensive',
  missing_features: 'Missing features',
  not_using: 'Not using enough',
  switching_tool: 'Switching tool',
  buggy: 'Technical issues',
  other: 'Other',
};

const reasonColors: Record<string, string> = {
  too_expensive: '#ef4444',
  missing_features: '#f97316',
  not_using: '#eab308',
  switching_tool: '#22c55e',
  buggy: '#3b82f6',
  other: '#8b5cf6',
};

type CancellationItem = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  userEmail: string | null;
  planCode: string | null;
  billingInterval: 'monthly' | 'annual';
  reason: string;
  details: any;
  monthsActive: number | null;
  requestedAt: string;
  effectiveAt: string | null;
  canceledAt: string | null;
};

type CancellationResponse = {
  summary: {
    total: number;
    byPlan: Record<string, number>;
    byInterval: Record<string, number>;
    byReason: Record<string, number>;
    avgMonthsActive: number;
  };
  items: CancellationItem[];
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

// Simple bar chart component
const BarChart = ({ data, title }: { data: Record<string, number>; title: string }) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h3 className="mb-4 text-sm font-medium text-slate-300">{title}</h3>
      <div className="space-y-3">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{reasonLabels[key] ?? key}</span>
              <span className="text-white font-medium">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(value / maxValue) * 100}%`,
                  backgroundColor: reasonColors[key] ?? '#6366f1',
                }}
              />
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-slate-500">No data available</p>
        )}
      </div>
    </div>
  );
};

// Simple pie chart component
const PieChart = ({ data, title }: { data: Record<string, number>; title: string }) => {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  let cumulativePercent = 0;
  const segments = entries.map(([key, value]) => {
    const percent = total > 0 ? (value / total) * 100 : 0;
    const startPercent = cumulativePercent;
    cumulativePercent += percent;
    return { key, value, percent, startPercent };
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h3 className="mb-4 text-sm font-medium text-slate-300">{title}</h3>
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            {segments.map((seg, i) => {
              const strokeDasharray = `${seg.percent} ${100 - seg.percent}`;
              const strokeDashoffset = -seg.startPercent;
              return (
                <circle
                  key={seg.key}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke={reasonColors[seg.key] ?? `hsl(${i * 60}, 70%, 50%)`}
                  strokeWidth="20"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  pathLength="100"
                />
              );
            })}
            {total === 0 && (
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#334155" strokeWidth="20" />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-white">{total}</span>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: reasonColors[seg.key] ?? '#6366f1' }}
              />
              <span className="text-slate-400">{reasonLabels[seg.key] ?? seg.key}</span>
              <span className="text-white font-medium">{seg.percent.toFixed(0)}%</span>
            </div>
          ))}
          {total === 0 && <p className="text-slate-500">No data</p>}
        </div>
      </div>
    </div>
  );
};

const OwnerCancellationsPage = () => {
  const [showAnalytics, setShowAnalytics] = useState(true);

  const { data, isLoading } = useQuery<CancellationResponse>({
    queryKey: ['owner-cancellations'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cancellations');
      return data;
    },
  });

  // Deduplicate: show only the latest cancellation per tenant
  const deduplicatedItems = useMemo(() => {
    if (!data?.items) return [];
    const byTenant = new Map<string, CancellationItem>();
    // Items are already sorted by requestedAt desc, so first occurrence is the latest
    for (const item of data.items) {
      if (!byTenant.has(item.tenantId)) {
        byTenant.set(item.tenantId, item);
      }
    }
    return Array.from(byTenant.values());
  }, [data?.items]);

  // Recalculate summary based on deduplicated items
  const deduplicatedSummary = useMemo(() => {
    if (!data?.summary) return null;

    const byReason: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    const byInterval: Record<string, number> = {};
    let monthsSum = 0;
    let monthsCount = 0;

    for (const item of deduplicatedItems) {
      const reasonKey = item.reason ?? 'unknown';
      const planKey = item.planCode ?? 'unknown';
      const intervalKey = item.billingInterval ?? 'monthly';

      byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;
      byPlan[planKey] = (byPlan[planKey] ?? 0) + 1;
      byInterval[intervalKey] = (byInterval[intervalKey] ?? 0) + 1;

      if (typeof item.monthsActive === 'number') {
        monthsSum += item.monthsActive;
        monthsCount += 1;
      }
    }

    return {
      total: deduplicatedItems.length,
      byReason,
      byPlan,
      byInterval,
      avgMonthsActive: monthsCount > 0 ? Math.round((monthsSum / monthsCount) * 10) / 10 : 0,
    };
  }, [deduplicatedItems, data?.summary]);

  const summaryCards = useMemo(() => {
    if (!deduplicatedSummary) return [];
    return [
      { label: 'Total cancellations', value: deduplicatedSummary.total },
      { label: 'Avg. months active', value: deduplicatedSummary.avgMonthsActive },
      { label: 'Monthly plans', value: deduplicatedSummary.byInterval.monthly ?? 0 },
      { label: 'Annual plans', value: deduplicatedSummary.byInterval.annual ?? 0 },
    ];
  }, [deduplicatedSummary]);

  const exportToCSV = () => {
    if (!deduplicatedItems.length) return;

    const headers = ['Tenant', 'Email', 'Plan', 'Interval', 'Months Active', 'Reason', 'Effective Date', 'Requested Date'];
    const rows = deduplicatedItems.map((item) => [
      item.tenantName ?? item.tenantId,
      item.userEmail ?? '',
      item.planCode ?? '',
      item.billingInterval,
      item.monthsActive?.toString() ?? '',
      reasonLabels[item.reason] ?? item.reason,
      item.effectiveAt ? new Date(item.effectiveAt).toISOString().split('T')[0] : '',
      item.requestedAt ? new Date(item.requestedAt).toISOString().split('T')[0] : '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cancellations-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Subscription Cancellations</h1>
          <p className="text-sm text-slate-400">Track churn reasons, tenure, and plan mix in one place.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition"
          >
            {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
          </button>
          <button
            onClick={exportToCSV}
            disabled={!deduplicatedItems.length}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Analytics Section */}
      {showAnalytics && (
        <div className="grid gap-4 md:grid-cols-2">
          <BarChart data={deduplicatedSummary?.byReason ?? {}} title="Cancellation Reasons" />
          <PieChart data={deduplicatedSummary?.byReason ?? {}} title="Reason Distribution" />
          <BarChart data={deduplicatedSummary?.byPlan ?? {}} title="By Plan" />
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="mb-4 text-sm font-medium text-slate-300">Billing Interval</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/5 p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{deduplicatedSummary?.byInterval.monthly ?? 0}</p>
                <p className="mt-1 text-xs text-slate-400">Monthly</p>
              </div>
              <div className="rounded-xl bg-white/5 p-4 text-center">
                <p className="text-3xl font-bold text-purple-400">{deduplicatedSummary?.byInterval.annual ?? 0}</p>
                <p className="mt-1 text-xs text-slate-400">Annual</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reason Pills */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
        <div className="flex flex-wrap gap-4 text-xs text-slate-300">
          {Object.entries(deduplicatedSummary?.byReason ?? {}).map(([reason, count]) => (
            <div
              key={reason}
              className="rounded-full border border-white/10 px-3 py-1 flex items-center gap-2"
              style={{ backgroundColor: `${reasonColors[reason] ?? '#6366f1'}20` }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: reasonColors[reason] ?? '#6366f1' }}
              />
              {reasonLabels[reason] ?? reason}: {count}
            </div>
          ))}
          {!isLoading && Object.keys(deduplicatedSummary?.byReason ?? {}).length === 0 && (
            <span>No cancellation reasons yet.</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="p-3 font-medium">Tenant</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Interval</th>
              <th className="p-3 font-medium">Months Active</th>
              <th className="p-3 font-medium">Reason</th>
              <th className="p-3 font-medium">Effective</th>
              <th className="p-3 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-500">Loading...</td>
              </tr>
            )}
            {!isLoading && deduplicatedItems.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-500">No cancellations recorded.</td>
              </tr>
            )}
            {deduplicatedItems.map((item) => (
              <tr key={item.id} className="hover:bg-white/5">
                <td className="p-3">
                  <div className="font-semibold text-white">{item.tenantName ?? item.tenantId}</div>
                  <div className="text-xs text-slate-400">{item.userEmail ?? '—'}</div>
                </td>
                <td className="p-3 text-slate-200">{item.planCode ?? '—'}</td>
                <td className="p-3 text-slate-200">{item.billingInterval}</td>
                <td className="p-3 text-slate-200">{item.monthsActive ?? '—'}</td>
                <td className="p-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${reasonColors[item.reason] ?? '#6366f1'}20`,
                      color: reasonColors[item.reason] ?? '#6366f1',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: reasonColors[item.reason] ?? '#6366f1' }}
                    />
                    {reasonLabels[item.reason] ?? item.reason}
                  </span>
                </td>
                <td className="p-3 text-slate-200">{formatDate(item.effectiveAt)}</td>
                <td className="p-3 text-slate-200">{formatDate(item.requestedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default OwnerCancellationsPage;
