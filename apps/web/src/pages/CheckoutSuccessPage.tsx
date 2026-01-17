import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type ActivationPhase = 'activating' | 'processing' | 'failed';

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const CheckoutSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const sessionId = searchParams.get('session_id');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ActivationPhase>('activating');
  const [attempt, setAttempt] = useState(0);

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

      const maxAttempts = 12;

      for (let i = 0; i < maxAttempts; i += 1) {
        if (cancelled) return;
        setAttempt(i + 1);

        try {
          await api.post('/tenant/billing/stripe/finalize', { sessionId });
        } catch (err: any) {
          const serverError = err?.response?.data?.error;
          if (serverError === 'payment_processing') {
            setPhase('processing');
          } else if (typeof serverError === 'string' && serverError.trim().length > 0) {
            setPhase('failed');
            setError(serverError);
            return;
          } else {
            setPhase('failed');
            setError('Unable to confirm payment. Please try again.');
            return;
          }
        }

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
            return;
          }
        } catch (_err) {
          // ignore and continue polling
        }

        await sleep(2500);
      }

      setPhase('failed');
      setError('We are still processing your payment. Please use Retry, or check your dashboard in a moment.');
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, refreshProfile, sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Payment received</h1>
        <p className="mt-2 text-sm text-slate-400">
          {phase === 'processing'
            ? `Payment is processing… (attempt ${attempt}/12)`
            : phase === 'activating'
            ? `Activating your workspace… (attempt ${attempt}/12)`
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
