import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth, getDashboardRoute } from '../providers/AuthProvider';

type FormValues = {
  email: string;
  password: string;
};

const LoginPage = () => {
  const { login, token, role } = useAuth();
  const navigate = useNavigate();
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to={getDashboardRoute(role)} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setLoading(true);
    try {
      const session = await login(values.email, values.password);
      navigate(getDashboardRoute(session.role), { replace: true });
    } catch (err) {
      console.error(err);
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Use your tenant or owner credentials.</p>

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
