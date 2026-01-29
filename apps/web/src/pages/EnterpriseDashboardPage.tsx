import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Video,
  TrendingUp,
  Clock,
  ArrowRight,
  BarChart3,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';

type DashboardData = {
  stats: {
    totalSubCompanies: number;
    maxSubCompanies: number;
    totalUsers: number;
    maxAdditionalUsers: number;
    totalVideoCredits: number;
    allocatedCredits: number;
    remainingCredits: number;
    monthlyJobs: number;
  };
  subCompanies: Array<{
    id: string;
    name: string;
    status: string;
    allocatedCredits: number;
    usersCount: number;
    jobsCount: number;
    createdAt: string;
  }>;
  recentJobs: Array<{
    id: string;
    status: string;
    tenantName: string;
    userEmail: string | null;
    createdAt: string;
  }>;
};

const statusColors: Record<string, string> = {
  pending: 'text-amber-400',
  processing: 'text-blue-400',
  completed: 'text-emerald-400',
  failed: 'text-rose-400',
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
};

const EnterpriseDashboardPage = () => {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['enterpriseDashboard'],
    queryFn: async () => {
      const { data } = await api.get('/enterprise/dashboard');
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
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

  const { stats, subCompanies, recentJobs } = data;
  const creditsUsedPercent = stats.totalVideoCredits > 0
    ? Math.round((stats.allocatedCredits / stats.totalVideoCredits) * 100)
    : 0;

  return (
    <section className="space-y-8 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Enterprise</p>
        <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">
          Overview of your enterprise account and sub-companies.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span className="text-xs text-slate-500">
              {stats.totalSubCompanies} / {stats.maxSubCompanies}
            </span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalSubCompanies}</p>
          <p className="text-sm text-slate-400">Sub-Companies</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <Users className="h-5 w-5 text-purple-400" />
            <span className="text-xs text-slate-500">
              {stats.totalUsers} / {stats.maxAdditionalUsers + 1}
            </span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
          <p className="text-sm text-slate-400">Total Users</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <Video className="h-5 w-5 text-amber-400" />
            <span className="text-xs text-slate-500">{creditsUsedPercent}% allocated</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.remainingCredits}</p>
          <p className="text-sm text-slate-400">Available Credits</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <span className="text-xs text-slate-500">This month</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.monthlyJobs}</p>
          <p className="text-sm text-slate-400">Videos Generated</p>
        </div>
      </div>

      {/* Credit Allocation Progress */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            Credit Allocation
          </h2>
          <span className="text-sm text-slate-400">
            {stats.allocatedCredits} / {stats.totalVideoCredits} credits allocated
          </span>
        </div>
        <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${creditsUsedPercent}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {stats.remainingCredits} credits remaining to allocate to sub-companies
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sub-Companies */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-400" />
              Sub-Companies
            </h2>
            <Link
              to="/enterprise/sub-companies"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Manage
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {subCompanies.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-4">No sub-companies yet</p>
              <Link
                to="/enterprise/sub-companies"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
              >
                <Plus className="h-4 w-4" />
                Create Sub-Company
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {subCompanies.slice(0, 5).map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/50 p-4"
                >
                  <div>
                    <p className="font-medium text-white">{company.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {company.usersCount} users • {company.allocatedCredits} credits
                    </p>
                  </div>
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
              ))}
              {subCompanies.length > 5 && (
                <Link
                  to="/enterprise/sub-companies"
                  className="block text-center text-sm text-indigo-400 hover:text-indigo-300 py-2"
                >
                  View all {subCompanies.length} sub-companies
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-400" />
              Recent Activity
            </h2>
          </div>

          {recentJobs.length === 0 ? (
            <div className="py-8 text-center">
              <Video className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No recent video generations</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => {
                const StatusIcon = statusIcons[job.status] || Clock;
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon
                        className={`h-5 w-5 ${statusColors[job.status] || 'text-slate-400'} ${
                          job.status === 'processing' ? 'animate-spin' : ''
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{job.tenantName}</p>
                        <p className="text-xs text-slate-400">{job.userEmail || 'Unknown user'}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            to="/enterprise/sub-companies"
            className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 hover:bg-white/5 transition"
          >
            <div className="rounded-xl bg-blue-500/20 p-3">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-white">Manage Sub-Companies</p>
              <p className="text-xs text-slate-400">Create, edit, allocate credits</p>
            </div>
          </Link>

          <Link
            to="/enterprise/users"
            className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 hover:bg-white/5 transition"
          >
            <div className="rounded-xl bg-purple-500/20 p-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-white">Manage Users</p>
              <p className="text-xs text-slate-400">Invite and manage team members</p>
            </div>
          </Link>

          <Link
            to="/new-video"
            className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 hover:bg-white/5 transition"
          >
            <div className="rounded-xl bg-amber-500/20 p-3">
              <Video className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-white">Generate Video</p>
              <p className="text-xs text-slate-400">Create a new video ad</p>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default EnterpriseDashboardPage;
