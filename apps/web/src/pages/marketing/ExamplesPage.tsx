import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { useCmsSection } from '../../hooks/useCmsSection';
import { showcaseExamples } from '../../content/marketing';
import { getSiteUrl } from '../../lib/urls';

const baseCard = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

type ShowcaseVideo = {
  title: string;
  description: string;
  videoUrl?: string;
};

const isDirectVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url);

const buildSafeEmbedUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set('autoplay', '0');
    url.searchParams.set('muted', '1');
    url.searchParams.set('playsinline', '1');
    return url.toString();
  } catch {
    return rawUrl;
  }
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
    <div className="space-y-16 px-4 py-16 bg-white min-h-screen">
      <Seo
        title="Examples – UGC Studio"
        description="Example UGC videos you can generate from a single image."
        url={getSiteUrl('/examples')}
      />

      {/* Hero */}
      <section className="mx-auto max-w-5xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Examples
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
          Example UGC videos you can generate
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          See how a single image turns into multiple platform-ready UGC variations across languages and styles.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/new-video"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2e90fa] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#1a7ae8]"
          >
            Generate your first UGC video
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View pricing
          </Link>
        </div>
      </section>

      {/* What you're seeing */}
      <section className="mx-auto max-w-5xl">
        <div className={`${baseCard} p-8 md:p-10`}>
          <h2 className="text-2xl font-bold text-slate-900">What you're seeing</h2>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            {[
              'Short-form UGC structure (hook → benefit → CTA)',
              'Platform-safe formatting',
              'Multiple variations per input',
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
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(showPlaceholders ? placeholderCards : realVideos).map((item, index) => (
            <article key={showPlaceholders ? item.title : (realVideos[index]?.title ?? index)} className={baseCard}>
              <div className="overflow-hidden rounded-2xl p-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {showPlaceholders ? (
                    <div className="relative aspect-[9/16] w-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-purple-100" />
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage:
                            'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.3) 1px, transparent 0)',
                          backgroundSize: '18px 18px',
                        }}
                        aria-hidden="true"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-300 bg-white text-[#2e90fa] shadow-lg">
                          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[9/16] w-full">
                      {isDirectVideoUrl(realVideos[index]!.videoUrl!) ? (
                        <video
                          src={realVideos[index]!.videoUrl}
                          className="h-full w-full object-cover"
                          controls
                          preload="metadata"
                          playsInline
                        />
                      ) : (
                        <iframe
                          src={buildSafeEmbedUrl(realVideos[index]!.videoUrl!)}
                          title={realVideos[index]!.title}
                          className="h-full w-full"
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {showPlaceholders ? item.title : realVideos[index]!.title}
                  </h3>
                  {!showPlaceholders && (
                    <p className="mt-2 text-sm text-slate-600">{realVideos[index]!.description}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {showPlaceholders && (
          <p className="mt-8 text-center text-sm text-slate-500">
            Examples are placeholders until you upload your own image.
          </p>
        )}

        <div className="mt-10 flex justify-center">
          <Link
            to="/new-video"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2e90fa] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#1a7ae8]"
          >
            Generate your first UGC video
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ExamplesPage;
