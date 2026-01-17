import { aboutContent as aboutFallback } from '../../content/marketing';
import Seo from '../../components/Seo';
import { getSiteUrl } from '../../lib/urls';
import { useCmsSection } from '../../hooks/useCmsSection';

const AboutPage = () => {
  const { data: aboutCms } = useCmsSection('about', { content: aboutFallback });
  const about = { ...aboutFallback, ...(aboutCms.content as typeof aboutFallback | undefined) };

  return (
    <div className="space-y-16 px-4 py-16">
      <Seo
        title="About – UGC Studio"
        description="Why we built UGC Studio and the story behind the product."
        url={getSiteUrl('/about')}
      />
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-500">About</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Why we built UGC Studio</h1>
        <p className="mt-4 text-slate-300">{about.mission}</p>
      </section>
      <section className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-left backdrop-blur">
        <p className="text-lg font-semibold text-white">From agency pain → product</p>
        <p className="mt-4 text-slate-300">{about.founder}</p>
        <p className="mt-3 text-slate-300">{about.focus}</p>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {about.values.map((value) => (
          <article key={value} className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Value</p>
            <p className="mt-3 text-xl font-semibold text-white">{value}</p>
          </article>
        ))}
      </section>
      <section className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-semibold text-white">Timeline</h2>
        <div className="mt-6 space-y-4">
          {about.timeline.map((entry) => (
            <article key={entry.year} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{entry.year}</p>
              <p className="text-sm text-slate-300">{entry.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
