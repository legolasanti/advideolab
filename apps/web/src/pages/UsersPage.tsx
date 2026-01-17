import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

type TenantUser = {
  id: string;
  email: string;
  role: string;
};

const UsersPage = () => {
  const { data: users, isLoading } = useQuery<TenantUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users');
      return data;
    },
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="text-slate-500">View who has access to your tenant.</p>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">Team changes are handled by support</p>
        <p className="mt-1 text-amber-900">
          Contact your account manager to add or remove collaborators. Self-service invitations and removals are disabled
          to protect your workspace permissions.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Team</h2>
        {isLoading && <p className="text-sm text-slate-500">Loading users...</p>}
        {!isLoading && (
          <div className="space-y-3">
            {users?.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{user.email}</p>
                  <p className="text-xs capitalize text-slate-500">{user.role.replace('_', ' ')}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Managed</span>
              </div>
            ))}
            {users && users.length === 0 && <p className="text-sm text-slate-500">No users yet.</p>}
          </div>
        )}
      </div>
    </section>
  );
};

export default UsersPage;
