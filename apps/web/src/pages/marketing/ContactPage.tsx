import { useState } from 'react';
import Seo from '../../components/Seo';
import api from '../../lib/api';
import { contactDefaults } from '../../content/marketing';
import { useCmsSection } from '../../hooks/useCmsSection';
import { getSiteUrl } from '../../lib/urls';
import { formatSupportedLanguages } from '../../lib/languages';

const baseCard = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

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
      setSuccessMessage(typeof data?.message === 'string' ? data.message : 'Thanks! We will reply soon.');
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
    <div className="px-4 py-16 bg-white min-h-screen">
      <Seo
        title="Contact – UGC Studio"
        description="Questions about plans, languages, or output? Send us a message."
        url={getSiteUrl('/contact')}
      />

      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-blue-50 to-white px-6 py-16 shadow-lg md:px-12">
          <div className="relative text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Contact Us
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Get in Touch</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              Questions about plans, languages, or output? Send us a message.
            </p>
            <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">Typical reply: same day</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">Support</span>
              <span className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-green-700">Secure by default</span>
            </div>
          </div>
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className={baseCard + ' p-6'}>
              <h2 className="text-lg font-bold text-slate-900">What to include</h2>
              <p className="mt-2 text-sm text-slate-600">The more context you share, the faster we can help.</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {[
                  'Platform (TikTok, Reels, Shorts)',
                  'Language and style (voice + vibe)',
                  'Product and offer details',
                  'Any brand guidelines or required claims',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
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
              <h2 className="text-lg font-bold text-slate-900">Prefer email?</h2>
              <p className="mt-2 text-sm text-slate-600">
                Send details directly to{' '}
                <a href={`mailto:${targetEmail}`} className="font-semibold text-[#2e90fa] hover:underline">
                  {targetEmail}
                </a>
                .
              </p>
            </div>
          </div>

          <div className={baseCard + ' p-6'}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Send a message</h2>
                <p className="mt-1 text-sm text-slate-500">We usually reply within a few hours.</p>
              </div>
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                Secure form
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Full name</label>
                  <input
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#2e90fa] focus:outline-none focus:ring-1 focus:ring-[#2e90fa]"
                  />
                  {fieldErrors.name && <p className="mt-1 text-xs text-rose-500">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formState.email}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#2e90fa] focus:outline-none focus:ring-1 focus:ring-[#2e90fa]"
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-rose-500">{fieldErrors.email}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Company (optional)</label>
                <input
                  name="company"
                  value={formState.company}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#2e90fa] focus:outline-none focus:ring-1 focus:ring-[#2e90fa]"
                />
                {fieldErrors.company && <p className="mt-1 text-xs text-rose-500">{fieldErrors.company}</p>}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Message</label>
                <textarea
                  name="message"
                  value={formState.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#2e90fa] focus:outline-none focus:ring-1 focus:ring-[#2e90fa]"
                  placeholder="Tell us what you want to generate (platform, language, style)…"
                />
                {fieldErrors.message && <p className="mt-1 text-xs text-rose-500">{fieldErrors.message}</p>}
              </div>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full rounded-xl bg-[#2e90fa] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#1a7ae8] disabled:opacity-50"
              >
                {status === 'loading' ? 'Sending…' : 'Send message'}
              </button>
              {status === 'success' && (
                <p className="text-sm text-green-600 font-medium" role="status" aria-live="polite">
                  {successMessage || 'Thanks! We will reply soon.'}
                </p>
              )}
              {status === 'error' && (
                <p className="text-sm text-rose-500" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* FAQ */}
        <section className="mt-20">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
              FAQ
            </span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">Frequently asked questions</h2>
            <p className="mt-2 text-slate-600">Quick answers before you send a message.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
              <article key={item.q} className={baseCard + ' p-6'}>
                <h3 className="text-base font-semibold text-slate-900">{item.q}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ContactPage;
