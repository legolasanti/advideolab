import { useEffect, useState } from 'react';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth, getDashboardRoute } from '../providers/AuthProvider';
import api from '../lib/api';
import { usePublicSystemConfig } from '../hooks/usePublicSystemConfig';
import { getMarketingContext } from '../lib/marketing';

type FormValues = {
  email: string;
  password: string;
};

const LoginPage = () => {
  const { login, token, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    handleSubmit,
    register,
    getValues,
    formState: { errors },
  } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const publicConfigQuery = usePublicSystemConfig();
  const googleEnabled = Boolean(publicConfigQuery.data?.googleOAuthClientId);

  useEffect(() => {
    const oauthError = searchParams.get('oauthError');
    if (oauthError) {
      setError('Google sign-in failed. Please try again.');
    }
  }, [searchParams]);

  if (token) {
    return <Navigate to={getDashboardRoute(role)} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const session = await login(values.email, values.password);
      navigate(getDashboardRoute(session.role), { replace: true });
    } catch (err) {
      console.error(err);
      const serverError = (err as any)?.response?.data?.error;
      if (serverError === 'email_not_verified') {
        setNeedsVerification(true);
        setError('Please verify your email before signing in.');
      } else {
        setError('Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    const email = getValues('email');
    if (!email) return;
    setResendLoading(true);
    try {
      await api.post('/auth/verify-email/resend', { email });
    } catch (err) {
      console.error(err);
    } finally {
      setResendLoading(false);
    }
  };

  const startGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const marketing = getMarketingContext();
      const { data } = await api.get('/auth/google', {
        params: {
          mode: 'login',
          sessionId: marketing.sessionId ?? undefined,
          utmSource: marketing.utmSource ?? undefined,
          utmMedium: marketing.utmMedium ?? undefined,
          utmCampaign: marketing.utmCampaign ?? undefined,
          referrer: marketing.referrer ?? undefined,
          landingPage: marketing.landingPage ?? undefined,
        },
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError('Unable to start Google sign-in.');
    } catch (err) {
      console.error(err);
      setError('Unable to start Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Use your tenant or owner credentials.</p>

        {googleEnabled && (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={startGoogleLogin}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="mt-1 text-xs text-rose-400">{errors.email.message}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs text-indigo-300 hover:text-indigo-200"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && <p className="mt-1 text-xs text-rose-400">{errors.password.message}</p>}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {needsVerification && (
            <button
              type="button"
              onClick={resendVerification}
              disabled={resendLoading}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend verification email'}
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">
          Need an account?{' '}
          <Link to="/signup" className="text-indigo-300 hover:text-indigo-200">
            Request access
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
