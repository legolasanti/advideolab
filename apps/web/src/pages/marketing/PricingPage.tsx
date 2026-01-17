import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { PLAN_DEFINITIONS } from '../../lib/plans';
import { formatSupportedLanguages } from '../../lib/languages';

const baseCard = 'rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur';

const Check = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  </span>
);

const PricingPage = () => {
  const plans = [
    { code: 'starter', name: 'Starter', popular: false, videosPerMonth: '10', videosSaved: 'Last 10', cta: 'Start Starter' },
    { code: 'growth', name: 'Growth', popular: true, videosPerMonth: '30', videosSaved: 'Last 20', cta: 'Start Growth' },
    { code: 'scale', name: 'Scale', popular: false, videosPerMonth: '100', videosSaved: 'Last 30', cta: 'Start Scale' },
  ] as const;

  const identicalRows = [
    '20+ languages',
    'TikTok / Reels / Shorts formats',
    'Voice profile + vibe controls',
    'Creator gender + age range',
    'Custom prompt support',
    'Batch generation',
    'Email support',
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950">
      <Seo
        title="Pricing"
        description="Predictable pricing for UGC volume. Pick a plan based on monthly output and how many recent videos you want saved."
        url={getSiteUrl('/pricing')}
      />

      <section className="mx-auto max-w-7xl px-6 pt-24 pb-12">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">Predictable pricing for UGC volume</h1>
          <p className="mt-5 text-lg text-slate-300">
            Pick a plan based on monthly output and how many recent videos you want saved.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const priceUsd = PLAN_DEFINITIONS[plan.code].priceUsd;
            return (
              <article
                key={plan.code}
                className={`relative flex flex-col rounded-3xl border p-7 backdrop-blur ${
                  plan.popular
                    ? 'border-emerald-400/40 bg-slate-900/75 shadow-2xl shadow-emerald-500/10'
                    : 'border-white/10 bg-slate-900/45'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-4 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">
                    Most Popular
                  </div>
                )}
                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>

                <div className="mt-5 flex items-end gap-2">
                  <span className="text-5xl font-bold text-white">${priceUsd}</span>
                  <span className="pb-1 text-sm text-slate-400">/month</span>
                </div>

                <div className="mt-6 space-y-2 text-sm text-slate-200">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <span className="text-slate-300">Videos / month</span>
                    <span className="font-semibold text-white">{plan.videosPerMonth}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <span className="text-slate-300">Videos Saved</span>
                    <span className="font-semibold text-white">{plan.videosSaved}</span>
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    to={`/signup?plan=${plan.code}`}
                    className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      plan.popular
                        ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                        : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className={baseCard}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-6 py-5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"> </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.code}
                      className={`px-6 py-5 align-bottom ${plan.popular ? 'bg-emerald-500/10' : ''}`}
                    >
                      {plan.popular && (
                        <div className="mb-3 inline-flex rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">
                          Most Popular
                        </div>
                      )}
                      <div className="text-lg font-semibold text-white">{plan.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10 text-slate-200">
                <tr>
                  <td className="px-6 py-4 font-semibold text-white">Videos / month</td>
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-4 ${plan.popular ? 'bg-emerald-500/10' : ''}`}>
                      {plan.videosPerMonth}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-6 py-4 font-semibold text-white">Videos Saved</td>
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-4 ${plan.popular ? 'bg-emerald-500/10' : ''}`}>
                      {plan.videosSaved}
                    </td>
                  ))}
                </tr>

                {identicalRows.map((label) => (
                  <tr key={label}>
                    <td className="px-6 py-4 font-semibold text-white">{label}</td>
                    {plans.map((plan) => (
                      <td key={plan.code} className={`px-6 py-4 ${plan.popular ? 'bg-emerald-500/10' : ''}`}>
                        <Check />
                      </td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <td className="px-6 py-6" />
                  {plans.map((plan) => (
                    <td key={plan.code} className={`px-6 py-6 ${plan.popular ? 'bg-emerald-500/10' : ''}`}>
                      <Link
                        to={`/signup?plan=${plan.code}`}
                        className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                          plan.popular
                            ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        {plan.cta}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold text-white">Pricing FAQ</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { q: 'What counts as a video?', a: 'Each generated clip counts toward your monthly quota.' },
              { q: 'What does Videos Saved mean?', a: 'How many recent videos remain visible in your dashboard.' },
              { q: 'Can I upgrade/downgrade?', a: 'Yes, anytime.' },
              { q: 'Which languages are supported?', a: `We currently support: ${formatSupportedLanguages()}` },
            ].map((item) => (
              <article key={item.q} className={`${baseCard} p-6`}>
                <h3 className="text-base font-semibold text-white">{item.q}</h3>
                <p className="mt-2 text-sm text-slate-300">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingPage;
