import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { PLAN_DEFINITIONS, formatPlanSummary } from '../lib/plans';
import type { PlanCode } from '../lib/plans';

type TenantRow = {
  id: string;
  name: string;
  plan: {
    name: string | null;
    code: string | null;
    monthlyVideoLimit: number;
    bonusCredits?: number;
    videosUsedThisCycle: number;
    billingCycleStart: string;
  };
  contactEmail: string | null;
  status: 'pending' | 'active' | 'suspended';
  paymentStatus?: 'payment_pending' | 'active_paid' | 'past_due';
  requestedPlanCode?: string | null;
  billingNotes?: string | null;
  nextBillingDate?: string | null;
  createdAt: string;
};

type OwnerNotification = {
  id: string;
  tenantId: string;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  tenant?: { name: string };
};

type DeleteModalState = {
  open: boolean;
  tenant: TenantRow | null;
  confirmName: string;
  loading: boolean;
  error: string | null;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const computeNextBillingPreview = (startValue?: string) => {
  if (!startValue) return null;
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return null;
  const candidate = new Date(start);
  const startDay = start.getDate();
  candidate.setMonth(candidate.getMonth() + 1);
  const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  candidate.setDate(Math.min(startDay, lastDay));
  return candidate.toISOString();
};

const OwnerTenantsPage = () => {
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanCode>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [billingStartDrafts, setBillingStartDrafts] = useState<Record<string, string>>({});
  const [bonusDrafts, setBonusDrafts] = useState<Record<string, number>>({});
  const [paymentStatusDrafts, setPaymentStatusDrafts] = useState<Record<string, TenantRow['paymentStatus']>>({});
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    open: false,
    tenant: null,
    confirmName: '',
    loading: false,
    error: null,
  });

  const { data: tenants } = useQuery<TenantRow[]>({
    queryKey: ['ownerTenants'],
    queryFn: async () => {
      const { data } = await api.get('/owner/tenants');
      return data;
    },
  });
  const { data: notifications } = useQuery<OwnerNotification[]>({
    queryKey: ['ownerNotifications'],
    queryFn: async () => {
      const { data } = await api.get('/owner/notifications');
      return data;
    },
  });

  const unreadCount = notifications?.filter((notification) => !notification.readAt).length ?? 0;
  const invalidateTenants = () => queryClient.invalidateQueries({ queryKey: ['ownerTenants'] });

  const approvePlanMutation = useMutation({
    mutationFn: ({
      tenantId,
      planCode,
      billingNotes,
      billingStartDate,
      bonusCredits,
      paymentStatus,
      activate,
    }: {
      tenantId: string;
      planCode: PlanCode;
      billingNotes?: string;
      billingStartDate?: string;
      bonusCredits?: number;
      paymentStatus?: TenantRow['paymentStatus'];
      activate?: boolean;
    }) =>
      api.post(`/owner/tenants/${tenantId}/approve-plan`, {
        planCode,
        billingNotes,
        billingStartDate,
        bonusCredits,
        paymentStatus,
        activate,
      }),
    onSuccess: () => invalidateTenants(),
  });

  const resetMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/owner/tenants/${tenantId}/reset`, {}),
    onSuccess: () => invalidateTenants(),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ tenantId, suspend }: { tenantId: string; suspend: boolean }) =>
      api.post(`/owner/tenants/${tenantId}/suspend`, { suspend }),
    onSuccess: () => invalidateTenants(),
  });

  const billingMutation = useMutation({
    mutationFn: ({ tenantId, paymentStatus, bonusCredits, nextBillingDate }: { tenantId: string; paymentStatus?: TenantRow['paymentStatus']; bonusCredits?: number; nextBillingDate?: string }) =>
      api.post(`/owner/tenants/${tenantId}/billing`, { paymentStatus, bonusCredits, nextBillingDate }),
    onSuccess: () => invalidateTenants(),
  });

  const impersonateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data } = await api.post('/owner/impersonate', { tenantId });
      return data;
    },
    onSuccess: (data) => {
      const url = `${window.location.origin}?impersonationToken=${encodeURIComponent(data.token)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });

  const markNotificationMutation = useMutation({
    mutationFn: (notificationId: string) => api.post(`/owner/notifications/${notificationId}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ownerNotifications'] }),
  });

  const openDeleteModal = useCallback((tenant: TenantRow) => {
    setDeleteModal({
      open: true,
      tenant,
      confirmName: '',
      loading: false,
      error: null,
    });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModal({
      open: false,
      tenant: null,
      confirmName: '',
      loading: false,
      error: null,
    });
  }, []);

  const handleDeleteTenant = useCallback(async () => {
    if (!deleteModal.tenant) return;

    setDeleteModal((prev) => ({ ...prev, loading: true, error: null }));

    try {
      await api.delete(`/owner/tenants/${deleteModal.tenant.id}`, {
        data: { confirmName: deleteModal.confirmName },
      });
      invalidateTenants();
      closeDeleteModal();
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error === 'confirmation_name_mismatch'
        ? 'The entered name does not match the tenant name.'
        : err?.response?.data?.error ?? 'Failed to delete tenant.';
      setDeleteModal((prev) => ({ ...prev, loading: false, error: errorMsg }));
    }
  }, [deleteModal.tenant, deleteModal.confirmName, invalidateTenants, closeDeleteModal]);

  const pendingTenants = useMemo(
    () => (tenants ?? []).filter((tenant) => tenant.status === 'pending'),
    [tenants],
  );

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  const planOptionForTenant = (tenant: TenantRow): PlanCode => {
    if (planDrafts[tenant.id]) return planDrafts[tenant.id];
    if (tenant.requestedPlanCode && tenant.requestedPlanCode in PLAN_DEFINITIONS) {
      return tenant.requestedPlanCode as PlanCode;
    }
    if (tenant.plan.code && tenant.plan.code in PLAN_DEFINITIONS) {
      return tenant.plan.code as PlanCode;
    }
    return 'starter';
  };

  const handlePlanAction = (tenant: TenantRow, activate = false) => {
    const draftCode = planOptionForTenant(tenant);
    const notePayload =
      noteDrafts[tenant.id] !== undefined ? noteDrafts[tenant.id] : tenant.billingNotes ?? undefined;
    const billingPayload =
      billingStartDrafts[tenant.id] !== undefined
        ? billingStartDrafts[tenant.id]
        : tenant.plan.billingCycleStart?.slice(0, 10) ?? undefined;
    const bonusPayload =
      bonusDrafts[tenant.id] !== undefined ? bonusDrafts[tenant.id] : tenant.plan.bonusCredits ?? 0;
    const paymentStatusPayload =
      paymentStatusDrafts[tenant.id] !== undefined ? paymentStatusDrafts[tenant.id] : tenant.paymentStatus;
    approvePlanMutation.mutate({
      tenantId: tenant.id,
      planCode: draftCode,
      billingNotes: notePayload,
      billingStartDate: billingPayload,
      bonusCredits: bonusPayload,
      paymentStatus: paymentStatusPayload,
      activate,
    });
  };

  return (
    <section className="space-y-8 text-slate-100">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Tenants Console</h1>
        <p className="mt-2 text-sm text-slate-400">Review incoming tenants, quotas, and billing state.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Pending signups</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
              {pendingTenants.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {pendingTenants.length === 0 && <p className="text-sm text-slate-400">No pending tenants right now.</p>}
            {pendingTenants.map((tenant) => (
              <div
                key={tenant.id}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              >
                <p className="font-semibold text-white">{tenant.name}</p>
                <p className="text-xs text-amber-200/80">
                  Signed up {new Date(tenant.createdAt).toLocaleDateString()} • {tenant.contactEmail ?? 'No email'}
                </p>
                <p className="text-xs">
                  Requested plan:{' '}
                  {formatPlanSummary(
                    tenant.requestedPlanCode,
                    tenant.plan.name,
                    tenant.plan.monthlyVideoLimit,
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Notifications</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
              {unreadCount} unread
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {notifications?.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border px-4 py-3 ${
                  notification.readAt
                    ? 'border-white/10 bg-slate-950/40'
                    : 'border-indigo-400/30 bg-indigo-500/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{notification.tenant?.name ?? 'Tenant'}</p>
                    <p className="text-xs text-slate-400">{new Date(notification.createdAt).toLocaleString()}</p>
                  </div>
                  {!notification.readAt && (
                    <button
                      className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline"
                      onClick={() => markNotificationMutation.mutate(notification.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-200">{notification.message}</p>
              </div>
            ))}
            {notifications && notifications.length === 0 && (
              <p className="text-sm text-slate-400">No notifications yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/70 backdrop-blur">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-slate-950/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Current plan</th>
              <th className="px-4 py-3">Requested plan</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Billing & status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tenants?.map((tenant) => {
              const baseLimit = tenant.plan.monthlyVideoLimit;
              const limit = baseLimit === 0 ? null : baseLimit + (tenant.plan.bonusCredits ?? 0);
              const used = tenant.plan.videosUsedThisCycle;
              const remaining = typeof limit === 'number' ? Math.max(limit - used, 0) : null;
              const planSelection = planOptionForTenant(tenant);
              const notes = noteDrafts[tenant.id] ?? tenant.billingNotes ?? '';
              const billingStartValue =
                billingStartDrafts[tenant.id] ?? tenant.plan.billingCycleStart?.slice(0, 10) ?? '';
              const renewalPreviewIso = billingStartValue
                ? computeNextBillingPreview(billingStartValue)
                : tenant.nextBillingDate ?? null;
              const renewalPreviewLabel = formatDateLabel(renewalPreviewIso ?? tenant.nextBillingDate ?? null);
              const statusPillClasses =
                tenant.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : tenant.status === 'pending'
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-rose-500/15 text-rose-200';
              const paymentStatus = paymentStatusDrafts[tenant.id] ?? tenant.paymentStatus ?? 'payment_pending';
              const paymentPill =
                paymentStatus === 'active_paid'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : paymentStatus === 'past_due'
                  ? 'bg-rose-500/15 text-rose-200'
                  : 'bg-amber-500/15 text-amber-200';
              return (
                <tr key={tenant.id} className="text-slate-200">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">{tenant.name}</p>
                    <p className="text-xs text-slate-400">{tenant.contactEmail ?? 'No contact email'}</p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${statusPillClasses}`}>
                      {tenant.status}
                    </span>
                    {tenant.requestedPlanCode && (
                      <p className="text-xs text-amber-200">
                        Requested: {formatPlanSummary(tenant.requestedPlanCode)}
                      </p>
                    )}
                    <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${paymentPill}`}>
                      {paymentStatus?.replace('_', ' ') ?? 'payment pending'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={planSelection}
                      onChange={(event) =>
                        setPlanDrafts((drafts) => ({ ...drafts, [tenant.id]: event.target.value as PlanCode }))
                      }
                      className="w-56 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    >
                      {Object.values(PLAN_DEFINITIONS).map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name} · {option.quota} videos/month · ${option.priceUsd}/mo
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatPlanSummary(
                        tenant.plan.code ?? tenant.requestedPlanCode,
                        tenant.plan.name,
                        tenant.plan.monthlyVideoLimit,
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">
                      {tenant.requestedPlanCode ? formatPlanSummary(tenant.requestedPlanCode) : '—'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {tenant.requestedPlanCode ? 'Selected at signup' : 'No pending request'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">
                      {used}/{typeof limit === 'number' ? limit : '∞'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {typeof remaining === 'number' ? `${remaining} remaining` : 'Unlimited quota'}
                    </p>
                    <p className="text-xs text-slate-400">Renews on {renewalPreviewLabel ?? '—'}</p>
                    <button
                      className="mt-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline"
                      onClick={() => resetMutation.mutate(tenant.id)}
                    >
                      Reset usage
                    </button>
                  </td>
                  <td className="px-4 py-4 space-y-2">
                    <textarea
                      value={notes}
                      onChange={(event) =>
                        setNoteDrafts((drafts) => ({ ...drafts, [tenant.id]: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      placeholder="Paid via Wise on …"
                      rows={2}
                    />
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Billing cycle start</p>
                    <input
                      type="date"
                      value={billingStartValue}
                      onChange={(event) =>
                        setBillingStartDrafts((drafts) => ({ ...drafts, [tenant.id]: event.target.value }))
                      }
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                    <p className="mt-1 text-xs text-slate-400">Renews on {renewalPreviewLabel ?? '—'}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      Set the billing cycle start date. We auto-calculate the renewal window shown above when you save.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment status</p>
                        <select
                          value={paymentStatus}
                          onChange={(event) =>
                            setPaymentStatusDrafts((drafts) => ({
                              ...drafts,
                              [tenant.id]: event.target.value as TenantRow['paymentStatus'],
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        >
                          <option value="payment_pending">Payment pending</option>
                          <option value="active_paid">Active / Paid</option>
                          <option value="past_due">Past due</option>
                        </select>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bonus credits</p>
                        <input
                          type="number"
                          min={0}
                          value={bonusDrafts[tenant.id] ?? tenant.plan.bonusCredits ?? 0}
                          onChange={(event) =>
                            setBonusDrafts((drafts) => ({
                              ...drafts,
                              [tenant.id]: Number(event.target.value),
                            }))
                          }
                          className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                        onClick={() =>
                          billingMutation.mutate({
                            tenantId: tenant.id,
                            paymentStatus,
                            bonusCredits: bonusDrafts[tenant.id] ?? tenant.plan.bonusCredits ?? 0,
                            nextBillingDate: tenant.nextBillingDate ?? undefined,
                          })
                        }
                        type="button"
                      >
                        Save billing
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                        onClick={() => suspendMutation.mutate({ tenantId: tenant.id, suspend: tenant.status !== 'suspended' })}
                      >
                        {tenant.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/15"
                        onClick={() => handlePlanAction(tenant, tenant.status !== 'active')}
                      >
                        {tenant.status === 'pending'
                          ? 'Activate tenant'
                          : tenant.requestedPlanCode
                          ? 'Approve request'
                          : 'Apply plan'}
                      </button>
                      <button
                        className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                        onClick={() => impersonateMutation.mutate(tenant.id)}
                      >
                        Impersonate
                      </button>
                      <button
                        className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                        onClick={() => openDeleteModal(tenant)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tenants && tenants.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-400">No tenants onboarded yet—seed or add one manually.</p>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.tenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20">
              <svg className="h-6 w-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-semibold text-white">Delete Tenant Account</h3>
            <p className="mt-2 text-center text-sm text-slate-400">
              This action is permanent and cannot be undone. All data including users, jobs, and billing history will be deleted.
            </p>
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-center text-sm text-rose-200">
                Deleting: <span className="font-semibold">{deleteModal.tenant.name}</span>
              </p>
              {deleteModal.tenant.contactEmail && (
                <p className="text-center text-xs text-rose-200/70">{deleteModal.tenant.contactEmail}</p>
              )}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-300">
                Type <span className="font-semibold text-white">{deleteModal.tenant.name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteModal.confirmName}
                onChange={(e) => setDeleteModal((prev) => ({ ...prev, confirmName: e.target.value, error: null }))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-rose-500/50 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                placeholder="Enter tenant name to confirm"
              />
            </div>
            {deleteModal.error && (
              <p className="mt-2 text-center text-sm text-rose-400">{deleteModal.error}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.loading}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTenant}
                disabled={deleteModal.loading || deleteModal.confirmName.toLowerCase() !== deleteModal.tenant.name.toLowerCase()}
                className="flex-1 rounded-2xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteModal.loading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default OwnerTenantsPage;
