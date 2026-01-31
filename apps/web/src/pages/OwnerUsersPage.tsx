import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type UserRow = {
  id: string;
  email: string;
  role: 'tenant_admin' | 'user';
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    plan: string | null;
    status: 'pending' | 'active' | 'suspended';
  };
};

const OwnerUsersPage = () => {
  const { isOwner } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const usersQuery = useQuery<{ users: UserRow[] }>({
    queryKey: ['ownerUsers'],
    queryFn: async () => {
      const { data } = await api.get('/owner/users');
      return data;
    },
  });

  const filteredUsers = useMemo(() => {
    const users = usersQuery.data?.users ?? [];
    return users.filter((user) => {
      const matchesSearch = searchQuery.trim() === '' ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.tenant.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus = filterStatus === 'all' || user.tenant.status === filterStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [usersQuery.data, searchQuery, filterRole, filterStatus]);

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  return (
    <section className="space-y-6 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <h1 className="text-3xl font-semibold text-white">All Users</h1>
        <p className="text-sm text-slate-400">
          View and manage all users across all tenants.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by email or tenant..."
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Roles</option>
          <option value="tenant_admin">Tenant Admin</option>
          <option value="user">User</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        {usersQuery.isLoading ? (
          <p className="text-sm text-slate-400">Loading users...</p>
        ) : (
          <>
            <div className="mb-4 text-sm text-slate-400">
              Showing {filteredUsers.length} of {usersQuery.data?.users.length ?? 0} users
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-4 text-sm text-white">
                          {user.email}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            user.role === 'tenant_admin'
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'bg-slate-500/20 text-slate-300'
                          }`}>
                            {user.role === 'tenant_admin' ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {user.tenant.name}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-400">
                          {user.tenant.plan ?? '—'}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            user.tenant.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : user.tenant.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {user.tenant.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default OwnerUsersPage;
