import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { useCmsSection } from '../../hooks/useCmsSection';
import { showcaseExamples } from '../../content/marketing';

const baseCard =
  'rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur';

const IconUpload = () => (
  <svg
    className="h-5 w-5 text-emerald-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconSliders = () => (
  <svg
    className="h-5 w-5 text-emerald-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const IconSparkles = () => (
  <svg
    className="h-5 w-5 text-emerald-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    <path d="M19 3l.7 2.1L22 6l-2.3.9L19 9l-.7-2.1L16 6l2.3-.9L19 3z" />
  </svg>
);

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

type ShowcaseVideo = {
  title: string;
  description: string;
  videoUrl?: string;
};

const LandingPage = () => {
  const { data: showcaseCms } = useCmsSection('showcase', { videos: showcaseExamples });
  const cmsVideos = Array.isArray(showcaseCms.videos) ? (showcaseCms.videos as ShowcaseVideo[]) : null;
  const videos = cmsVideos && cmsVideos.length > 0 ? cmsVideos : showcaseExamples;

  const examples: Array<ShowcaseVideo & { key: string }> = videos
    .filter((item) => Boolean(item.videoUrl?.trim()))
    .slice(0, 6)
    .map((item) => ({ ...item, key: item.title }));

  while (examples.length < 6) {
    const index = examples.length + 1;
    examples.push({ key: `placeholder-${index}`, title: `Example #${index}`, description: 'Placeholder' });
  }

  return (
    <div className="pb-20">
      <Seo
        title="UGC Video Generator"
        description="Create high-converting UGC videos from a single image. Upload one photo, choose language & platform, and generate TikTok, Reels & Shorts-ready videos in minutes."
        url={getSiteUrl('/')}
      />

      {/* 1) HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.18),rgba(2,6,23,0))]" />
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-14">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
                Create High-Converting UGC Videos from a Single Image
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-slate-300">
                Upload one photo, choose language &amp; platform, and generate TikTok, Reels &amp; Shorts-ready UGC videos in minutes. No filming. No editing.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/new-video"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  Generate your first UGC video
                </Link>
                <a
                  href="#examples"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  See example videos
                </a>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                {['20+ languages', 'Batch variations per image', 'Platform-ready formats'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={baseCard}>
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold text-white">Product Preview</p>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  9:16
                </span>
              </div>
              <div className="p-5">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                  <div className="aspect-[9/16] w-full">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.18),rgba(2,6,23,0.6))]" />
                    <div
                      className="absolute inset-0 opacity-60"
                      style={{
                        backgroundImage:
                          'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)',
                        backgroundSize: '18px 18px',
                      }}
                      aria-hidden="true"
                    />
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-white/[0.04] to-transparent" aria-hidden="true" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {['Language', 'Platform', 'Voice', 'Vibe', 'CTA'].map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2) HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="text-3xl font-semibold text-white">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Upload a product image',
              description: 'Drag & drop a single photo.',
              icon: <IconUpload />,
            },
            {
              title: 'Customize the voice & vibe',
              description: 'Pick language, platform, voice profile, vibe, creator gender, age range, and CTA.',
              icon: <IconSliders />,
            },
            {
              title: 'Generate multiple videos',
              description: 'Choose how many variations to render and download when ready.',
              icon: <IconSparkles />,
            },
          ].map((step) => (
            <article key={step.title} className={`${baseCard} p-6`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40">
                {step.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 3) WHAT YOU CAN GENERATE */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-3xl font-semibold text-white">What you can generate</h2>
            <p className="mt-3 text-base text-slate-300">
              Short-form UGC videos designed for social performance.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              {[
                'Talking-head UGC style videos',
                '20+ languages (including US & UK English)',
                'TikTok / Reels / Shorts formats',
                'Multiple hooks & CTAs per image',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    <Check />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: 'Example #1', duration: '0:18', platform: 'TikTok' },
              { title: 'Example #2', duration: '0:22', platform: 'Reels' },
              { title: 'Example #3', duration: '0:15', platform: 'Shorts' },
              { title: 'Example #4', duration: '0:19', platform: 'TikTok' },
            ].map((card) => (
              <article key={card.title} className={`${baseCard} p-4`}>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                  <div className="aspect-[9/16] w-full">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.12),rgba(2,6,23,0.65))]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{card.title}</p>
                  <span className="text-xs text-slate-400">{card.duration}</span>
                </div>
                <div className="mt-2">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    {card.platform}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4) FULL CREATIVE CONTROL */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="text-3xl font-semibold text-white">Full Creative Control — Without the Work</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Language', description: 'Generate in 20+ languages.' },
            { title: 'Platform', description: 'Optimized for TikTok, Reels, Shorts.' },
            { title: 'Vibe', description: 'Choose the tone (e.g., Trusted guide, Energetic, Calm).' },
            { title: 'Voice profile', description: 'Pick voice style to match your brand.' },
            { title: 'Creator gender', description: 'Male / Female options.' },
            { title: 'Age range', description: 'Select the on-camera persona age.' },
            { title: 'CTA', description: 'Set the call-to-action.' },
            { title: 'Custom prompt', description: 'Add your own instructions.' },
            { title: 'Output batching', description: 'Choose 1–5+ variations per run.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-5`}>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 5) USE CASES */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="text-3xl font-semibold text-white">Built for people who ship creatives fast</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'E-commerce brands', description: 'Launch new product ads without filming.' },
            { title: 'Performance marketers', description: 'Test angles & hooks quickly.' },
            { title: 'Agencies', description: 'Deliver more variations per client.' },
            { title: 'Creators', description: 'Generate consistent UGC output on demand.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-6`}>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 6) EXAMPLES */}
      <section id="examples" className="mx-auto max-w-7xl px-6 py-14 scroll-mt-24">
        <h2 className="text-3xl font-semibold text-white">Example UGC Videos</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map((item, idx) => (
            <article key={item.key} className={`${baseCard} p-4`}>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                {item.videoUrl ? (
                  <div className="aspect-[9/16] w-full">
                    <iframe
                      src={item.videoUrl}
                      title={item.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="relative aspect-[9/16] w-full">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.12),rgba(2,6,23,0.7))]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{item.title || `Example #${idx + 1}`}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8">
          <Link
            to="/new-video"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Generate your first UGC video
          </Link>
        </div>
      </section>

      {/* 7) PRICING TEASER */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className={`${baseCard} p-8 md:p-10`}>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold text-white">Plans built for how much you create</h2>
              <p className="mt-3 text-base text-slate-300">
                Choose a plan based on monthly output. Upgrade anytime.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
                {[
                  'Starter: saves last 10 videos',
                  'Growth: saves last 20 videos',
                  'Scale: saves last 30 videos',
                ].map((hint) => (
                  <span key={hint} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                    {hint}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 8) FAQ */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="text-3xl font-semibold text-white">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            { q: 'What do I need to start?', a: 'One product image is enough.' },
            { q: 'How long does generation take?', a: 'Typically minutes, depending on queue and batch size.' },
            { q: 'Can I add my own prompt?', a: 'Yes, you can provide custom instructions.' },
            { q: 'Which platforms are supported?', a: 'TikTok, Instagram Reels, YouTube Shorts.' },
            { q: 'Do you support multiple languages?', a: 'Yes, 20+ languages including US/UK English.' },
            {
              q: 'What does ‘Videos Saved’ mean?',
              a: 'Your plan determines how many recent videos remain visible in your dashboard.',
            },
          ].map((item) => (
            <article key={item.q} className={`${baseCard} p-6`}>
              <h3 className="text-base font-semibold text-white">{item.q}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 9) PRIVACY / SIMPLE TRUST */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {['Your uploads are private.', 'Commercial use allowed.', 'No editing timeline — just generate and ship.'].map(
            (statement) => (
              <div key={statement} className={`${baseCard} p-6 text-sm text-slate-200`}>
                {statement}
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
