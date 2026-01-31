import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { productSections as productSectionsFallback } from '../../content/marketing';
import { useCmsSection } from '../../hooks/useCmsSection';

const baseCard = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

type ProductSection = {
  title: string;
  description: string;
  image?: string;
};

const ProductPage = () => {
  const { data: productCms } = useCmsSection('product', { sections: productSectionsFallback });
  const cmsSections = Array.isArray(productCms.sections)
    ? (productCms.sections as ProductSection[])
    : productSectionsFallback;

  return (
    <div className="space-y-16 px-4 py-16 bg-white min-h-screen">
      <Seo
        title="Platform – UGC Studio"
        description="From product image to platform-ready UGC. Choose language, platform, voice and vibe, then generate multiple UGC video variations."
        url={getSiteUrl('/product')}
      />

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-blue-50 to-white px-6 py-16 text-center shadow-lg md:px-12">
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            Platform
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
            From product image to <span className="text-[#2e90fa]">platform-ready UGC</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-600">
            Upload one image, choose language, platform, voice and vibe, then generate multiple UGC video variations for TikTok, Reels, and Shorts.
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

          <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600">
            {['50+ languages', '1–5+ variations per run', 'TikTok / Reels / Shorts'].map((chip) => (
              <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Controls grid */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900">Everything you control</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Keep it simple: one image in, multiple UGC variations out—tailored to platform and audience.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Upload a single image', desc: 'Drag & drop a product photo to start.' },
            { title: 'Choose language', desc: 'Generate scripts in 50+ languages.' },
            { title: 'Choose platform', desc: 'Optimized for TikTok, Reels, and Shorts.' },
            { title: 'Pick voice profile', desc: 'Match voice style to your brand and offer.' },
            { title: 'Pick vibe + creator persona', desc: 'Define the on-camera feel and persona.' },
            { title: 'Add CTA + custom prompt', desc: 'Set the call-to-action and add your own instructions.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-6 hover:shadow-md transition-shadow`}>
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { step: 1, title: 'Upload one image', desc: 'Start with a single product photo.' },
            { step: 2, title: 'Set the creative controls', desc: 'Pick language, platform, voice, vibe, creator persona, and CTA.' },
            { step: 3, title: 'Generate variations', desc: 'Choose how many videos to render and download when ready.' },
          ].map((item) => (
            <article key={item.title} className={`${baseCard} p-6`}>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2e90fa] text-sm font-bold text-white">
                  {item.step}
                </span>
                <span className="font-semibold text-slate-900">{item.title}</span>
              </div>
              <p className="mt-4 text-sm text-slate-600">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Product highlights */}
      {cmsSections.length > 0 && (
        <section className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900">Product highlights</h2>
          <p className="mt-3 max-w-3xl text-slate-600">
            Configure these sections in Owner → CMS Manager → Product page.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {cmsSections.map((section) => (
              <article key={section.title} className={`${baseCard} p-6`}>
                {section.image ? (
                  <img src={section.image} alt={section.title} className="mb-4 h-40 w-full rounded-xl object-cover" />
                ) : null}
                <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{section.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* CTA strip */}
      <section className="mx-auto max-w-6xl">
        <div className="rounded-3xl bg-gradient-to-r from-[#2e90fa] to-blue-600 px-8 py-12 md:flex md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Ready to generate?</h2>
            <p className="mt-2 text-blue-100">Upload one image and create your first batch of UGC videos.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 md:mt-0">
            <Link
              to="/new-video"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#2e90fa] shadow-lg transition hover:bg-blue-50"
            >
              Generate your first UGC video
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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
