import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  Mail,
  Send,
  Calendar,
  Check,
  X,
  Trash2,
  RefreshCw,
  Plus,
  Building2,
  DollarSign,
  Users,
  Video,
  Clock,
  Copy,
  ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type EnterpriseInvitation = {
  id: string;
  email: string;
  companyName: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  customMonthlyPriceUsd: number;
  customAnnualPriceUsd: number | null;
  billingInterval: 'monthly' | 'annual';
  maxSubCompanies: number;
  maxAdditionalUsers: number;
  totalVideoCredits: number;
  expiresAt: string;
  acceptedAt: string | null;
  sentAt: string;
  createdAt: string;
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300',
  accepted: 'bg-emerald-500/20 text-emerald-300',
  expired: 'bg-slate-500/20 text-slate-400',
  cancelled: 'bg-rose-500/20 text-rose-300',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const OwnerEnterpriseInvitationsPage = () => {
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'expired' | 'cancelled'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<EnterpriseInvitation | null>(null);

  // Form state for creating invitation
  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    customMonthlyPriceUsd: 299,
    customAnnualPriceUsd: 2990,
    billingInterval: 'monthly' as 'monthly' | 'annual',
    maxSubCompanies: 5,
    maxAdditionalUsers: 10,
    totalVideoCredits: 100,
    expiresInDays: 7,
  });

  const invitationsQuery = useQuery<EnterpriseInvitation[]>({
    queryKey: ['ownerEnterpriseInvitations'],
    queryFn: async () => {
      const { data } = await api.get('/owner/enterprise-invitations');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result } = await api.post('/owner/enterprise-invitations', data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseInvitations'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/owner/enterprise-invitations/${id}/resend`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseInvitations'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/owner/enterprise-invitations/${id}/cancel`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseInvitations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/owner/enterprise-invitations/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerEnterpriseInvitations'] });
      setSelectedInvitation(null);
    },
  });

  const filteredInvitations = useMemo(() => {
    const invitations = invitationsQuery.data ?? [];
    return invitations.filter((inv) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        inv.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.companyName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [invitationsQuery.data, searchQuery, filterStatus]);

  const pendingCount = useMemo(() => {
    return (invitationsQuery.data ?? []).filter((i) => i.status === 'pending').length;
  }, [invitationsQuery.data]);

  const resetForm = () => {
    setFormData({
      email: '',
      companyName: '',
      customMonthlyPriceUsd: 299,
      customAnnualPriceUsd: 2990,
      billingInterval: 'monthly',
      maxSubCompanies: 5,
      maxAdditionalUsers: 10,
      totalVideoCredits: 100,
      expiresInDays: 7,
    });
  };

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const copyInviteLink = (invitation: EnterpriseInvitation) => {
    // The actual token isn't exposed for security, but we can show the accept page URL
    const baseUrl = window.location.origin;
    navigator.clipboard.writeText(`${baseUrl}/enterprise/accept/${invitation.id}`);
  };

  return (
    <section className="space-y-6 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold text-white">Enterprise Invitations</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400">
          Send custom-priced enterprise invitations to qualified leads.
        </p>
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by email or company..."
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Invitations</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
        >
          <Plus className="h-4 w-4" />
          New Invitation
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invitation List */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          {invitationsQuery.isLoading ? (
            <p className="text-sm text-slate-400">Loading invitations...</p>
          ) : filteredInvitations.length === 0 ? (
            <div className="py-12 text-center">
              <Send className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-4 text-sm text-slate-400">No enterprise invitations found</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
              >
                <Plus className="h-4 w-4" />
                Create First Invitation
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mb-4 text-sm text-slate-400">
                Showing {filteredInvitations.length} of {invitationsQuery.data?.length ?? 0} invitations
              </div>
              {filteredInvitations.map((invitation) => (
                <button
                  key={invitation.id}
                  onClick={() => setSelectedInvitation(invitation)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selectedInvitation?.id === invitation.id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : invitation.status === 'pending'
                      ? 'border-amber-400/30 bg-amber-500/5 hover:bg-amber-500/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white truncate">
                          {invitation.companyName}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${statusColors[invitation.status]}`}>
                          {statusLabels[invitation.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400 truncate">{invitation.email}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        ${invitation.customMonthlyPriceUsd}/mo • {invitation.totalVideoCredits} credits • {invitation.maxSubCompanies} sub-companies
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-500">
                        {new Date(invitation.sentAt).toLocaleDateString()}
                      </span>
                      {invitation.status === 'pending' && (
                        <span className="text-xs text-amber-400">
                          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Invitation Details */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          {selectedInvitation ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedInvitation.companyName}
                  </h2>
                  <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${statusColors[selectedInvitation.status]}`}>
                    {statusLabels[selectedInvitation.status]}
                  </span>
                </div>
                <div className="flex gap-2">
                  {selectedInvitation.status === 'pending' && (
                    <>
                      <button
                        onClick={() => resendMutation.mutate(selectedInvitation.id)}
                        disabled={resendMutation.isPending}
                        className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                        title="Resend invitation"
                      >
                        <RefreshCw className={`h-4 w-4 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => cancelMutation.mutate(selectedInvitation.id)}
                        disabled={cancelMutation.isPending}
                        className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 transition disabled:opacity-50"
                        title="Cancel invitation"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this invitation?')) {
                        deleteMutation.mutate(selectedInvitation.id);
                      }
                    }}
                    className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <a
                    href={`mailto:${selectedInvitation.email}`}
                    className="text-indigo-400 hover:underline"
                  >
                    {selectedInvitation.email}
                  </a>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-300">
                    Sent {new Date(selectedInvitation.sentAt).toLocaleString()}
                  </span>
                </div>

                {selectedInvitation.status === 'pending' && (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-amber-300">
                      Expires {new Date(selectedInvitation.expiresAt).toLocaleString()}
                    </span>
                  </div>
                )}

                {selectedInvitation.acceptedAt && (
                  <div className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-300">
                      Accepted {new Date(selectedInvitation.acceptedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Pricing & Limits */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Package Details
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-500/20 p-2">
                      <DollarSign className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Monthly Price</p>
                      <p className="font-semibold text-white">${selectedInvitation.customMonthlyPriceUsd}</p>
                    </div>
                  </div>

                  {selectedInvitation.customAnnualPriceUsd && (
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-emerald-500/20 p-2">
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Annual Price</p>
                        <p className="font-semibold text-white">${selectedInvitation.customAnnualPriceUsd}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-500/20 p-2">
                      <Video className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Video Credits</p>
                      <p className="font-semibold text-white">{selectedInvitation.totalVideoCredits}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-500/20 p-2">
                      <Building2 className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Sub-Companies</p>
                      <p className="font-semibold text-white">{selectedInvitation.maxSubCompanies}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-purple-500/20 p-2">
                      <Users className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Additional Users</p>
                      <p className="font-semibold text-white">{selectedInvitation.maxAdditionalUsers}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-500/20 p-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Billing</p>
                      <p className="font-semibold text-white capitalize">{selectedInvitation.billingInterval}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {selectedInvitation.status === 'pending' && (
                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => copyInviteLink(selectedInvitation)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </button>
                  <a
                    href={`mailto:${selectedInvitation.email}?subject=Your Enterprise Invitation - Advideolab`}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
                  >
                    <Mail className="h-4 w-4" />
                    Send Follow-up
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <Send className="mx-auto h-12 w-12 text-slate-600" />
                <p className="mt-4 text-sm text-slate-400">
                  Select an invitation to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-2xl font-semibold text-white mb-2">New Enterprise Invitation</h2>
            <p className="text-sm text-slate-400 mb-6">
              Send a custom-priced enterprise offer to a qualified lead.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="enterprise@company.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="Acme Corp"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Monthly Price (USD) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.customMonthlyPriceUsd}
                    onChange={(e) => setFormData({ ...formData, customMonthlyPriceUsd: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Annual Price (USD)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.customAnnualPriceUsd}
                    onChange={(e) => setFormData({ ...formData, customAnnualPriceUsd: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Video Credits
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={formData.totalVideoCredits}
                    onChange={(e) => setFormData({ ...formData, totalVideoCredits: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Sub-Companies
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.maxSubCompanies}
                    onChange={(e) => setFormData({ ...formData, maxSubCompanies: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Extra Users
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.maxAdditionalUsers}
                    onChange={(e) => setFormData({ ...formData, maxAdditionalUsers: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Billing Interval
                  </label>
                  <select
                    value={formData.billingInterval}
                    onChange={(e) => setFormData({ ...formData, billingInterval: e.target.value as 'monthly' | 'annual' })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Expires In (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData({ ...formData, expiresInDays: Number(e.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>

              {createMutation.isError && (
                <p className="text-sm text-rose-400 text-center">
                  Failed to send invitation. Please try again.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default OwnerEnterpriseInvitationsPage;
