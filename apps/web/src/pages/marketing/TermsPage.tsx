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
    <div className="bg-white min-h-screen px-6 pt-28 pb-20">
      <Seo
        title={`Terms of Service – ${legal.company.name}`}
        description="Terms and conditions for using our Service."
        url={getSiteUrl('/terms')}
      />

      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#2e90fa]">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-slate-600">
            These terms govern your access to and use of the Service provided by {legal.company.name}.
          </p>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;

