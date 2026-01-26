import { useMemo } from 'react';
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

const OwnerCancellationsPage = () => {
  const { data, isLoading } = useQuery<CancellationResponse>({
    queryKey: ['owner-cancellations'],
    queryFn: async () => {
      const { data } = await api.get('/owner/cancellations');
      return data;
    },
  });

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Total cancellations', value: data.summary.total },
      { label: 'Avg. months active', value: data.summary.avgMonthsActive },
      { label: 'Monthly plans', value: data.summary.byInterval.monthly ?? 0 },
      { label: 'Annual plans', value: data.summary.byInterval.annual ?? 0 },
    ];
  }, [data]);

  return (
    <section className="space-y-6 text-slate-100">
      <div>
        <h1 className="text-3xl font-semibold text-white">Subscription Cancellations</h1>
        <p className="text-sm text-slate-400">Track churn reasons, tenure, and plan mix in one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
        <div className="flex flex-wrap gap-4 text-xs text-slate-300">
          {Object.entries(data?.summary.byReason ?? {}).map(([reason, count]) => (
            <div key={reason} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {reasonLabels[reason] ?? reason}: {count}
            </div>
          ))}
          {!isLoading && Object.keys(data?.summary.byReason ?? {}).length === 0 && (
            <span>No cancellation reasons yet.</span>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur">
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
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-500">No cancellations recorded.</td>
              </tr>
            )}
            {data?.items.map((item) => (
              <tr key={item.id} className="hover:bg-white/5">
                <td className="p-3">
                  <div className="font-semibold text-white">{item.tenantName ?? item.tenantId}</div>
                  <div className="text-xs text-slate-400">{item.userEmail ?? '—'}</div>
                </td>
                <td className="p-3 text-slate-200">{item.planCode ?? '—'}</td>
                <td className="p-3 text-slate-200">{item.billingInterval}</td>
                <td className="p-3 text-slate-200">{item.monthsActive ?? '—'}</td>
                <td className="p-3 text-slate-200">{reasonLabels[item.reason] ?? item.reason}</td>
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
