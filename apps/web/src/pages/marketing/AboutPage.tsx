import { aboutContent as aboutFallback } from '../../content/marketing';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { useCmsSection } from '../../hooks/useCmsSection';

const AboutPage = () => {
  const { data: aboutCms } = useCmsSection('about', { content: aboutFallback });
  const about = { ...aboutFallback, ...(aboutCms.content as typeof aboutFallback | undefined) };

  return (
    <div className="space-y-16 px-4 py-16 bg-white min-h-screen">
      <Seo
        title="About – UGC Studio"
        description="Why we built UGC Studio and the story behind the product."
        url={getSiteUrl('/about')}
      />

      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          About Us
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Why we built UGC Studio</h1>
        <p className="mt-6 text-lg text-slate-600">{about.mission}</p>
      </section>

      {/* Story */}
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xl font-bold text-slate-900">From agency pain → product</p>
        <p className="mt-4 text-slate-600 leading-relaxed">{about.founder}</p>
        <p className="mt-4 text-slate-600 leading-relaxed">{about.focus}</p>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold text-slate-900 mb-8">Our Values</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {about.values.map((value, idx) => (
            <article key={value} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-blue-50 to-white p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#2e90fa] text-white font-bold">
                {idx + 1}
              </div>
              <p className="text-lg font-semibold text-slate-900">{value}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-bold text-slate-900 mb-8">Timeline</h2>
        <div className="space-y-4">
          {about.timeline.map((entry) => (
            <article key={entry.year} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-[#2e90fa]">
                  {entry.year}
                </span>
                <p className="text-slate-600">{entry.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl">
        <div className="rounded-3xl bg-gradient-to-r from-[#2e90fa] to-blue-600 px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-white">Want to learn more?</h2>
          <p className="mt-2 text-blue-100">Get in touch with our team or explore our platform.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#2e90fa] shadow-lg transition hover:bg-blue-50"
            >
              Contact Us
            </a>
            <a
              href="/product"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Explore Platform
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
