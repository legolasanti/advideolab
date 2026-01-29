import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2,
  Video,
  Users,
  Calendar,
  DollarSign,
  Lock,
  Mail,
  User,
  Check,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import api from '../lib/api';

type InvitationDetails = {
  id: string;
  email: string;
  companyName: string;
  customMonthlyPriceUsd: number;
  customAnnualPriceUsd: number | null;
  billingInterval: 'monthly' | 'annual';
  maxSubCompanies: number;
  maxAdditionalUsers: number;
  totalVideoCredits: number;
  expiresAt: string;
};

const EnterpriseAcceptPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const invitationQuery = useQuery<InvitationDetails>({
    queryKey: ['enterpriseInvitation', token],
    queryFn: async () => {
      const { data } = await api.get(`/public/enterprise-invitation/${token}`);
      return data;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (data: { password: string; name?: string; billingInterval?: string }) => {
      const { data: result } = await api.post(`/public/enterprise-invitation/${token}/accept`, data);
      return result;
    },
    onSuccess: () => {
      // Redirect to login page after successful acceptance
      navigate('/login?enterprise=accepted');
    },
  });

  useEffect(() => {
    if (invitationQuery.data) {
      setBillingInterval(invitationQuery.data.billingInterval);
    }
  }, [invitationQuery.data]);

  const validatePassword = () => {
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    if (!acceptedTerms) return;

    acceptMutation.mutate({
      password,
      name: name.trim() || undefined,
      billingInterval,
    });
  };

  const getErrorMessage = (error: any): string => {
    const errorCode = error?.response?.data?.error || error?.message || 'unknown_error';
    const messages: Record<string, string> = {
      invitation_not_found: 'This invitation link is invalid or has been removed.',
      invitation_expired: 'This invitation has expired. Please contact us for a new invitation.',
      invitation_cancelled: 'This invitation has been cancelled.',
      invitation_already_accepted: 'This invitation has already been accepted. Please log in.',
      email_already_registered: 'An account with this email already exists. Please log in instead.',
      invalid_token: 'Invalid invitation link.',
    };
    return messages[errorCode] || 'An error occurred. Please try again.';
  };

  // Error state
  if (invitationQuery.isError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="rounded-full bg-rose-500/20 p-4 w-fit mx-auto mb-6">
            <AlertCircle className="h-12 w-12 text-rose-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-3">Invalid Invitation</h1>
          <p className="text-slate-400 mb-6">
            {getErrorMessage(invitationQuery.error)}
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition"
            >
              Contact Us
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (invitationQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Validating invitation...</p>
        </div>
      </div>
    );
  }

  const invitation = invitationQuery.data;
  if (!invitation) return null;

  const daysUntilExpiry = Math.ceil((new Date(invitation.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const selectedPrice = billingInterval === 'annual' && invitation.customAnnualPriceUsd
    ? invitation.customAnnualPriceUsd
    : invitation.customMonthlyPriceUsd;

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/logo.png" alt="AdVideoLab" className="h-10 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-3">
            Welcome to AdVideoLab Enterprise
          </h1>
          <p className="text-slate-400 max-w-md mx-auto">
            You've been invited to join as an Enterprise customer. Complete the form below to activate your account.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Package Details */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-400" />
              Your Enterprise Package
            </h2>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Company</p>
                <p className="text-xl font-semibold text-white">{invitation.companyName}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-lg text-white">{invitation.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="h-4 w-4 text-indigo-400" />
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Video Credits</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{invitation.totalVideoCredits}</p>
                  <p className="text-xs text-slate-400">per month</p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Sub-Companies</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{invitation.maxSubCompanies}</p>
                  <p className="text-xs text-slate-400">max allowed</p>
                </div>

                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-purple-400" />
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Team Members</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{invitation.maxAdditionalUsers}</p>
                  <p className="text-xs text-slate-400">additional users</p>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-amber-400" />
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Expires In</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{daysUntilExpiry}</p>
                  <p className="text-xs text-slate-400">days</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Your Price</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">${selectedPrice}</span>
                  <span className="text-slate-400">/{billingInterval === 'annual' ? 'year' : 'month'}</span>
                </div>
                {invitation.customAnnualPriceUsd && (
                  <p className="text-xs text-emerald-400 mt-2">
                    Save ${(invitation.customMonthlyPriceUsd * 12) - invitation.customAnnualPriceUsd}/year with annual billing
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Accept Form */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-400" />
              Create Your Account
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Full Name (Optional)
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    value={invitation.email}
                    disabled
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-11 pr-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-rose-400 mt-1">{passwordError}</p>
                )}
              </div>

              {/* Billing interval selection */}
              {invitation.customAnnualPriceUsd && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Billing Interval
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBillingInterval('monthly')}
                      className={`rounded-xl border p-4 text-left transition ${
                        billingInterval === 'monthly'
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <p className="font-semibold text-white">${invitation.customMonthlyPriceUsd}/mo</p>
                      <p className="text-xs text-slate-400 mt-1">Monthly billing</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingInterval('annual')}
                      className={`rounded-xl border p-4 text-left transition ${
                        billingInterval === 'annual'
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <p className="font-semibold text-white">${invitation.customAnnualPriceUsd}/yr</p>
                      <p className="text-xs text-emerald-400 mt-1">Save ${(invitation.customMonthlyPriceUsd * 12) - invitation.customAnnualPriceUsd}</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-400">
                  I agree to the{' '}
                  <Link to="/terms" className="text-indigo-400 hover:underline" target="_blank">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-indigo-400 hover:underline" target="_blank">
                    Privacy Policy
                  </Link>
                </span>
              </label>

              {acceptMutation.isError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                  <p className="text-sm text-rose-300">
                    {getErrorMessage(acceptMutation.error)}
                  </p>
                </div>
              )}

              {acceptMutation.isSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-4 w-4" />
                    <p className="text-sm font-medium">Account created successfully!</p>
                  </div>
                  <p className="text-xs text-emerald-400 mt-1">Redirecting to login...</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!acceptedTerms || acceptMutation.isPending || acceptMutation.isSuccess}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : acceptMutation.isSuccess ? (
                  <>
                    <Check className="h-4 w-4" />
                    Success!
                  </>
                ) : (
                  <>
                    Accept Invitation
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-slate-500 text-center mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-400 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnterpriseAcceptPage;
