import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { getMarketingContext } from '../lib/marketing';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError('Verification token missing.');
      return;
    }

    const verify = async () => {
      try {
        const marketing = getMarketingContext();
        const { data } = await api.post('/auth/verify-email', {
          token,
          marketing,
        });
        await setSession({ token: data.token, role: data.role, tenant: data.tenant });
        setStatus('success');
        if (data?.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        navigate('/app', { replace: true });
      } catch (err: any) {
        console.error(err);
        const serverError = err?.response?.data?.error;
        setError(typeof serverError === 'string' ? serverError : 'Verification failed.');
        setStatus('error');
      }
    };

    verify();
  }, [navigate, searchParams, setSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        {status === 'loading' && (
          <>
            <h1 className="text-3xl font-semibold text-white">Verifying email…</h1>
            <p className="mt-2 text-sm text-slate-400">Hang tight while we activate your workspace.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-3xl font-semibold text-white">Email verified</h1>
            <p className="mt-2 text-sm text-slate-400">Redirecting you now…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-3xl font-semibold text-white">Verification failed</h1>
            <p className="mt-2 text-sm text-rose-300">{error ?? 'Unable to verify this email link.'}</p>
            <div className="mt-6">
              <Link to="/login" className="text-sm text-indigo-300 hover:text-indigo-200">
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;
