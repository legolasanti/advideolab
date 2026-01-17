import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';

const baseCard = 'rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur';

const Check = () => (
  <svg
    className="h-4 w-4 text-emerald-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ProductPage = () => {
  return (
    <div className="space-y-14 px-4 py-16">
      <Seo
        title="Platform – UGC Studio"
        description="From product image to platform-ready UGC. Choose language, platform, voice and vibe, then generate multiple UGC video variations."
        url={getSiteUrl('/product')}
      />

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/60 px-6 py-14 text-center backdrop-blur md:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.18),rgba(2,6,23,0))]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Platform</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white md:text-6xl">
            From product image to <span className="text-emerald-300">platform-ready UGC</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base text-slate-300">
            Upload one image, choose language, platform, voice and vibe, then generate multiple UGC video variations for TikTok, Reels, and Shorts.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/new-video"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Generate your first UGC video
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>

          <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-200">
            {['20+ languages', '1–5+ variations per run', 'TikTok / Reels / Shorts'].map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Controls grid */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold text-white">Everything you control</h2>
        <p className="mt-3 max-w-3xl text-slate-300">
          Keep it simple: one image in, multiple UGC variations out—tailored to platform and audience.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Upload a single image', desc: 'Drag & drop a product photo to start.' },
            { title: 'Choose language', desc: 'Generate scripts in 20+ languages.' },
            { title: 'Choose platform', desc: 'Optimized for TikTok, Reels, and Shorts.' },
            { title: 'Pick voice profile', desc: 'Match voice style to your brand and offer.' },
            { title: 'Pick vibe + creator persona (gender/age range)', desc: 'Define the on-camera feel and persona.' },
            { title: 'Add CTA + custom prompt', desc: 'Set the call-to-action and add your own instructions.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-6`}>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold text-white">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { title: 'Upload one image', desc: 'Start with a single product photo.' },
            { title: 'Set the creative controls', desc: 'Pick language, platform, voice, vibe, creator persona, and CTA.' },
            { title: 'Generate variations', desc: 'Choose how many videos to render and download when ready.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-6`}>
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <Check />
                <span className="font-semibold text-white">{item.title}</span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section className="mx-auto max-w-6xl">
        <div className={`${baseCard} flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between`}>
          <div>
            <h2 className="text-2xl font-semibold text-white">Ready to generate?</h2>
            <p className="mt-2 text-sm text-slate-300">Upload one image and create your first batch of UGC videos.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/new-video"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Generate your first UGC video
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProductPage;

