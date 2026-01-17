import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';

type FormValues = {
  newPassword: string;
  confirmPassword: string;
};

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const {
    handleSubmit,
    register,
    formState: { errors },
    watch,
  } = useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur text-center">
          <h1 className="text-2xl font-semibold text-white">Invalid reset link</h1>
          <p className="mt-2 text-sm text-slate-400">
            This password reset link is invalid or has expired.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/password-reset/confirm', {
        token,
        newPassword: values.newPassword,
      });
      navigate('/login', {
        state: { message: 'Password reset successful! You can now log in with your new password.' }
      });
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.response?.data?.error;
      if (errorMessage === 'Invalid or expired reset token') {
        setError('This reset link has expired or is invalid');
      } else if (errorMessage === 'This reset link has already been used') {
        setError('This reset link has already been used');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const password = watch('newPassword');

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Set new password</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choose a strong password for your account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-300">New Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('newPassword', {
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters',
                },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
                  message: 'Password must include uppercase, lowercase, number, and symbol',
                },
              })}
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-rose-400">{errors.newPassword.message}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Must include uppercase, lowercase, number, and symbol
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Confirm Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (value) => value === password || 'Passwords do not match',
              })}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-rose-400">{errors.confirmPassword.message}</p>
            )}
          </div>
          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
