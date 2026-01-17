import Seo from '../../components/Seo';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { useCmsSection } from '../../hooks/useCmsSection';
import { legalDefaults } from '../../content/marketing';
import { getSiteUrl } from '../../lib/urls';

type LegalContent = typeof legalDefaults;

const applyLegalTemplate = (markdown: string, legal: LegalContent) => {
  const tokens: Record<string, string> = {
    companyName: legal.company.name,
    companyCountry: legal.company.country,
    companyCity: legal.company.city,
    companyAddress: legal.company.address,
    contactEmail: legal.company.contactEmail,
    lastUpdated: legal.lastUpdated,
  };

  return markdown.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => tokens[token] ?? `{{${token}}}`);
};

const TermsPage = () => {
  const { data: legalCms } = useCmsSection('legal', { content: legalDefaults });
  const legal = (legalCms.content as LegalContent | undefined) ?? legalDefaults;
  const content = applyLegalTemplate(legal.termsMarkdown, legal);

  return (
    <div className="bg-slate-950 min-h-screen px-6 pt-28 pb-20">
      <Seo
        title={`Terms of Service – ${legal.company.name}`}
        description="Terms and conditions for using our Service."
        url={getSiteUrl('/terms')}
      />

      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] border border-white/10 bg-slate-900/60 p-8 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-300">
            These terms govern your access to and use of the Service provided by {legal.company.name}.
          </p>
        </header>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/40 p-8 backdrop-blur">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;

