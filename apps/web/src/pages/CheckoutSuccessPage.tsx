import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type ActivationPhase = 'activating' | 'processing' | 'completed' | 'failed';

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const CheckoutSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile, token } = useAuth();
  const sessionId = searchParams.get('session_id');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ActivationPhase>('activating');
  const [attempt, setAttempt] = useState(0);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing Stripe session ID.');
      return;
    }

    let cancelled = false;

    const run = async () => {
      setError(null);
      setPhase('activating');
      setAttempt(0);
      setNeedsLogin(false);

      const maxAttempts = 12;
      let authFailed = false;

      // Check activation via authenticated endpoint
      const checkActivationAuth = async (): Promise<boolean> => {
        try {
          const { data } = await api.get('/auth/me');
          const tenantStatus = data?.tenant?.status;
          const planCode = data?.tenant?.planCode;
          if (tenantStatus === 'active' && planCode) {
            await refreshProfile();
            queryClient.invalidateQueries({ queryKey: ['usage'] });
            if (!cancelled) {
              navigate('/app', { replace: true });
            }
            return true;
          }
          return false;
        } catch (err: any) {
          // If 401/403, auth has expired
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            authFailed = true;
          }
          return false;
        }
      };

      // Check activation via public endpoint (no auth required)
      const checkActivationPublic = async (): Promise<'active' | 'processing' | 'not_found'> => {
        try {
          const { data } = await api.get(`/public/checkout-status/${sessionId}`);
          if (data?.found && data?.isActive) {
            return 'active';
          }
          if (data?.found) {
            return 'processing';
          }
          return 'not_found';
        } catch (_err) {
          return 'not_found';
        }
      };

      // First try authenticated check
      if (token) {
        try {
          if (await checkActivationAuth()) return;
        } catch (_err) {
          // ignore and continue
        }
      } else {
        authFailed = true;
      }

      let lastError: string | null = null;

      for (let i = 0; i < maxAttempts; i += 1) {
        if (cancelled) return;
        setAttempt(i + 1);

        // If auth is working, try finalize endpoint
        if (!authFailed && token) {
          try {
            await api.post('/tenant/billing/stripe/finalize', { sessionId });
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 401 || status === 403) {
              authFailed = true;
            }
            const serverError = err?.response?.data?.error;
            if (serverError === 'payment_processing' || serverError === 'payment_not_completed') {
              setPhase('processing');
            } else if (typeof serverError === 'string' && serverError.trim().length > 0) {
              lastError = serverError;
              setPhase('processing');
            } else {
              lastError = 'Unable to confirm payment. Please try again.';
              setPhase('processing');
            }
          }
        }

        // Check status
        if (!authFailed && token) {
          try {
            if (await checkActivationAuth()) return;
          } catch (_err) {
            // ignore
          }
        }

        // Use public endpoint if auth failed
        if (authFailed || !token) {
          const publicStatus = await checkActivationPublic();
          if (publicStatus === 'active') {
            // Payment complete but user needs to log in
            setPhase('completed');
            setNeedsLogin(true);
            return;
          } else if (publicStatus === 'processing') {
            setPhase('processing');
          }
        }

        await sleep(2500);
      }

      // Final check with public endpoint
      const finalStatus = await checkActivationPublic();
      if (finalStatus === 'active') {
        setPhase('completed');
        setNeedsLogin(true);
        return;
      }

      setPhase('failed');
      setError(lastError ?? 'We are still processing your payment. Please use Retry, or check your dashboard in a moment.');
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, refreshProfile, sessionId, token]);

  // Payment complete but needs login
  if (needsLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Payment successful!</h1>
          <p className="mt-2 text-sm text-slate-400">
            Your account is now active. Please log in to continue.
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
            onClick={() => navigate('/login?from=checkout')}
          >
            Log in to continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Payment received</h1>
        <p className="mt-2 text-sm text-slate-400">
          {phase === 'processing'
            ? `Payment is processing… (attempt ${attempt}/12)`
            : phase === 'activating'
            ? `Activating your workspace… (attempt ${attempt}/12)`
            : phase === 'completed'
            ? 'Your account is active!'
            : 'Activation needs attention.'}
        </p>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}
        {phase === 'failed' && (
          <button
            type="button"
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            onClick={() => window.location.reload()}
          >
            Retry activation
          </button>
        )}
        <button
          type="button"
          className="mt-6 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          onClick={() => navigate('/app')}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
};

export default CheckoutSuccessPage;
