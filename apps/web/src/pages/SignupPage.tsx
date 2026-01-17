import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { PLAN_DEFINITIONS } from '../lib/plans';
import type { PlanCode } from '../lib/plans';
import { evaluatePassword, generateStrongPassword } from '../lib/password';

type FormValues = {
  companyName: string;
  contactName?: string;
  email: string;
  password: string;
  confirmPassword: string;
  couponCode?: string;
};

type Coupon = {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
};

const formatUsd = (amount: number) => {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
};

const applyCouponToPrice = (baseUsd: number, coupon: Coupon | null) => {
  if (!coupon) return null;
  if (coupon.type === 'percent') {
    return Math.max(baseUsd * (1 - coupon.value / 100), 0);
  }
  return Math.max(baseUsd - coupon.value, 0);
};

const SignupPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const {
    handleSubmit,
    register,
    getValues,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({ mode: 'onChange' });
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>('starter');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordToast, setPasswordToast] = useState<string | null>(null);

  const passwordValue = watch('password') ?? '';
  const confirmValue = watch('confirmPassword') ?? '';
  const couponValue = (watch('couponCode') ?? '').trim();
  const passwordChecks = evaluatePassword(passwordValue);
  const confirmMatches = confirmValue.length > 0 && confirmValue === passwordValue;

  useEffect(() => {
    const planFromQuery = searchParams.get('plan');
    if (planFromQuery && (['starter', 'growth', 'scale'] as PlanCode[]).includes(planFromQuery as PlanCode)) {
      setSelectedPlan(planFromQuery as PlanCode);
    }
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        companyName: values.companyName,
        contactName: values.contactName,
        email: values.email,
        password: values.password,
        planCode: selectedPlan,
        couponCode: values.couponCode?.trim() || undefined,
      };

      const { data } = await api.post('/auth/signup', payload);
      await login(values.email, values.password);
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      navigate('/app', { replace: true });
    } catch (err: any) {
      console.error(err);
      const serverError = err?.response?.data?.error;
      if (serverError === 'email_taken') {
        setError('This email is already registered.');
      } else if (typeof serverError === 'string' && serverError.trim().length > 0) {
        setError(serverError);
      } else if (serverError && typeof serverError === 'object') {
        const fieldErrors = (serverError as any)?.fieldErrors;
        const formErrors = (serverError as any)?.formErrors;
        const firstFieldError = fieldErrors
          ? (Object.values(fieldErrors) as string[][]).flat().find((msg) => typeof msg === 'string' && msg.length > 0)
          : null;
        const firstFormError =
          Array.isArray(formErrors) && typeof formErrors[0] === 'string' ? (formErrors[0] as string) : null;
        setError(firstFieldError ?? firstFormError ?? 'Unable to create your workspace. Please try again.');
      } else {
        setError('Unable to create your workspace. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!passwordToast) return;
    const timer = window.setTimeout(() => setPasswordToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [passwordToast]);

  const suggestPassword = async () => {
    const suggested = generateStrongPassword(12);
    setValue('password', suggested, { shouldValidate: true, shouldDirty: true });
    setValue('confirmPassword', suggested, { shouldValidate: true, shouldDirty: true });
    try {
      await navigator.clipboard.writeText(suggested);
      setPasswordToast('Strong password generated and copied.');
    } catch (_err) {
      setPasswordToast('Strong password generated.');
    }
  };

  useEffect(() => {
    if (!appliedCoupon) return;
    if (couponValue.toUpperCase() !== appliedCoupon.code.toUpperCase()) {
      setAppliedCoupon(null);
      setCouponMessage(null);
    }
  }, [appliedCoupon, couponValue]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Create your workspace</h1>
        <p className="mt-2 text-sm text-slate-400">
          Tell us about your brand, apply a coupon (optional), then complete payment to activate your workspace.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-300">Company / brand name</label>
            <input
              type="text"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('companyName', { required: 'Company name is required' })}
            />
            {errors.companyName && <p className="mt-1 text-xs text-rose-400">{errors.companyName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Contact name (optional)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('contactName')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="mt-1 text-xs text-rose-400">{errors.email.message}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <button
                type="button"
                onClick={suggestPassword}
                className="text-xs font-semibold text-indigo-300 hover:text-indigo-200"
              >
                Suggest a strong password
              </button>
            </div>
            {passwordToast && <p className="mt-1 text-xs text-emerald-200">{passwordToast}</p>}

            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 pr-20 focus:border-indigo-400 focus:outline-none"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters.' },
                  validate: (value) =>
                    evaluatePassword(value).meetsAll
                      ? true
                      : 'Use uppercase, lowercase, a number, and a symbol.',
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className={`h-2 rounded-full transition-all ${
                    passwordChecks.score >= 5
                      ? 'bg-emerald-400'
                      : passwordChecks.score >= 3
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                  style={{ width: `${(passwordChecks.score / 5) * 100}%` }}
                />
              </div>
              <div className="mt-2 grid gap-1 text-xs">
                <p className={passwordChecks.lengthMin8 ? 'text-emerald-200' : 'text-slate-400'}>
                  • At least 8 characters
                </p>
                <p className={passwordChecks.hasUpper ? 'text-emerald-200' : 'text-slate-400'}>
                  • Includes an uppercase letter
                </p>
                <p className={passwordChecks.hasLower ? 'text-emerald-200' : 'text-slate-400'}>
                  • Includes a lowercase letter
                </p>
                <p className={passwordChecks.hasNumber ? 'text-emerald-200' : 'text-slate-400'}>
                  • Includes a number
                </p>
                <p className={passwordChecks.hasSymbol ? 'text-emerald-200' : 'text-slate-400'}>
                  • Includes a symbol
                </p>
                <p className={passwordChecks.lengthRecommended ? 'text-slate-300' : 'text-slate-500'}>
                  Recommended: 10–14 characters
                </p>
              </div>
            </div>

            {errors.password && <p className="mt-2 text-xs text-rose-400">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Confirm password</label>
            <div className="relative mt-1">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 pr-20 focus:border-indigo-400 focus:outline-none"
                {...register('confirmPassword', {
                  required: 'Please confirm your password.',
                  validate: (value) => (value === getValues('password') ? true : 'Passwords do not match.'),
                })}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {!errors.confirmPassword && confirmMatches && (
              <p className="mt-2 text-xs text-emerald-200">Passwords match.</p>
            )}
            {errors.confirmPassword && (
              <p className="mt-2 text-xs text-rose-400">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">Select a plan</p>
            <div className="mt-3 grid gap-3">
              {Object.values(PLAN_DEFINITIONS).map((plan) => {
                const discounted = applyCouponToPrice(plan.priceUsd, appliedCoupon);
                return (
                  <button
                    type="button"
                    key={plan.code}
                    onClick={() => setSelectedPlan(plan.code)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedPlan === plan.code
                        ? 'border-indigo-400 bg-indigo-500/20 text-white'
                        : 'border-white/10 text-slate-200 hover:border-indigo-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold">{plan.name}</p>
                        <p className="text-xs text-slate-300">{plan.description}</p>
                      </div>
                      <div className="text-right">
                        {discounted !== null ? (
                          <div className="space-y-0.5">
                            <p className="text-xs text-slate-400 line-through">{formatUsd(plan.priceUsd)}/mo</p>
                            <p className="text-sm font-semibold text-emerald-200">{formatUsd(discounted)}/mo</p>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold">{formatUsd(plan.priceUsd)}/mo</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">After signup you&apos;ll be redirected to Stripe Checkout.</p>
            {appliedCoupon && (
              <p className="mt-2 text-xs text-emerald-200">
                Coupon applied: <span className="font-mono">{appliedCoupon.code}</span> ·{' '}
                {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% off` : `${formatUsd(appliedCoupon.value)} off`}{' '}
                (first invoice).
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-200">Coupon (optional)</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 font-mono uppercase focus:border-indigo-400 focus:outline-none"
                placeholder="SUMMER2025"
                {...register('couponCode', {
                  setValueAs: (val) => (typeof val === 'string' ? val.toUpperCase() : val),
                })}
              />
              <button
                type="button"
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={couponChecking}
                onClick={async () => {
                  setCouponMessage(null);
                  setCouponChecking(true);
                  try {
                    const code = getValues('couponCode')?.trim();
                    if (!code) {
                      setAppliedCoupon(null);
                      setCouponMessage(null);
                      return;
                    }
                    if (appliedCoupon && code.toUpperCase() === appliedCoupon.code.toUpperCase()) {
                      setValue('couponCode', '', { shouldDirty: true, shouldValidate: true });
                      setAppliedCoupon(null);
                      setCouponMessage(null);
                      return;
                    }
                    const { data } = await api.post('/public/coupons/validate', { code: code.toUpperCase() });
                    if (data.valid) {
                      setAppliedCoupon({ code: data.code, type: data.type, value: data.value });
                      setCouponMessage(
                        `Valid coupon: ${data.type === 'percent' ? `${data.value}% off` : `$${data.value} off`}`,
                      );
                    } else {
                      setAppliedCoupon(null);
                      setCouponMessage('Invalid coupon.');
                    }
                  } catch (_e) {
                    setAppliedCoupon(null);
                    setCouponMessage('Invalid or expired coupon.');
                  } finally {
                    setCouponChecking(false);
                  }
                }}
              >
                {couponChecking ? 'Checking…' : appliedCoupon ? 'Remove' : 'Apply'}
              </button>
            </div>
            {couponMessage && <p className="text-xs text-slate-300">{couponMessage}</p>}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !isValid}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? 'Creating checkout…' : 'Continue to payment'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">
          Already onboarded?{' '}
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
