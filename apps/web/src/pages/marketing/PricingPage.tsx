import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { PLAN_DEFINITIONS } from '../../lib/plans';
import { formatSupportedLanguages } from '../../lib/languages';
import { pricingSubtitle } from '../../content/marketing';
import { useCmsSection } from '../../hooks/useCmsSection';
import { useOptionalAuth } from '../../providers/AuthProvider';

const baseCard = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

const Check = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  </span>
);

const PricingPage = () => {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const isAnnual = billingInterval === 'annual';
  const { data: pricingCms } = useCmsSection('pricing', { subtitle: pricingSubtitle });
  const auth = useOptionalAuth();
  const token = auth?.token;
  const tenantStatus = auth?.tenantStatus;
  const isOwner = auth?.isOwner ?? false;
  const tenant = auth?.tenant;
  const navigate = useNavigate();

  // Check if user has an active subscription
  const hasActiveSubscription = token && !isOwner && tenantStatus === 'active' && tenant?.planCode;

  // Handle plan selection - redirect to upgrade if already subscribed
  const handlePlanSelect = (planCode: string) => {
    if (hasActiveSubscription) {
      navigate('/settings?upgrade=1');
    } else {
      navigate(`/signup?plan=${planCode}${isAnnual ? '&interval=annual' : ''}`);
    }
  };
  const subtitle =
    typeof pricingCms.subtitle === 'string' && pricingCms.subtitle.trim().length > 0
      ? pricingCms.subtitle
      : pricingSubtitle;
  const plans = [
    { code: 'starter', name: 'Starter', popular: false, videosPerMonth: '10', videosSaved: 'Last 10', cta: 'Start Starter' },
    { code: 'growth', name: 'Growth', popular: true, videosPerMonth: '30', videosSaved: 'Last 20', cta: 'Start Growth' },
    { code: 'scale', name: 'Scale', popular: false, videosPerMonth: '100', videosSaved: 'Last 30', cta: 'Start Scale' },
  ] as const;

  const identicalRows = [
    '50+ languages',
    'TikTok / Reels / Shorts formats',
    'Voice profile + vibe controls',
    'Creator gender + age range',
    'Custom prompt support',
    'Batch generation',
    'Email support',
  ] as const;

  return (
    <div className="min-h-screen bg-white">
      <Seo
        title="Pricing"
        description="Predictable pricing for UGC volume. Pick a plan based on monthly output and how many recent videos you want saved."
        url={getSiteUrl('/pricing')}
      />

      <section className="mx-auto max-w-7xl px-6 pt-24 pb-12">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 mb-6">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
            Simple Pricing
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Predictable pricing for UGC volume</h1>
          <p className="mt-5 text-lg text-slate-600">
            {subtitle}
          </p>
          <div className="mt-8 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-sm">
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              className={`rounded-full px-5 py-2.5 font-semibold transition ${
                !isAnnual ? 'bg-[#2e90fa] text-white shadow-lg shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('annual')}
              className={`rounded-full px-5 py-2.5 font-semibold transition ${
                isAnnual ? 'bg-[#2e90fa] text-white shadow-lg shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual <span className="text-green-600 font-medium">(Save 17%)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid gap-8 md:grid-cols-3">
          {plans.map((plan) => {
            const info = PLAN_DEFINITIONS[plan.code];
            const priceUsd = isAnnual ? info.annualPriceUsd : info.priceUsd;
            return (
              <article
                key={plan.code}
                className={`relative flex flex-col rounded-2xl border p-8 ${
                  plan.popular
                    ? 'border-[#2e90fa] bg-white shadow-xl shadow-blue-500/10 scale-105'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg transition-all'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#2e90fa] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
                    Most Popular
                  </div>
                )}
                <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-5xl font-bold text-slate-900">${priceUsd}</span>
                  <span className="pb-1 text-sm text-slate-500">{isAnnual ? '/year' : '/month'}</span>
                </div>
                {isAnnual && (
                  <p className="mt-2 text-sm text-green-600 font-medium">
                    ${info.monthlyEquivalentUsd}/mo billed annually
                  </p>
                )}

                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="text-slate-600">Videos / month</span>
                    <span className="font-bold text-[#2e90fa] text-lg">{plan.videosPerMonth}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="text-slate-600">Videos Saved</span>
                    <span className="font-semibold text-slate-900">{plan.videosSaved}</span>
                  </div>
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {identicalRows.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-slate-600">
                      <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <button
                    onClick={() => handlePlanSelect(plan.code)}
                    className={`inline-flex w-full items-center justify-center rounded-full px-4 py-3.5 text-sm font-semibold transition ${
                      plan.popular
                        ? 'bg-[#2e90fa] text-white hover:bg-[#1a7ae8] shadow-lg shadow-blue-500/20'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                    }`}
                  >
                    {hasActiveSubscription ? 'Upgrade Plan' : plan.cta}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className={`${baseCard} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Features</th>
                  {plans.map((plan) => (
                    <th
                      key={plan.code}
                      className={`px-6 py-5 align-bottom ${plan.popular ? 'bg-blue-50/50' : ''}`}
                    >
                      {plan.popular && (
                        <div className="mb-3 inline-flex rounded-full bg-[#2e90fa] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                          Most Popular
                        </div>
                      )}
                      <div className="text-lg font-bold text-slate-900">{plan.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr>
                  <td className="px-6 py-4 font-semibold text-slate-900">Videos / month</td>
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-4 font-bold text-[#2e90fa] ${plan.popular ? 'bg-blue-50/50' : ''}`}>
                      {plan.videosPerMonth}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-6 py-4 font-semibold text-slate-900">Videos Saved</td>
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-4 ${plan.popular ? 'bg-blue-50/50' : ''}`}>
                      {plan.videosSaved}
                    </td>
                  ))}
                </tr>

                {identicalRows.map((label) => (
                  <tr key={label}>
                    <td className="px-6 py-4 font-semibold text-slate-900">{label}</td>
                    {plans.map((plan) => (
                      <td key={plan.code} className={`px-6 py-4 ${plan.popular ? 'bg-blue-50/50' : ''}`}>
                        <Check />
                      </td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <td className="px-6 py-6" />
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-6 ${plan.popular ? 'bg-blue-50/50' : ''}`}>
                      <button
                        onClick={() => handlePlanSelect(plan.code)}
                        className={`inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition ${
                          plan.popular
                            ? 'bg-[#2e90fa] text-white hover:bg-[#1a7ae8] shadow-lg shadow-blue-500/20'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {hasActiveSubscription ? 'Upgrade Plan' : plan.cta}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold text-slate-900">Pricing FAQ</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              { q: 'What counts as a video?', a: 'Each generated clip counts toward your monthly quota.' },
              { q: 'What does Videos Saved mean?', a: 'How many recent videos remain visible in your dashboard.' },
              { q: 'Can I upgrade/downgrade?', a: 'Yes, anytime. Changes take effect immediately.' },
              { q: 'Which languages are supported?', a: `We currently support: ${formatSupportedLanguages()}` },
            ].map((item) => (
              <article key={item.q} className={`${baseCard} p-6`}>
                <h3 className="text-base font-semibold text-slate-900">{item.q}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl bg-gradient-to-r from-[#2e90fa] to-blue-600 px-8 py-16 text-center">
            <h2 className="text-3xl font-bold text-white">Ready to start creating?</h2>
            <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
              Choose your plan and start generating UGC videos in minutes. Plans start at $69/month.
            </p>
            <div className="mt-8">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-[#2e90fa] shadow-lg transition hover:bg-blue-50"
              >
                Generate your first UGC video
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingPage;
