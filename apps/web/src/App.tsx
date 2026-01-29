import type { JSX } from 'react';
import { lazy, Suspense, useMemo } from 'react';
import { Navigate, Route, Routes, Outlet } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import AppLayout from './components/AppLayout';
import LightMarketingLayout from './layouts/LightMarketingLayout';
import CodeInjection from './components/CodeInjection';

// Determine if we're on the app subdomain (app.example.com) vs main domain (example.com)
const getIsAppSubdomain = () => {
  const hostname = window.location.hostname;
  // Check if hostname starts with 'app.' or is localhost (for development)
  return hostname.startsWith('app.') || hostname === 'localhost' || hostname === '127.0.0.1';
};

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const CheckoutSuccessPage = lazy(() => import('./pages/CheckoutSuccessPage'));
const CheckoutCancelPage = lazy(() => import('./pages/CheckoutCancelPage'));
const NewVideoPage = lazy(() => import('./pages/NewVideoPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const OwnerTenantsPage = lazy(() => import('./pages/OwnerTenantsPage'));
const OwnerUsersPage = lazy(() => import('./pages/OwnerUsersPage'));
const OwnerCmsPage = lazy(() => import('./pages/OwnerCmsPage'));
const OwnerCouponsPage = lazy(() => import('./pages/OwnerCouponsPage'));
const OwnerBlogPage = lazy(() => import('./pages/OwnerBlogPage'));
const OwnerSettingsPage = lazy(() => import('./pages/OwnerSettingsPage'));
const OwnerCancellationsPage = lazy(() => import('./pages/OwnerCancellationsPage'));
const OwnerShowcaseVideosPage = lazy(() => import('./pages/OwnerShowcaseVideosPage'));
const OwnerMediaLibraryPage = lazy(() => import('./pages/OwnerMediaLibraryPage'));
const OwnerAnalyticsPage = lazy(() => import('./pages/OwnerAnalyticsPage'));
const LandingPage = lazy(() => import('./pages/marketing/LandingPage'));
const LanguagesPage = lazy(() => import('./pages/marketing/LanguagesPage'));
const PricingPage = lazy(() => import('./pages/marketing/PricingPage'));
const AboutPage = lazy(() => import('./pages/marketing/AboutPage'));
const ContactPage = lazy(() => import('./pages/marketing/ContactPage'));
const ExamplesPage = lazy(() => import('./pages/marketing/ExamplesPage'));
const BlogPage = lazy(() => import('./pages/marketing/BlogPage'));
const BlogPostPage = lazy(() => import('./pages/marketing/BlogPostPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/marketing/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/marketing/TermsPage'));
const CookiePolicyPage = lazy(() => import('./pages/marketing/CookiePolicyPage'));

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-slate-500">
        Checking session...
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AppLayoutWrapper = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);

const App = () => {
  const isAppSubdomain = useMemo(() => getIsAppSubdomain(), []);

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-white text-sm text-slate-500">Loading...</div>
      }
    >
      <CodeInjection />
      <Routes>
        {/* Marketing pages - only shown on main domain (not app subdomain) */}
        {!isAppSubdomain && (
          <Route element={<LightMarketingLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/product" element={<Navigate to="/languages" replace />} />
            <Route path="/languages" element={<LanguagesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/examples" element={<ExamplesPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookie-policy" element={<CookiePolicyPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
          </Route>
        )}

        {/* App subdomain: redirect root to login or dashboard */}
        {isAppSubdomain && (
          <Route index element={<Navigate to="/login" replace />} />
        )}

        {/* Auth pages - available on both domains */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected app routes */}
        <Route
          element={
            <RequireAuth>
              <AppLayoutWrapper />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
          <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
          <Route path="/new-video" element={<NewVideoPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/owner/tenants" element={<OwnerTenantsPage />} />
          <Route path="/owner/analytics" element={<OwnerAnalyticsPage />} />
          <Route path="/owner/users" element={<OwnerUsersPage />} />
          <Route path="/owner/cms" element={<OwnerCmsPage />} />
          <Route path="/owner/media-library" element={<OwnerMediaLibraryPage />} />
          <Route path="/owner/coupons" element={<OwnerCouponsPage />} />
          <Route path="/owner/cancellations" element={<OwnerCancellationsPage />} />
          <Route path="/owner/showcase-videos" element={<OwnerShowcaseVideosPage />} />
          <Route path="/owner/blog" element={<OwnerBlogPage />} />
          <Route path="/owner/settings" element={<OwnerSettingsPage />} />
        </Route>

        {/* Fallback: redirect to appropriate page based on domain */}
        <Route
          path="*"
          element={<Navigate to={isAppSubdomain ? '/login' : '/'} replace />}
        />
      </Routes>
    </Suspense>
  );
};

export default App;
