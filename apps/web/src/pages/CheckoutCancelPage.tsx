import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const CheckoutCancelPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/tenant/billing/checkout', {});
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError('Checkout URL not available.');
    } catch (err: any) {
      console.error(err);
      const serverError = err?.response?.data?.error;
      setError(typeof serverError === 'string' ? serverError : 'Unable to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Checkout cancelled</h1>
        <p className="mt-2 text-sm text-slate-400">Your workspace is still pending. You can retry payment anytime.</p>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            onClick={retry}
            disabled={loading}
          >
            {loading ? 'Starting checkout…' : 'Retry payment'}
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            onClick={() => navigate('/app')}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutCancelPage;

