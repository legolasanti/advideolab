import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useCmsSection } from '../../hooks/useCmsSection';
import { showcaseExamples } from '../../content/marketing';
import { getSiteUrl } from '../../lib/urls';

const baseCard = 'rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur';

type ShowcaseVideo = {
  title: string;
  description: string;
  videoUrl?: string;
};

const placeholderCards = [
  { title: 'Example 01 — TikTok — 0:18' },
  { title: 'Example 02 — Reels — 0:22' },
  { title: 'Example 03 — Shorts — 0:15' },
  { title: 'Example 04 — TikTok — 0:19' },
  { title: 'Example 05 — Reels — 0:17' },
  { title: 'Example 06 — Shorts — 0:20' },
] as const;

const ExamplesPage = () => {
  const { data: showcaseCms } = useCmsSection('showcase', { videos: showcaseExamples });
  const cmsVideos = Array.isArray(showcaseCms.videos) ? (showcaseCms.videos as ShowcaseVideo[]) : null;
  const videos = cmsVideos && cmsVideos.length > 0 ? cmsVideos : showcaseExamples;

  const realVideos = videos.filter((item) => Boolean(item.videoUrl?.trim())).slice(0, 6);
  const showPlaceholders = realVideos.length === 0;

  return (
    <div className="space-y-14 px-4 py-16">
      <Seo
        title="Examples – UGC Studio"
        description="Example UGC videos you can generate from a single image."
        url={getSiteUrl('/examples')}
      />

      {/* Hero */}
      <section className="mx-auto max-w-5xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Examples</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white md:text-6xl">
          Example UGC videos you can generate
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
          See how a single image turns into multiple platform-ready UGC variations across languages and styles.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
      </section>

      {/* What you're seeing */}
      <section className="mx-auto max-w-5xl">
        <div className={`${baseCard} p-8 md:p-10`}>
          <h2 className="text-2xl font-semibold text-white">What you’re seeing</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-200">
            {[
              'Short-form UGC structure (hook → benefit → CTA)',
              'Platform-safe formatting',
              'Multiple variations per input',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
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
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(showPlaceholders ? placeholderCards : realVideos).map((item, index) => (
            <article key={showPlaceholders ? item.title : (realVideos[index]?.title ?? index)} className={baseCard}>
              <div className="overflow-hidden rounded-3xl p-5">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                  {showPlaceholders ? (
                    <div className="relative aspect-[9/16] w-full">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.12),rgba(2,6,23,0.7))]" />
                      <div
                        className="absolute inset-0 opacity-60"
                        style={{
                          backgroundImage:
                            'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)',
                          backgroundSize: '18px 18px',
                        }}
                        aria-hidden="true"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[9/16] w-full">
                      <iframe
                        src={realVideos[index]!.videoUrl}
                        title={realVideos[index]!.title}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white">
                    {showPlaceholders ? item.title : realVideos[index]!.title}
                  </h3>
                  {!showPlaceholders && (
                    <p className="mt-2 text-sm text-slate-300">{realVideos[index]!.description}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {showPlaceholders && (
          <p className="mt-6 text-center text-sm text-slate-400">
            Examples are placeholders until you upload your own image.
          </p>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            to="/new-video"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Generate your first UGC video
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ExamplesPage;

