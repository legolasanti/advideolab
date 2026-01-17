import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useUsage } from '../hooks/useUsage';

const NavItem = ({ to, label, icon }: { to: string; label: string; icon?: ReactNode }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group ${isActive
        ? 'bg-blue-600/10 text-blue-400 shadow-sm border border-blue-500/20'
        : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
      }`
    }
  >
    {icon && <span className="opacity-70 group-hover:opacity-100">{icon}</span>}
    {label}
  </NavLink>
);

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { tenant, logout, role, isOwner, tenantStatus, token } = useAuth();
  const { data: usage } = useUsage(Boolean(token) && !isOwner);
  const navigate = useNavigate();
  const planLimit = usage?.plan?.monthly_limit ?? null;
  const planCode = usage?.plan?.code ?? null;
  const isUnlimited = Boolean(planCode) && planLimit === null;
  const quotaLabel = isUnlimited ? '∞' : planLimit !== null ? String(planLimit) : '—';
  const used = usage?.used ?? 0;
  const progress = planLimit && planLimit > 0 ? Math.min((used / planLimit) * 100, 100) : 0;
  const statusLabel = tenantStatus ?? (isOwner ? 'owner' : 'active');

  const navItems = [
    {
      to: '/app',
      label: 'Overview',
      show: true,
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
    },
    {
      to: '/new-video',
      label: 'New Generation',
      show: !isOwner,
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    },
    {
      to: '/jobs',
      label: 'Project History',
      show: !isOwner,
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    {
      to: '/settings',
      label: 'Subscription',
      show: !isOwner,
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    },
    {
      to: '/users',
      label: 'Team Members',
      show: !isOwner,
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    },
    { to: '/owner/tenants', label: 'Tenants Console', show: role === 'owner_superadmin' },
    { to: '/owner/users', label: 'All Users', show: role === 'owner_superadmin' },
    { to: '/owner/settings', label: 'System Settings', show: role === 'owner_superadmin' },
    { to: '/owner/cms', label: 'CMS Manager', show: role === 'owner_superadmin' },
    { to: '/owner/coupons', label: 'Coupons', show: role === 'owner_superadmin' },
    { to: '/owner/blog', label: 'Blog', show: role === 'owner_superadmin' },
  ].filter((item) => item.show);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50 relative selection:bg-blue-500/30 selection:text-white">
      {/* Background Noise/Gradient for the whole app */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Sidebar */}
      <aside className="relative z-10 flex w-72 flex-col gap-8 border-r border-white/5 bg-slate-900/40 backdrop-blur-xl px-6 py-8">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg>
            </div>
            <span className="font-bold text-lg tracking-tight">CINEAI <span className="text-slate-500 font-normal">Studio</span></span>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/5 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                {tenant?.name?.substring(0, 2).toUpperCase() || 'ME'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold truncate text-white">{tenant?.name ?? 'Owner Console'}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{statusLabel}</p>
              </div>
            </div>

            {!isOwner && (
              <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Credits</span>
                  <span className="text-white">{used} / {quotaLabel}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Menu</p>
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </nav>

        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Sign out
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-10">
          {/* Status Banners */}
          {!isOwner && tenantStatus === 'pending' && (
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200 text-sm flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                <p className="font-semibold">Activation Pending</p>
                <p className="opacity-80 mt-1">Your workspace is awaiting approval. You can browse the dashboard, but generation features are paused.</p>
              </div>
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
