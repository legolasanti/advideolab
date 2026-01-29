import type { ReactNode } from 'react';
import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOptionalAuth, getDashboardRoute } from '../providers/AuthProvider';
import { useCmsSection } from '../hooks/useCmsSection';
import { legalDefaults } from '../content/marketing';

export const marketingNavLinks = [
  { label: 'Languages', to: '/languages' },
  { label: 'Examples', to: '/examples' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Contact', to: '/contact' },
];

const MarketingChrome = ({ children }: { children?: ReactNode }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const auth = useOptionalAuth();
  const isLoggedIn = Boolean(auth?.token);
  const dashboardHref = getDashboardRoute(auth?.role);
  const dashboardCta = { label: 'Go to Dashboard', to: isLoggedIn ? dashboardHref : '/login' };

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  const { data: legalCms } = useCmsSection('legal', { content: legalDefaults });
  const legal = (legalCms.content as typeof legalDefaults | undefined) ?? legalDefaults;
  const companyName = legal.company.name?.trim() || 'Reklamedia';
  const companyCountry = legal.company.country?.trim() || 'Norway';

  return (
    <div className="relative min-h-screen font-sans bg-slate-950 text-slate-50 selection:bg-emerald-500/30 selection:text-emerald-100">

      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(34,197,94,0.12),rgba(255,255,255,0))] pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl transition-all duration-300">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          {/* Logo Section */}
          <NavLink to="/" className="flex items-center gap-2.5 group relative z-10" aria-label="Home">
            <img src="/logo.png" alt="AdVideoLab" className="h-9 w-auto transition-transform group-hover:scale-105" />
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex relative z-10" aria-label="Primary marketing navigation">
            {marketingNavLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors duration-200 ${isActive
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 relative z-10">
            <div className="hidden md:flex items-center gap-4">
              <NavLink
                to={dashboardCta.to}
                className="text-sm font-medium text-slate-400 hover:text-white transition"
              >
                {dashboardCta.label}
              </NavLink>
              <NavLink
                to="/new-video"
                className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                Get Started
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </NavLink>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-slate-400 hover:text-white transition"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="border-t border-white/10 bg-slate-950/95 backdrop-blur-xl px-6 py-6 md:hidden absolute w-full left-0 animate-in slide-in-from-top-2 shadow-2xl z-50">
            <nav className="flex flex-col gap-4">
              {marketingNavLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `text-lg font-medium ${isActive ? 'text-white' : 'text-slate-400'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="h-px w-full bg-white/10 my-2" />
              <NavLink
                to={dashboardCta.to}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center rounded-full border border-white/15 bg-white/5 py-3 text-center font-semibold text-white transition hover:bg-white/10"
              >
                {dashboardCta.label}
              </NavLink>
              <NavLink
                to="/new-video"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center rounded-full bg-emerald-400 py-3 text-center font-semibold text-slate-950 active:scale-95 transition-transform hover:bg-emerald-300"
              >
                Get Started
              </NavLink>
            </nav>
          </div>
        )}
      </header>

      <main className="relative z-10 min-h-screen">{children ?? <Outlet />}</main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950 relative z-10 pt-20 pb-12 mt-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4 mb-16">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="AdVideoLab" className="h-8 w-auto" />
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                Create high-converting UGC videos from a single image—optimized for TikTok, Reels, and Shorts.
              </p>
            </div>

            {/* Footer Links */}
            <div>
              <h4 className="font-bold text-white mb-6">Product</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><NavLink to="/languages" className="hover:text-emerald-300 transition">Languages</NavLink></li>
                <li><NavLink to="/examples" className="hover:text-emerald-300 transition">Examples</NavLink></li>
                <li><NavLink to="/pricing" className="hover:text-emerald-300 transition">Pricing</NavLink></li>
                <li><NavLink to="/new-video" className="hover:text-emerald-300 transition">Get started</NavLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Company</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><NavLink to="/about" className="hover:text-emerald-300 transition">About</NavLink></li>
                <li><NavLink to="/blog" className="hover:text-emerald-300 transition">Blog</NavLink></li>
                <li><NavLink to="/contact" className="hover:text-emerald-300 transition">Contact</NavLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Legal</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><NavLink to="/privacy" className="hover:text-emerald-300 transition">Privacy Policy</NavLink></li>
                <li><NavLink to="/terms" className="hover:text-emerald-300 transition">Terms of Service</NavLink></li>
                <li><NavLink to="/cookie-policy" className="hover:text-emerald-300 transition">Cookie Policy</NavLink></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/5 pt-8 text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} {companyName} ({companyCountry}). All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const MarketingLayout = () => (
  <MarketingChrome>
    <Outlet />
  </MarketingChrome>
);

export const MarketingLayoutShell = MarketingChrome;

export default MarketingLayout;
