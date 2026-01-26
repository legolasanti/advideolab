import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { PLAN_DEFINITIONS } from '../lib/plans';
import type { PlanCode } from '../lib/plans';
import { evaluatePassword, generateStrongPassword } from '../lib/password';
import { usePublicSystemConfig } from '../hooks/usePublicSystemConfig';
import { useMarketingTracker } from '../hooks/useMarketingTracker';
import { getMarketingContext } from '../lib/marketing';

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
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>('growth');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordToast, setPasswordToast] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  const publicConfigQuery = usePublicSystemConfig();
  useMarketingTracker('signup_started');

  const passwordValue = watch('password') ?? '';
  const confirmValue = watch('confirmPassword') ?? '';
  const couponValue = (watch('couponCode') ?? '').trim();
  const passwordChecks = evaluatePassword(passwordValue);
  const confirmMatches = confirmValue.length > 0 && confirmValue === passwordValue;

  useEffect(() => {
    const planFromQuery = searchParams.get('plan');
    const intervalFromQuery = searchParams.get('interval');
    if (planFromQuery && (['starter', 'growth', 'scale'] as PlanCode[]).includes(planFromQuery as PlanCode)) {
      setSelectedPlan(planFromQuery as PlanCode);
    }
    if (intervalFromQuery === 'annual') {
      setBillingInterval('annual');
    }
  }, [searchParams]);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setLoading(true);
    try {
      const marketing = getMarketingContext();
      const payload = {
        companyName: values.companyName,
        contactName: values.contactName,
        email: values.email,
        password: values.password,
        planCode: selectedPlan,
        billingInterval,
        couponCode: values.couponCode?.trim() || undefined,
        marketing,
      };

      await api.post('/auth/signup', payload);
      setVerificationSent(true);
      setSignupEmail(values.email);
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

  const resendVerification = async () => {
    if (!signupEmail) return;
    setResendLoading(true);
    try {
      await api.post('/auth/verify-email/resend', { email: signupEmail });
    } catch (err) {
      console.error(err);
    } finally {
      setResendLoading(false);
    }
  };

  const googleEnabled = Boolean(publicConfigQuery.data?.googleOAuthClientId);
  const startGoogleSignup = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const marketing = getMarketingContext();
      const values = getValues();
      const { data } = await api.get('/auth/google', {
        params: {
          mode: 'signup',
          planCode: selectedPlan,
          billingInterval,
          couponCode: values.couponCode?.trim() || undefined,
          companyName: values.companyName?.trim() || undefined,
          contactName: values.contactName?.trim() || undefined,
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
      setError('Unable to start Google signup.');
    } catch (err) {
      console.error(err);
      setError('Unable to start Google signup.');
    } finally {
      setGoogleLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Check your inbox</h1>
          <p className="mt-2 text-sm text-slate-400">
            We sent a verification link to <span className="text-white">{signupEmail}</span>. Verify your email to continue
            to checkout.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={resendVerification}
              disabled={resendLoading}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend verification email'}
            </button>
            <Link to="/login" className="text-center text-sm text-indigo-300 hover:text-indigo-200">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selectedPlanDef = PLAN_DEFINITIONS[selectedPlan];
  const basePrice = billingInterval === 'annual' ? selectedPlanDef.annualPriceUsd : selectedPlanDef.priceUsd;
  const discountedPrice = applyCouponToPrice(basePrice, appliedCoupon);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <div className="w-full max-w-2xl rounded-3xl border border-white/5 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choose your plan and complete payment to get started.
        </p>

        {/* Step 1: Sign Up Method */}
        <div className="mt-8">
          <p className="text-sm font-medium text-slate-300 mb-4">1. Sign up</p>

          {googleEnabled && (
            <button
              type="button"
              onClick={startGoogleSignup}
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
          )}

          <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => setShowManualForm(!showManualForm)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <span>Sign up with email</span>
            <svg
              className={`h-5 w-5 transition-transform ${showManualForm ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showManualForm && (
            <form className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="block text-sm font-medium text-slate-300">Company / brand name</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
                  {...register('companyName', { required: 'Company name is required' })}
                />
                {errors.companyName && <p className="mt-1 text-xs text-rose-400">{errors.companyName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Contact name (optional)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
                  {...register('contactName')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 focus:border-indigo-400 focus:outline-none"
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
                    Suggest strong password
                  </button>
                </div>
                {passwordToast && <p className="mt-1 text-xs text-emerald-200">{passwordToast}</p>}
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 pr-16 focus:border-indigo-400 focus:outline-none"
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  <p className={passwordChecks.lengthMin8 ? 'text-emerald-200' : 'text-slate-500'}>• 8+ characters</p>
                  <p className={passwordChecks.hasUpper ? 'text-emerald-200' : 'text-slate-500'}>• Uppercase</p>
                  <p className={passwordChecks.hasLower ? 'text-emerald-200' : 'text-slate-500'}>• Lowercase</p>
                  <p className={passwordChecks.hasNumber ? 'text-emerald-200' : 'text-slate-500'}>• Number</p>
                  <p className={passwordChecks.hasSymbol ? 'text-emerald-200' : 'text-slate-500'}>• Symbol</p>
                </div>
                {errors.password && <p className="mt-2 text-xs text-rose-400">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Confirm password</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 pr-16 focus:border-indigo-400 focus:outline-none"
                    {...register('confirmPassword', {
                      required: 'Please confirm your password.',
                      validate: (value) => (value === getValues('password') ? true : 'Passwords do not match.'),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {confirmMatches && <p className="mt-1 text-xs text-emerald-200">Passwords match</p>}
                {errors.confirmPassword && <p className="mt-1 text-xs text-rose-400">{errors.confirmPassword.message}</p>}
              </div>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={loading || !isValid}
                className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {loading ? 'Creating account…' : 'Continue to payment'}
              </button>
            </form>
          )}
        </div>

        {/* Step 2: Select Plan */}
        <div className="mt-8">
          <p className="text-sm font-medium text-slate-300 mb-4">2. Select your plan</p>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-full border border-white/10 bg-slate-900/70 p-1">
              <button
                type="button"
                onClick={() => setBillingInterval('monthly')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  billingInterval === 'monthly' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('annual')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  billingInterval === 'annual' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Annual <span className="text-xs opacity-80">· Save 17%</span>
              </button>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {Object.values(PLAN_DEFINITIONS).map((plan) => {
              const planBasePrice = billingInterval === 'annual' ? plan.annualPriceUsd : plan.priceUsd;
              const planDiscounted = applyCouponToPrice(planBasePrice, appliedCoupon);
              const isSelected = selectedPlan === plan.code;
              const isPopular = plan.code === 'growth';

              return (
                <button
                  type="button"
                  key={plan.code}
                  onClick={() => setSelectedPlan(plan.code)}
                  className={`relative rounded-2xl border p-5 text-left transition ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-400/50'
                      : 'border-white/10 hover:border-indigo-400/40'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
                      Most Popular
                    </span>
                  )}
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                    <p className="text-xs text-slate-400">{plan.description}</p>
                  </div>
                  <div className="mb-4">
                    {planDiscounted !== null ? (
                      <>
                        <span className="text-sm text-slate-500 line-through">{formatUsd(planBasePrice)}</span>
                        <span className="ml-2 text-2xl font-bold text-emerald-400">{formatUsd(planDiscounted)}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold text-white">{formatUsd(planBasePrice)}</span>
                    )}
                    <span className="text-sm text-slate-400">/{billingInterval === 'annual' ? 'year' : 'month'}</span>
                    {billingInterval === 'annual' && (
                      <p className="mt-1 text-xs text-emerald-300">{formatUsd(plan.monthlyEquivalentUsd)}/mo billed annually</p>
                    )}
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {plan.quota} videos/month
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      All platforms
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Priority support
                    </li>
                  </ul>
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <svg className="h-6 w-6 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Coupon Section */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <p className="text-sm font-medium text-slate-200 mb-3">Have a coupon code?</p>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 font-mono uppercase text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="COUPON2025"
              {...register('couponCode', {
                setValueAs: (val) => (typeof val === 'string' ? val.toUpperCase() : val),
              })}
            />
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
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
              {couponChecking ? '...' : appliedCoupon ? 'Remove' : 'Apply'}
            </button>
          </div>
          {couponMessage && <p className="mt-2 text-xs text-emerald-300">{couponMessage}</p>}
        </div>

        {/* Summary */}
        <div className="mt-8 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Selected plan</p>
              <p className="text-lg font-semibold text-white">{selectedPlanDef.name} · {billingInterval === 'annual' ? 'Annual' : 'Monthly'}</p>
            </div>
            <div className="text-right">
              {discountedPrice !== null ? (
                <>
                  <p className="text-sm text-slate-500 line-through">{formatUsd(basePrice)}</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatUsd(discountedPrice)}</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-white">{formatUsd(basePrice)}</p>
              )}
            </div>
          </div>
        </div>

        {error && !showManualForm && <p className="mt-4 text-sm text-rose-400">{error}</p>}

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-300 hover:text-indigo-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
