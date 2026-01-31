import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const role = searchParams.get('role');
    const checkoutUrl = searchParams.get('checkoutUrl');
    const oauthError = searchParams.get('oauthError');

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!token) {
      setError('Missing session token.');
      return;
    }

    const finish = async () => {
      try {
        const parsedRole =
          role === 'owner_superadmin' || role === 'tenant_admin' || role === 'user' ? role : undefined;
        await setSession({ token, role: parsedRole });
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        navigate('/app', { replace: true });
      } catch (err) {
        console.error(err);
        setError('Unable to finalize Google login.');
      }
    };

    finish();
  }, [navigate, searchParams, setSession]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Google sign-in failed</h1>
          <p className="mt-2 text-sm text-rose-300">{error}</p>
          <div className="mt-6">
            <Link to="/login" className="text-sm text-indigo-300 hover:text-indigo-200">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Signing you in…</h1>
        <p className="mt-2 text-sm text-slate-400">Completing Google authentication.</p>
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
