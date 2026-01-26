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

const PrivacyPolicyPage = () => {
  const { data: legalCms } = useCmsSection('legal', { content: legalDefaults });
  const legal = (legalCms.content as LegalContent | undefined) ?? legalDefaults;
  const content = applyLegalTemplate(legal.privacyMarkdown, legal);

  return (
    <div className="bg-white min-h-screen px-6 pt-28 pb-20">
      <Seo
        title={`Privacy Policy – ${legal.company.name}`}
        description="Learn how we collect, use, and protect personal data when you use our Service."
        url={getSiteUrl('/privacy')}
      />

      <div className="mx-auto max-w-3xl">
        <header className="rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#2e90fa]">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-600">
            This policy explains how {legal.company.name} handles personal data. If you have questions, email{' '}
            <span className="font-semibold text-[#2e90fa]">{legal.company.contactEmail}</span>.
          </p>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;

