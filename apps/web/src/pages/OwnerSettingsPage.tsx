import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

type SystemConfigResponse = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassSet: boolean;
  emailFrom: string | null;
  notificationEmail: string | null;
  stripePublishableKey: string | null;
  stripeSecretKeySet: boolean;
  stripeWebhookSecretSet: boolean;
  stripePriceIdStarter: string | null;
  stripePriceIdGrowth: string | null;
  stripePriceIdScale: string | null;
  stripePriceIdStarterAnnual: string | null;
  stripePriceIdGrowthAnnual: string | null;
  stripePriceIdScaleAnnual: string | null;
  sandboxTenantId: string | null;
  customHeadCode: string | null;
  customBodyStart: string | null;
  customBodyEnd: string | null;
  googleOAuthClientId: string | null;
  googleOAuthClientSecretSet: boolean;
  googleOAuthRedirectUri?: string | null;
  updatedAt?: string;
};

type ApiKeyProvider = {
  provider: string;
  configured: boolean;
  lastFourChars?: string;
  updatedAt?: string;
};

type N8nConfigResponse = {
  n8nBaseUrl: string | null;
  n8nProcessPath: string | null;
  n8nInternalTokenSet: boolean;
};

type TenantRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  plan: {
    code: string | null;
    name: string | null;
    monthlyVideoLimit: number;
    bonusCredits?: number;
    videosUsedThisCycle: number;
    billingCycleStart: string;
  };
};

const normalizeNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const OwnerSettingsPage = () => {
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);

  const configQuery = useQuery<SystemConfigResponse>({
    queryKey: ['ownerSystemConfig'],
    queryFn: async () => {
      const { data } = await api.get('/owner/system-config');
      return data;
    },
  });

  const tenantsQuery = useQuery<TenantRow[]>({
    queryKey: ['ownerTenants'],
    queryFn: async () => {
      const { data } = await api.get('/owner/tenants');
      return data;
    },
  });

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');

  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripePriceIdStarter, setStripePriceIdStarter] = useState('');
  const [stripePriceIdGrowth, setStripePriceIdGrowth] = useState('');
  const [stripePriceIdScale, setStripePriceIdScale] = useState('');
  const [stripePriceIdStarterAnnual, setStripePriceIdStarterAnnual] = useState('');
  const [stripePriceIdGrowthAnnual, setStripePriceIdGrowthAnnual] = useState('');
  const [stripePriceIdScaleAnnual, setStripePriceIdScaleAnnual] = useState('');

  const [sandboxTenantId, setSandboxTenantId] = useState<string>('');

  const [customHeadCode, setCustomHeadCode] = useState('');
  const [customBodyStart, setCustomBodyStart] = useState('');
  const [customBodyEnd, setCustomBodyEnd] = useState('');
  const [googleOAuthClientId, setGoogleOAuthClientId] = useState('');
  const [googleOAuthClientSecret, setGoogleOAuthClientSecret] = useState('');

  // API Keys state
  const [apiKeyProvider, setApiKeyProvider] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');

  // n8n Config state
  const [n8nBaseUrl, setN8nBaseUrl] = useState('');
  const [n8nProcessPath, setN8nProcessPath] = useState('');
  const [n8nInternalToken, setN8nInternalToken] = useState('');

  // Queries for API keys and n8n config
  const apiKeysQuery = useQuery<{ providers: ApiKeyProvider[] }>({
    queryKey: ['ownerApiKeys'],
    queryFn: async () => {
      const { data } = await api.get('/owner/api-keys');
      return data;
    },
  });

  const n8nConfigQuery = useQuery<N8nConfigResponse>({
    queryKey: ['ownerN8nConfig'],
    queryFn: async () => {
      const { data } = await api.get('/owner/n8n-config');
      return data;
    },
  });

  useEffect(() => {
    if (!n8nConfigQuery.data) return;
    const cfg = n8nConfigQuery.data;
    setN8nBaseUrl(cfg.n8nBaseUrl ?? '');
    setN8nProcessPath(cfg.n8nProcessPath ?? '');
  }, [n8nConfigQuery.data]);

  useEffect(() => {
    if (!configQuery.data) return;
    const cfg = configQuery.data;
    setSmtpHost(cfg.smtpHost ?? '');
    setSmtpPort(String(cfg.smtpPort ?? 587));
    setSmtpUser(cfg.smtpUser ?? '');
    setEmailFrom(cfg.emailFrom ?? '');
    setNotificationEmail(cfg.notificationEmail ?? '');
    setStripePublishableKey(cfg.stripePublishableKey ?? '');
    setStripePriceIdStarter(cfg.stripePriceIdStarter ?? '');
    setStripePriceIdGrowth(cfg.stripePriceIdGrowth ?? '');
    setStripePriceIdScale(cfg.stripePriceIdScale ?? '');
    setStripePriceIdStarterAnnual(cfg.stripePriceIdStarterAnnual ?? '');
    setStripePriceIdGrowthAnnual(cfg.stripePriceIdGrowthAnnual ?? '');
    setStripePriceIdScaleAnnual(cfg.stripePriceIdScaleAnnual ?? '');
    setSandboxTenantId(cfg.sandboxTenantId ?? '');
    setCustomHeadCode(cfg.customHeadCode ?? '');
    setCustomBodyStart(cfg.customBodyStart ?? '');
    setCustomBodyEnd(cfg.customBodyEnd ?? '');
    setGoogleOAuthClientId(cfg.googleOAuthClientId ?? '');
  }, [configQuery.data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedSandboxTenant = useMemo(() => {
    if (!sandboxTenantId) return null;
    return (tenantsQuery.data ?? []).find((tenant) => tenant.id === sandboxTenantId) ?? null;
  }, [sandboxTenantId, tenantsQuery.data]);

  const sandboxUnlimited =
    selectedSandboxTenant?.plan?.monthlyVideoLimit === 0 && Boolean(selectedSandboxTenant.plan.code);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        smtpHost: normalizeNullable(smtpHost),
        smtpPort: smtpPort.trim().length > 0 ? Number(smtpPort) : null,
        smtpUser: normalizeNullable(smtpUser),
        emailFrom: normalizeNullable(emailFrom),
        notificationEmail: normalizeNullable(notificationEmail),
        stripePublishableKey: normalizeNullable(stripePublishableKey),
        stripePriceIdStarter: normalizeNullable(stripePriceIdStarter),
        stripePriceIdGrowth: normalizeNullable(stripePriceIdGrowth),
        stripePriceIdScale: normalizeNullable(stripePriceIdScale),
        stripePriceIdStarterAnnual: normalizeNullable(stripePriceIdStarterAnnual),
        stripePriceIdGrowthAnnual: normalizeNullable(stripePriceIdGrowthAnnual),
        stripePriceIdScaleAnnual: normalizeNullable(stripePriceIdScaleAnnual),
        sandboxTenantId: normalizeNullable(sandboxTenantId),
        customHeadCode: normalizeNullable(customHeadCode),
        customBodyStart: normalizeNullable(customBodyStart),
        customBodyEnd: normalizeNullable(customBodyEnd),
        googleOAuthClientId: normalizeNullable(googleOAuthClientId),
      };

      if (smtpPass.trim().length > 0) payload.smtpPass = smtpPass;
      if (stripeSecretKey.trim().length > 0) payload.stripeSecretKey = stripeSecretKey;
      if (stripeWebhookSecret.trim().length > 0) payload.stripeWebhookSecret = stripeWebhookSecret;
      if (googleOAuthClientSecret.trim().length > 0) payload.googleOAuthClientSecret = googleOAuthClientSecret;

      const { data } = await api.put('/owner/system-config', payload);
      return data as SystemConfigResponse;
    },
    onSuccess: () => {
      setToast('Saved settings');
      setSmtpPass('');
      setStripeSecretKey('');
      setStripeWebhookSecret('');
      setGoogleOAuthClientSecret('');
      queryClient.invalidateQueries({ queryKey: ['ownerSystemConfig'] });
      queryClient.invalidateQueries({ queryKey: ['ownerTenants'] });
    },
  });

  const bootstrapStripeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/owner/stripe/bootstrap', {});
      return data as SystemConfigResponse;
    },
    onSuccess: (cfg) => {
      setToast('Stripe prices created');
      setStripePriceIdStarter(cfg.stripePriceIdStarter ?? '');
      setStripePriceIdGrowth(cfg.stripePriceIdGrowth ?? '');
      setStripePriceIdScale(cfg.stripePriceIdScale ?? '');
      setStripePriceIdStarterAnnual(cfg.stripePriceIdStarterAnnual ?? '');
      setStripePriceIdGrowthAnnual(cfg.stripePriceIdGrowthAnnual ?? '');
      setStripePriceIdScaleAnnual(cfg.stripePriceIdScaleAnnual ?? '');
      queryClient.invalidateQueries({ queryKey: ['ownerSystemConfig'] });
    },
    onError: (err: any) => {
      const serverError = err?.response?.data?.error;
      setToast(typeof serverError === 'string' ? serverError : 'Stripe bootstrap failed');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/owner/system-config/test-email', {});
      return data as { ok: boolean };
    },
    onSuccess: () => setToast('Test email sent'),
  });

  const impersonateMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data } = await api.post('/owner/impersonate', { tenantId });
      return data as { token: string };
    },
    onSuccess: (data) => {
      const url = `${window.location.origin}?impersonationToken=${encodeURIComponent(data.token)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });

  const sandboxUnlimitedMutation = useMutation({
    mutationFn: async ({ tenantId, unlimited }: { tenantId: string; unlimited: boolean }) => {
      const { data } = await api.post(`/owner/tenants/${tenantId}/unlimited`, { unlimited });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerTenants'] });
      setToast('Updated sandbox quota');
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/owner/api-keys', {
        provider: apiKeyProvider,
        key: apiKeyValue,
      });
      return data;
    },
    onSuccess: () => {
      setToast(`Saved ${apiKeyProvider} API key`);
      setApiKeyProvider('');
      setApiKeyValue('');
      queryClient.invalidateQueries({ queryKey: ['ownerApiKeys'] });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data } = await api.delete(`/owner/api-keys/${provider}`);
      return data;
    },
    onSuccess: () => {
      setToast('Deleted API key');
      queryClient.invalidateQueries({ queryKey: ['ownerApiKeys'] });
    },
  });

  const saveN8nConfigMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        n8nBaseUrl: normalizeNullable(n8nBaseUrl),
        n8nProcessPath: normalizeNullable(n8nProcessPath),
      };
      if (n8nInternalToken.trim().length > 0) {
        payload.n8nInternalToken = n8nInternalToken;
      }
      const { data } = await api.put('/owner/n8n-config', payload);
      return data;
    },
    onSuccess: () => {
      setToast('Saved n8n configuration');
      setN8nInternalToken('');
      queryClient.invalidateQueries({ queryKey: ['ownerN8nConfig'] });
    },
  });

  if (!isOwner) {
    return <p className="text-slate-400">Only owner accounts can access this page.</p>;
  }

  return (
    <section className="space-y-8 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Owner</p>
        <h1 className="text-3xl font-semibold text-white">System settings</h1>
        <p className="text-sm text-slate-400">
          Configure SMTP for notifications, Stripe keys for billing, and an owner sandbox tenant for unlimited testing.
        </p>
      </header>

      {toast && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {toast}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Email (SMTP)</h2>
              <p className="mt-1 text-sm text-slate-400">
                Contact form + new signup notifications are delivered to the notification email below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => testEmailMutation.mutate()}
              disabled={testEmailMutation.isPending || updateMutation.isPending}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {testEmailMutation.isPending ? 'Sending…' : 'Send test email'}
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="text-sm text-slate-200">
              Notification email
              <input
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <label className="text-sm text-slate-200">
              From
              <input
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                placeholder='UGC Studio <no-reply@yourdomain.com>'
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-200">
                SMTP host
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="text-sm text-slate-200">
                SMTP port
                <input
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
            </div>

            <label className="text-sm text-slate-200">
              SMTP user
              <input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="apikey / username"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <label className="text-sm text-slate-200">
              SMTP password {configQuery.data?.smtpPassSet ? <span className="text-xs text-emerald-400">(saved)</span> : null}
              <input
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={configQuery.data?.smtpPassSet ? '•••••••• (leave blank to keep)' : '••••••••'}
                type="password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Stripe</h2>
          <p className="mt-1 text-sm text-slate-400">
            Store keys and price IDs here so billing can be connected without redeploying.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="text-sm text-slate-200">
              Publishable key
              <input
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                placeholder="pk_live_..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <label className="text-sm text-slate-200">
              Secret key {configQuery.data?.stripeSecretKeySet ? <span className="text-xs text-emerald-400">(saved)</span> : null}
              <input
                value={stripeSecretKey}
                onChange={(e) => setStripeSecretKey(e.target.value)}
                placeholder={configQuery.data?.stripeSecretKeySet ? 'sk_live_... (leave blank to keep)' : 'sk_live_...'}
                type="password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <label className="text-sm text-slate-200">
              Webhook signing secret {configQuery.data?.stripeWebhookSecretSet ? <span className="text-xs text-emerald-400">(saved)</span> : null}
              <input
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                placeholder={configQuery.data?.stripeWebhookSecretSet ? 'whsec_... (leave blank to keep)' : 'whsec_...'}
                type="password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-slate-200">
                Starter price ID
                <input
                  value={stripePriceIdStarter}
                  onChange={(e) => setStripePriceIdStarter(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="text-sm text-slate-200">
                Growth price ID
                <input
                  value={stripePriceIdGrowth}
                  onChange={(e) => setStripePriceIdGrowth(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="text-sm text-slate-200">
                Scale price ID
                <input
                  value={stripePriceIdScale}
                  onChange={(e) => setStripePriceIdScale(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-slate-200">
                Starter annual price ID
                <input
                  value={stripePriceIdStarterAnnual}
                  onChange={(e) => setStripePriceIdStarterAnnual(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="text-sm text-slate-200">
                Growth annual price ID
                <input
                  value={stripePriceIdGrowthAnnual}
                  onChange={(e) => setStripePriceIdGrowthAnnual(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
              <label className="text-sm text-slate-200">
                Scale annual price ID
                <input
                  value={stripePriceIdScaleAnnual}
                  onChange={(e) => setStripePriceIdScaleAnnual(e.target.value)}
                  placeholder="price_..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => bootstrapStripeMutation.mutate()}
                disabled={bootstrapStripeMutation.isPending}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                {bootstrapStripeMutation.isPending ? 'Creating prices…' : 'Auto-create prices'}
              </button>
              <p className="text-xs text-slate-400">
                Creates starter/growth/scale monthly and annual prices in Stripe (test mode) and fills the IDs above.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Google OAuth</h2>
          <p className="mt-1 text-sm text-slate-400">
            Enable one-click Google login for users. Store the client ID and secret here.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="text-sm text-slate-200">
              Client ID
              <input
                value={googleOAuthClientId}
                onChange={(e) => setGoogleOAuthClientId(e.target.value)}
                placeholder="1234567890-abc.apps.googleusercontent.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="text-sm text-slate-200">
              Client secret {configQuery.data?.googleOAuthClientSecretSet ? <span className="text-xs text-emerald-400">(saved)</span> : null}
              <input
                value={googleOAuthClientSecret}
                onChange={(e) => setGoogleOAuthClientSecret(e.target.value)}
                placeholder={configQuery.data?.googleOAuthClientSecretSet ? '•••••••• (leave blank to keep)' : '••••••••'}
                type="password"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="text-sm text-slate-200">
              Redirect URI
              <input
                value={configQuery.data?.googleOAuthRedirectUri ?? ''}
                readOnly
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-slate-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Code Injection</h2>
          <p className="mt-1 text-sm text-slate-400">
            Inject trusted scripts (analytics, chat widgets, pixels). Only paste code you trust.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="text-sm text-slate-200">
              Head code
              <textarea
                value={customHeadCode}
                onChange={(e) => setCustomHeadCode(e.target.value)}
                placeholder="<script>/* analytics */</script>"
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="text-sm text-slate-200">
              Body start
              <textarea
                value={customBodyStart}
                onChange={(e) => setCustomBodyStart(e.target.value)}
                placeholder="<!-- chat widget -->"
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="text-sm text-slate-200">
              Body end
              <textarea
                value={customBodyEnd}
                onChange={(e) => setCustomBodyEnd(e.target.value)}
                placeholder="<!-- tracking pixels -->"
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
          </div>
        </section>
      </div>

      {/* API Keys Section */}
      <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        <h2 className="text-xl font-semibold text-white">Global API Keys</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure API keys for all users. These are encrypted and passed to the n8n workflow for video generation.
        </p>

        <div className="mt-6 space-y-4">
          {(apiKeysQuery.data?.providers ?? []).length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 mb-3">Configured Keys</p>
              <div className="space-y-2">
                {apiKeysQuery.data?.providers.map((providerInfo) => (
                  <div key={providerInfo.provider} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                    <div>
                      <span className="font-semibold text-white capitalize">{providerInfo.provider}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        •••• {providerInfo.lastFourChars ?? '••••'}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteApiKeyMutation.mutate(providerInfo.provider)}
                      disabled={deleteApiKeyMutation.isPending}
                      className="text-sm text-rose-400 hover:text-rose-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
            <select
              value={apiKeyProvider}
              onChange={(e) => setApiKeyProvider(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select provider...</option>
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="replicate">Replicate</option>
              <option value="anthropic">Anthropic</option>
              <option value="heygen">HeyGen</option>
              <option value="runway">Runway</option>
            </select>
            <input
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="API key"
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={() => saveApiKeyMutation.mutate()}
              disabled={!apiKeyProvider || !apiKeyValue || saveApiKeyMutation.isPending}
              className="rounded-2xl bg-indigo-500 px-6 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              Save Key
            </button>
          </div>
        </div>
      </section>

      {/* n8n Configuration Section */}
      <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        <h2 className="text-xl font-semibold text-white">n8n Workflow (Global)</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure the n8n instance used for all video generation across all users.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="text-sm text-slate-200">
            n8n Base URL
            <input
              type="url"
              value={n8nBaseUrl}
              onChange={(e) => setN8nBaseUrl(e.target.value)}
              placeholder="https://your-n8n.com"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <label className="text-sm text-slate-200">
            Webhook Path
            <input
              type="text"
              value={n8nProcessPath}
              onChange={(e) => setN8nProcessPath(e.target.value)}
              placeholder="/webhook/ugc/generate"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <label className="text-sm text-slate-200">
            Internal API Token {n8nConfigQuery.data?.n8nInternalTokenSet ? <span className="text-xs text-emerald-400">(saved)</span> : null}
            <input
              type="password"
              value={n8nInternalToken}
              onChange={(e) => setN8nInternalToken(e.target.value)}
              placeholder={n8nConfigQuery.data?.n8nInternalTokenSet ? '•••••••• (leave blank to keep)' : 'Secret token for n8n callback'}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <button
            onClick={() => saveN8nConfigMutation.mutate()}
            disabled={saveN8nConfigMutation.isPending}
            className="w-full rounded-2xl bg-indigo-500 px-6 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {saveN8nConfigMutation.isPending ? 'Saving...' : 'Save n8n Configuration'}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Owner sandbox</h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose a tenant you can impersonate for demos and enable unlimited videos while testing.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
              onClick={() => selectedSandboxTenant && impersonateMutation.mutate(selectedSandboxTenant.id)}
              disabled={!selectedSandboxTenant || impersonateMutation.isPending}
            >
              Open sandbox
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              onClick={() =>
                selectedSandboxTenant &&
                sandboxUnlimitedMutation.mutate({ tenantId: selectedSandboxTenant.id, unlimited: !sandboxUnlimited })
              }
              disabled={!selectedSandboxTenant || sandboxUnlimitedMutation.isPending}
            >
              {sandboxUnlimited ? 'Disable unlimited' : 'Enable unlimited'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-200">
            Sandbox tenant
            <select
              value={sandboxTenantId}
              onChange={(e) => setSandboxTenantId(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select a tenant…</option>
              {(tenantsQuery.data ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.status})
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Sandbox status</p>
            <p className="mt-2 text-sm text-white">
              {selectedSandboxTenant ? (
                <>
                  {selectedSandboxTenant.name} ·{' '}
                  <span className="text-slate-300">
                    {sandboxUnlimited ? 'Unlimited videos' : `${selectedSandboxTenant.plan.monthlyVideoLimit} videos/month`}
                  </span>
                </>
              ) : (
                'No sandbox selected'
              )}
            </p>
            {selectedSandboxTenant && (
              <p className="mt-1 text-xs text-slate-400">
                Used {selectedSandboxTenant.plan.videosUsedThisCycle} videos this cycle.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </section>
  );
};

export default OwnerSettingsPage;
