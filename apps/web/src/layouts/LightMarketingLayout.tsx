import type { ReactNode } from 'react';
import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOptionalAuth, getDashboardRoute } from '../providers/AuthProvider';
import { useCmsSection } from '../hooks/useCmsSection';
import { legalDefaults } from '../content/marketing';
import { useMarketingTracker } from '../hooks/useMarketingTracker';

export const lightMarketingNavLinks = [
  { label: 'Languages', to: '/languages' },
  { label: 'Examples', to: '/examples' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Contact', to: '/contact' },
];

const LightMarketingChrome = ({ children }: { children?: ReactNode }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const auth = useOptionalAuth();
  useMarketingTracker('visit');
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
    <div className="relative min-h-screen font-sans bg-white text-slate-900 selection:bg-blue-500/20 selection:text-blue-900">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl transition-all duration-300">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          {/* Logo Section */}
          <NavLink to="/" className="flex items-center gap-2.5 group relative z-10" aria-label="Home">
            <img src="/logo.png" alt="AdVideoLab" className="h-9 w-auto transition-transform group-hover:scale-105" />
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex relative z-10" aria-label="Primary marketing navigation">
            {lightMarketingNavLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors duration-200 ${isActive
                    ? 'text-[#2e90fa]'
                    : 'text-slate-600 hover:text-slate-900'
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
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition"
              >
                {dashboardCta.label}
              </NavLink>
              <NavLink
                to="/new-video"
                className="group inline-flex items-center gap-2 rounded-full bg-[#2e90fa] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#1a7ae8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 transition"
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
          <div className="border-t border-slate-200 bg-white/95 backdrop-blur-xl px-6 py-6 md:hidden absolute w-full left-0 shadow-2xl z-50">
            <nav className="flex flex-col gap-4">
              {lightMarketingNavLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `text-lg font-medium ${isActive ? 'text-[#2e90fa]' : 'text-slate-600'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="h-px w-full bg-slate-200 my-2" />
              <NavLink
                to={dashboardCta.to}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center rounded-full border border-slate-300 bg-white py-3 text-center font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {dashboardCta.label}
              </NavLink>
              <NavLink
                to="/new-video"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center rounded-full bg-[#2e90fa] py-3 text-center font-semibold text-white active:scale-95 transition-transform hover:bg-[#1a7ae8]"
              >
                Get Started
              </NavLink>
            </nav>
          </div>
        )}
      </header>

      <main className="relative z-10 min-h-screen">{children ?? <Outlet />}</main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 relative z-10 pt-20 pb-12 mt-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4 mb-16">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="AdVideoLab" className="h-8 w-auto" />
              </div>
              <p className="text-slate-600 text-sm leading-relaxed max-w-sm">
                Create high-converting UGC videos from a single image—optimized for TikTok, Reels, and Shorts.
              </p>
            </div>

            {/* Footer Links */}
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Product</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><NavLink to="/languages" className="hover:text-[#2e90fa] transition">Languages</NavLink></li>
                <li><NavLink to="/examples" className="hover:text-[#2e90fa] transition">Examples</NavLink></li>
                <li><NavLink to="/pricing" className="hover:text-[#2e90fa] transition">Pricing</NavLink></li>
                <li><NavLink to="/new-video" className="hover:text-[#2e90fa] transition">Get started</NavLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Company</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><NavLink to="/about" className="hover:text-[#2e90fa] transition">About</NavLink></li>
                <li><NavLink to="/blog" className="hover:text-[#2e90fa] transition">Blog</NavLink></li>
                <li><NavLink to="/contact" className="hover:text-[#2e90fa] transition">Contact</NavLink></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Legal</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><NavLink to="/privacy" className="hover:text-[#2e90fa] transition">Privacy Policy</NavLink></li>
                <li><NavLink to="/terms" className="hover:text-[#2e90fa] transition">Terms of Service</NavLink></li>
                <li><NavLink to="/cookie-policy" className="hover:text-[#2e90fa] transition">Cookie Policy</NavLink></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-8 text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} {companyName} ({companyCountry}). All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const LightMarketingLayout = () => (
  <LightMarketingChrome>
    <Outlet />
  </LightMarketingChrome>
);

export const LightMarketingLayoutShell = LightMarketingChrome;

export default LightMarketingLayout;
