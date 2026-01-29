import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  Users,
  Mail,
  Building2,
  Shield,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  UserPlus,
  Search,
} from 'lucide-react';
import api from '../lib/api';

type EnterpriseUser = {
  id: string;
  email: string;
  role: 'tenant_admin' | 'user';
  tenantId: string;
  tenantName: string;
  isMainEnterprise: boolean;
  createdAt: string;
};

type SubCompany = {
  id: string;
  name: string;
};

type DashboardStats = {
  stats: {
    totalUsers: number;
    maxAdditionalUsers: number;
  };
};

const EnterpriseUsersPage = () => {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'user' as 'tenant_admin' | 'user',
    subCompanyId: '',
  });

  const usersQuery = useQuery<EnterpriseUser[]>({
    queryKey: ['enterpriseUsers'],
    queryFn: async () => {
      const { data } = await api.get('/enterprise/users');
      return data;
    },
  });

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

  const inviteMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result } = await api.post('/enterprise/users/invite', {
        ...data,
        subCompanyId: data.subCompanyId || undefined,
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseUsers'] });
      queryClient.invalidateQueries({ queryKey: ['enterpriseDashboard'] });
      setShowInviteModal(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/enterprise/users/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterpriseUsers'] });
      queryClient.invalidateQueries({ queryKey: ['enterpriseDashboard'] });
    },
  });

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: 'user',
      subCompanyId: '',
    });
  };

  const filteredUsers = useMemo(() => {
    const users = usersQuery.data ?? [];
    return users.filter((user) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTenant = filterTenant === 'all' || user.tenantId === filterTenant;

      return matchesSearch && matchesTenant;
    });
  }, [usersQuery.data, searchQuery, filterTenant]);

  const tenantOptions = useMemo(() => {
    const users = usersQuery.data ?? [];
    const tenants = new Map<string, string>();
    users.forEach((u) => {
      if (!tenants.has(u.tenantId)) {
        tenants.set(u.tenantId, u.tenantName);
      }
    });
    return Array.from(tenants.entries()).map(([id, name]) => ({ id, name }));
  }, [usersQuery.data]);

  const stats = dashboardQuery.data?.stats;
  const canInviteMore = stats ? stats.totalUsers < stats.maxAdditionalUsers + 1 : false;

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate(formData);
  };

  if (usersQuery.isError) {
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
            <h1 className="text-3xl font-semibold text-white">Team Members</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage users across your enterprise and sub-companies.
            </p>
          </div>
          {canInviteMore && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
            >
              <UserPlus className="h-4 w-4" />
              Invite User
            </button>
          )}
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-sm text-slate-400">Total Users</p>
                <p className="text-xl font-bold text-white">
                  {stats.totalUsers} / {stats.maxAdditionalUsers + 1}
                </p>
              </div>
            </div>
            {!canInviteMore && (
              <span className="text-xs text-amber-400 bg-amber-500/20 px-3 py-1 rounded-full">
                User limit reached
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by email or company..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        <select
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Companies</option>
          {tenantOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Users List */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        {usersQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-slate-600" />
            <p className="mt-4 text-sm text-slate-400">
              {searchQuery || filterTenant !== 'all'
                ? 'No users match your filters'
                : 'No team members yet'}
            </p>
            {canInviteMore && !searchQuery && filterTenant === 'all' && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
              >
                <UserPlus className="h-4 w-4" />
                Invite First User
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-slate-400 mb-4">
              Showing {filteredUsers.length} of {usersQuery.data?.length ?? 0} users
            </div>
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
                    {user.email.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{user.email}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          user.role === 'tenant_admin'
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {user.role === 'tenant_admin' ? 'Admin' : 'User'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Building2 className="h-3 w-3" />
                      {user.tenantName}
                      {user.isMainEnterprise && (
                        <span className="text-indigo-400">(Main)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to remove ${user.email}?`)) {
                        deleteMutation.mutate(user.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition disabled:opacity-50"
                    title="Remove user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-2xl font-semibold text-white mb-2">Invite User</h2>
            <p className="text-sm text-slate-400 mb-6">
              Add a new team member to your enterprise or sub-company.
            </p>

            <form onSubmit={handleInviteSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="user@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Min 8 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'user' })}
                    className={`rounded-xl border p-4 text-left transition ${
                      formData.role === 'user'
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <Users className="h-5 w-5 text-slate-400 mb-2" />
                    <p className="font-medium text-white">User</p>
                    <p className="text-xs text-slate-400 mt-1">Can create videos</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'tenant_admin' })}
                    className={`rounded-xl border p-4 text-left transition ${
                      formData.role === 'tenant_admin'
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <Shield className="h-5 w-5 text-purple-400 mb-2" />
                    <p className="font-medium text-white">Admin</p>
                    <p className="text-xs text-slate-400 mt-1">Full access</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Assign to Company
                </label>
                <select
                  value={formData.subCompanyId}
                  onChange={(e) => setFormData({ ...formData, subCompanyId: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Main Enterprise Account</option>
                  {(subCompaniesQuery.data ?? []).map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Invite User
                </button>
              </div>

              {inviteMutation.isError && (
                <p className="text-sm text-rose-400 text-center">
                  {(inviteMutation.error as any)?.response?.data?.error === 'email_already_registered'
                    ? 'This email is already registered.'
                    : (inviteMutation.error as any)?.response?.data?.error === 'user_limit_reached'
                    ? 'User limit reached. Contact support to upgrade.'
                    : 'Failed to invite user. Please try again.'}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default EnterpriseUsersPage;
