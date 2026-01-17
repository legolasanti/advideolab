import { useState } from 'react';
import Seo from '../../components/Seo';
import api from '../../lib/api';
import { contactDefaults } from '../../content/marketing';
import { useCmsSection } from '../../hooks/useCmsSection';
import { getSiteUrl } from '../../lib/urls';
import { formatSupportedLanguages } from '../../lib/languages';

const baseCard = 'rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur';

const ContactPage = () => {
  const [formState, setFormState] = useState({ name: '', email: '', company: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');

  const { data: contactCms } = useCmsSection('contact', { settings: contactDefaults });
  const targetEmail =
    (contactCms.settings &&
    typeof contactCms.settings === 'object' &&
    contactCms.settings !== null &&
    'targetEmail' in contactCms.settings &&
    typeof (contactCms.settings as any).targetEmail === 'string'
      ? (contactCms.settings as any).targetEmail
      : contactDefaults.targetEmail) || contactDefaults.targetEmail;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormState((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError(null);
    setSuccessMessage('');
    setFieldErrors({});
    try {
      const { data } = await api.post('/public/contact', { ...formState, source: '/contact' });
      setStatus('success');
      setFormState({ name: '', email: '', company: '', message: '' });
      setSuccessMessage(typeof data?.message === 'string' ? data.message : 'Thanks! We’ll reply soon.');
    } catch (err: any) {
      setStatus('error');
      const resp = err?.response?.data;
      if (resp?.issues && Array.isArray(resp.issues)) {
        const issues: Record<string, string> = {};
        resp.issues.forEach((issue: any) => {
          if (issue?.path?.[0] && issue?.message) issues[issue.path[0]] = issue.message;
        });
        setFieldErrors(issues);
        setError('Please fix the highlighted fields.');
      } else {
        setError(resp?.error ?? 'Something went wrong. Please try again later.');
      }
    }
  };

  return (
    <div className="px-4 py-16">
      <Seo
        title="Contact – UGC Studio"
        description="Questions about plans, languages, or output? Send us a message."
        url={getSiteUrl('/contact')}
      />

      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/60 px-6 py-14 backdrop-blur md:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.18),rgba(2,6,23,0))]" />
          <div className="relative text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Contact</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white md:text-6xl">Contact</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
              Questions about plans, languages, or output? Send us a message.
            </p>
            <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Typical reply: same day</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Support</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Secure by default</span>
            </div>
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className={baseCard + ' p-6'}>
              <h2 className="text-lg font-semibold text-white">What to include</h2>
              <p className="mt-2 text-sm text-slate-300">The more context you share, the faster we can help.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                {[
                  'Platform (TikTok, Reels, Shorts)',
                  'Language and style (voice + vibe)',
                  'Product and offer details',
                  'Any brand guidelines or required claims',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={baseCard + ' p-6'}>
              <h2 className="text-lg font-semibold text-white">Prefer email?</h2>
              <p className="mt-2 text-sm text-slate-300">
                Send details directly to{' '}
                <a href={`mailto:${targetEmail}`} className="font-semibold text-emerald-200 hover:text-emerald-100">
                  {targetEmail}
                </a>
                .
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Send a message</h2>
                <p className="mt-1 text-sm text-slate-400">We usually reply within a few hours.</p>
              </div>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Secure form
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-200">Full name</label>
                  <input
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  {fieldErrors.name && <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-200">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formState.email}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-rose-400">{fieldErrors.email}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-200">Company (optional)</label>
                <input
                  name="company"
                  value={formState.company}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                {fieldErrors.company && <p className="mt-1 text-xs text-rose-400">{fieldErrors.company}</p>}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-200">Message</label>
                <textarea
                  name="message"
                  value={formState.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder="Tell us what you want to generate (platform, language, style)…"
                />
                {fieldErrors.message && <p className="mt-1 text-xs text-rose-400">{fieldErrors.message}</p>}
              </div>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
              >
                {status === 'loading' ? 'Sending…' : 'Send message'}
              </button>
              {status === 'success' && (
                <p className="text-sm text-emerald-200" role="status" aria-live="polite">
                  {successMessage || 'Thanks! We’ll reply soon.'}
                </p>
              )}
              {status === 'error' && (
                <p className="text-sm text-rose-400" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>

        <section className="mt-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Frequently asked questions</h2>
            <p className="mt-2 text-sm text-slate-300">Quick answers before you send a message.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                q: 'How long does it take?',
                a: 'Typically minutes, depending on queue and batch size.',
              },
              {
                q: 'Which platforms are supported?',
                a: 'TikTok, Instagram Reels, YouTube Shorts.',
              },
              {
                q: 'Which languages are supported?',
                a: `We currently support: ${formatSupportedLanguages()}.`,
              },
            ].map((item) => (
              <article key={item.q} className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur">
                <h3 className="text-base font-semibold text-white">{item.q}</h3>
                <p className="mt-2 text-sm text-slate-300">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ContactPage;

