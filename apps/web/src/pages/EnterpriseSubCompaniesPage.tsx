import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Building2,
  Plus,
  Users,
  Video,
  Calendar,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  Coins,
  Save,
} from 'lucide-react';
import api from '../lib/api';

type SubCompany = {
  id: string;
  name: string;
  status: string;
  allocatedCredits: number;
  usersCount: number;
  jobsCount: number;
  createdAt: string;
};

type DashboardStats = {
  stats: {
    totalVideoCredits: number;
    allocatedCredits: number;
    remainingCredits: number;
    maxSubCompanies: number;
    totalSubCompanies: number;
  };
};

const EnterpriseSubCompaniesPage = () => {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState<SubCompany | null>(null);
  const [editingCompany, setEditingCompany] = useState<SubCompany | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    allocatedCredits: 0,
    adminEmail: '',
    adminPassword: '',
  });
  const [allocateCredits, setAllocateCredits] = useState(0);

  const subCompaniesQuery = useQuery<SubCompany[]>({
    queryKey: ['enterpriseSubCompanies'],
    queryFn: async () => {
      const { data } = await api.get('/enterprise/sub-companies');
      return data;
    },
  });

  const dashboardQuery = useQuery<DashboardStats>({
    queryKey: ['enterpriseDashboard'],
    queryFn: async () => {
      const { data } = await api.get('/enterprise/dashboard');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result } = await api.post('/enterprise/sub-companies', data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseSubCompanies'] });
      queryClient.invalidateQueries({ queryKey: ['enterpriseDashboard'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; status?: string } }) => {
      const { data: result } = await api.put(`/enterprise/sub-companies/${id}`, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseSubCompanies'] });
      setEditingCompany(null);
    },
  });

  const allocateMutation = useMutation({
    mutationFn: async ({ id, credits }: { id: string; credits: number }) => {
      const { data: result } = await api.post(`/enterprise/sub-companies/${id}/allocate`, { credits });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseSubCompanies'] });
      queryClient.invalidateQueries({ queryKey: ['enterpriseDashboard'] });
      setShowAllocateModal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/enterprise/sub-companies/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseSubCompanies'] });
      queryClient.invalidateQueries({ queryKey: ['enterpriseDashboard'] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      allocatedCredits: 0,
      adminEmail: '',
      adminPassword: '',
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      adminEmail: formData.adminEmail.trim() || '',
      adminPassword: formData.adminPassword || '',
    });
  };

  const handleAllocateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAllocateModal) return;
    allocateMutation.mutate({ id: showAllocateModal.id, credits: allocateCredits });
  };

  const stats = dashboardQuery.data?.stats;
  const maxAvailableCredits = stats
    ? stats.remainingCredits + (showAllocateModal?.allocatedCredits ?? 0)
    : 0;

  if (subCompaniesQuery.isError) {
    return (
      <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-rose-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400">
          You need an Enterprise account to access this page.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Enterprise</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Sub-Companies</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your sub-companies and allocate video credits.
            </p>
          </div>
          {stats && stats.totalSubCompanies < stats.maxSubCompanies && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
            >
              <Plus className="h-4 w-4" />
              Add Sub-Company
            </button>
          )}
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Building2 className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Sub-Companies</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.totalSubCompanies} / {stats.maxSubCompanies}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Coins className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Allocated Credits</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.allocatedCredits} / {stats.totalVideoCredits}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Video className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Available to Allocate</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats.remainingCredits}</p>
          </div>
        </div>
      )}

      {/* Sub-Companies List */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        {subCompaniesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          </div>
        ) : (subCompaniesQuery.data ?? []).length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-4 text-sm text-slate-400">No sub-companies created yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
            >
              <Plus className="h-4 w-4" />
              Create First Sub-Company
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {(subCompaniesQuery.data ?? []).map((company) => (
              <div
                key={company.id}
                className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {editingCompany?.id === company.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          updateMutation.mutate({
                            id: company.id,
                            data: { name: editingCompany.name },
                          });
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editingCompany.name}
                          onChange={(e) =>
                            setEditingCompany({ ...editingCompany, name: e.target.value })
                          }
                          className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white focus:border-indigo-400 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 transition"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCompany(null)}
                          className="rounded-lg bg-slate-700 p-2 text-slate-300 hover:bg-slate-600 transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{company.name}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            company.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {company.status}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-6 mt-3 text-sm text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {company.usersCount} users
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Video className="h-4 w-4" />
                        {company.jobsCount} videos
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-amber-400" />
                        <span className="text-amber-300">{company.allocatedCredits} credits</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {new Date(company.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowAllocateModal(company);
                        setAllocateCredits(company.allocatedCredits);
                      }}
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-1.5"
                    >
                      <Coins className="h-4 w-4" />
                      Allocate
                    </button>
                    <button
                      onClick={() => setEditingCompany(company)}
                      className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (company.jobsCount > 0) {
                          alert('Cannot delete a sub-company that has jobs. Please delete the jobs first.');
                          return;
                        }
                        if (confirm(`Are you sure you want to delete "${company.name}"?`)) {
                          deleteMutation.mutate(company.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-2xl font-semibold text-white mb-2">New Sub-Company</h2>
            <p className="text-sm text-slate-400 mb-6">
              Create a sub-company to manage clients or teams separately.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Initial Credit Allocation
                </label>
                <input
                  type="number"
                  min={0}
                  max={stats?.remainingCredits ?? 0}
                  value={formData.allocatedCredits}
                  onChange={(e) => setFormData({ ...formData, allocatedCredits: Number(e.target.value) })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Available: {stats?.remainingCredits ?? 0} credits
                </p>
              </div>

              <div className="border-t border-white/10 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                  Admin User (Optional)
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Admin Email</label>
                    <input
                      type="email"
                      value={formData.adminEmail}
                      onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      placeholder="admin@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Admin Password</label>
                    <input
                      type="password"
                      value={formData.adminPassword}
                      onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      placeholder="Min 8 characters"
                    />
                  </div>
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create Sub-Company
                </button>
              </div>

              {createMutation.isError && (
                <p className="text-sm text-rose-400 text-center">
                  {(createMutation.error as any)?.response?.data?.error === 'sub_company_limit_reached'
                    ? 'Sub-company limit reached. Contact support to upgrade.'
                    : 'Failed to create sub-company. Please try again.'}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Allocate Credits Modal */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAllocateModal(null)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowAllocateModal(null)}
              className="absolute top-4 right-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-2xl font-semibold text-white mb-2">Allocate Credits</h2>
            <p className="text-sm text-slate-400 mb-6">
              Allocate video credits to <span className="text-white font-medium">{showAllocateModal.name}</span>
            </p>

            <form onSubmit={handleAllocateSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Credits to Allocate
                </label>
                <input
                  type="number"
                  min={0}
                  max={maxAvailableCredits}
                  value={allocateCredits}
                  onChange={(e) => setAllocateCredits(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white text-lg font-semibold focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-2">
                  <span>Current: {showAllocateModal.allocatedCredits}</span>
                  <span>Max available: {maxAvailableCredits}</span>
                </div>
              </div>

              <div className="flex gap-3">
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAllocateCredits(Math.min(amount, maxAvailableCredits))}
                    className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10 transition"
                  >
                    {amount}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(null)}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocateMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-500 transition disabled:opacity-50"
                >
                  {allocateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Coins className="h-4 w-4" />
                  )}
                  Save Allocation
                </button>
              </div>

              {allocateMutation.isError && (
                <p className="text-sm text-rose-400 text-center">
                  Failed to allocate credits. Please try again.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default EnterpriseSubCompaniesPage;
