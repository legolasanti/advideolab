import type { JSX } from 'react';
import { Navigate, Route, Routes, Outlet } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import CheckoutCancelPage from './pages/CheckoutCancelPage';
import NewVideoPage from './pages/NewVideoPage';
import JobsPage from './pages/JobsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPage from './pages/UsersPage';
import OwnerTenantsPage from './pages/OwnerTenantsPage';
import OwnerUsersPage from './pages/OwnerUsersPage';
import OwnerCmsPage from './pages/OwnerCmsPage';
import OwnerCouponsPage from './pages/OwnerCouponsPage';
import OwnerBlogPage from './pages/OwnerBlogPage';
import OwnerSettingsPage from './pages/OwnerSettingsPage';
import { useAuth } from './providers/AuthProvider';
import AppLayout from './components/AppLayout';
import MarketingLayout from './layouts/MarketingLayout';
import LandingPage from './pages/marketing/LandingPage';
import ProductPage from './pages/marketing/ProductPage';
import PricingPage from './pages/marketing/PricingPage';
import AboutPage from './pages/marketing/AboutPage';
import ContactPage from './pages/marketing/ContactPage';
import ExamplesPage from './pages/marketing/ExamplesPage';
import BlogPage from './pages/marketing/BlogPage';
import BlogPostPage from './pages/marketing/BlogPostPage';
import PrivacyPolicyPage from './pages/marketing/PrivacyPolicyPage';
import TermsPage from './pages/marketing/TermsPage';
import CookiePolicyPage from './pages/marketing/CookiePolicyPage';

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
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

const App = () => (
  <Routes>
    <Route element={<MarketingLayout />}>
      <Route index element={<LandingPage />} />
      <Route path="/product" element={<ProductPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/examples" element={<ExamplesPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/cookie-policy" element={<CookiePolicyPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
    </Route>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
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
      <Route path="/owner/users" element={<OwnerUsersPage />} />
      <Route path="/owner/cms" element={<OwnerCmsPage />} />
      <Route path="/owner/coupons" element={<OwnerCouponsPage />} />
      <Route path="/owner/blog" element={<OwnerBlogPage />} />
      <Route path="/owner/settings" element={<OwnerSettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
