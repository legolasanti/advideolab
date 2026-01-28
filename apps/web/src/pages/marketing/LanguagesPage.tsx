import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/Seo';
import { LANGUAGES } from '../../lib/languages';
import { getSiteUrl } from '../../lib/urls';

const regionConfigs = [
  {
    id: 'english',
    title: 'English',
    icon: '🌍',
    codes: ['en-US', 'en-GB'],
  },
  {
    id: 'europe',
    title: 'Europe',
    icon: '🇪🇺',
    codes: [
      'es-ES', 'pt-PT', 'fr-FR', 'de-DE', 'it-IT', 'nl-NL',
      'sv-SE', 'da-DK', 'fi-FI', 'no-NO', 'is-IS', 'pl-PL',
      'cs-CZ', 'sk-SK', 'hu-HU', 'ro-RO', 'bg-BG', 'el-GR',
      'ru-RU', 'uk-UA', 'tr-TR',
    ],
  },
  {
    id: 'americas',
    title: 'Americas',
    icon: '🌎',
    codes: ['pt-BR'],
  },
  {
    id: 'middle-east',
    title: 'Middle East',
    icon: '🕌',
    codes: ['ar-SA', 'he-IL', 'fa-IR'],
  },
  {
    id: 'south-asia',
    title: 'South Asia',
    icon: '🏔️',
    codes: ['hi-IN', 'bn-BD', 'ur-PK', 'ta-IN', 'te-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'si-LK', 'ne-NP'],
  },
  {
    id: 'southeast-asia',
    title: 'Southeast Asia',
    icon: '🌴',
    codes: ['id-ID', 'ms-MY', 'fil-PH', 'vi-VN', 'th-TH'],
  },
  {
    id: 'east-asia',
    title: 'East Asia',
    icon: '🏯',
    codes: ['ja-JP', 'ko-KR', 'zh-CN', 'zh-TW'],
  },
  {
    id: 'africa',
    title: 'Africa',
    icon: '🌍',
    codes: ['sw-KE', 'af-ZA', 'zu-ZA', 'xh-ZA'],
  },
];

const LanguageCard = ({ lang }: { lang: typeof LANGUAGES[0] }) => (
  <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md">
    <span className="text-2xl">{lang.flag}</span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-slate-900 group-hover:text-blue-700">{lang.name}</p>
      <p className="text-xs text-slate-500">{lang.code}</p>
    </div>
  </div>
);

const LanguagesPage = () => {
  const [query, setQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const languageByCode = useMemo(
    () => new Map(LANGUAGES.map((lang) => [lang.code, lang])),
    [],
  );

  const regionLanguages = useMemo(
    () =>
      regionConfigs.map((region) => ({
        ...region,
        items: region.codes
          .map((code) => languageByCode.get(code))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      })),
    [languageByCode],
  );

  const filteredLanguages = useMemo(() => {
    let results = LANGUAGES;

    // Filter by region if selected
    if (selectedRegion) {
      const region = regionConfigs.find((r) => r.id === selectedRegion);
      if (region) {
        results = results.filter((lang) => region.codes.includes(lang.code));
      }
    }

    // Filter by search query
    if (normalizedQuery) {
      results = results.filter((lang) =>
        [lang.name, lang.code, lang.label, lang.country].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      );
    }

    return results;
  }, [normalizedQuery, selectedRegion]);

  const showAllLanguages = normalizedQuery || selectedRegion;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Seo
        title="50+ Languages – AdvideoLab"
        description="Generate UGC videos in 50+ languages including US/UK English, Spanish, French, German, Japanese, Korean, and more."
        url={getSiteUrl('/languages')}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pb-16 pt-20">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50" />
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-100/50 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2">
              <span className="text-xl">🌍</span>
              <span className="text-sm font-semibold text-blue-700">50+ Languages Supported</span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Create UGC in{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                any language
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              Localize your UGC videos for global audiences. Generate scripts in 50+ languages with native accents and cultural nuance.
            </p>

            {/* Featured Flags */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {['en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'ko-KR', 'zh-CN', 'ar-SA', 'pt-BR', 'hi-IN'].map((code) => {
                const lang = languageByCode.get(code);
                if (!lang) return null;
                return (
                  <div
                    key={code}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-lg ring-2 ring-white transition-transform hover:scale-110"
                    title={lang.name}
                  >
                    {lang.flag}
                  </div>
                );
              })}
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-sm font-bold text-white shadow-lg ring-2 ring-white">
                +{LANGUAGES.length - 10}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { value: LANGUAGES.length, label: 'Languages', icon: '🗣️' },
              { value: regionConfigs.length, label: 'Regions', icon: '🌍' },
              { value: 2, label: 'English Variants', icon: '🇺🇸' },
              { value: 3, label: 'RTL Languages', icon: '📝' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-600">
                  <span>{stat.icon}</span>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Languages Grid */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          {/* Search and Filter */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Browse Languages</h2>
              <p className="mt-1 text-slate-600">Filter by region or search for a specific language</p>
            </div>
            <div className="relative w-full sm:w-72">
              <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Region Pills */}
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegion(null)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                !selectedRegion
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Languages
            </button>
            {regionConfigs.map((region) => (
              <button
                key={region.id}
                onClick={() => setSelectedRegion(selectedRegion === region.id ? null : region.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedRegion === region.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{region.icon}</span>
                {region.title}
              </button>
            ))}
          </div>

          {/* Languages Display */}
          {showAllLanguages ? (
            <>
              <p className="mb-4 text-sm text-slate-500">
                Showing {filteredLanguages.length} language{filteredLanguages.length !== 1 ? 's' : ''}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredLanguages.map((lang) => (
                  <LanguageCard key={lang.code} lang={lang} />
                ))}
              </div>
              {filteredLanguages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-slate-500">No languages found. Try a different search term.</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-10">
              {regionLanguages.map((region) => (
                <div key={region.id}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-xl">{region.icon}</span>
                    <h3 className="text-lg font-semibold text-slate-900">{region.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {region.items.length}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {region.items.map((lang) => (
                      <LanguageCard key={lang.code} lang={lang} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-slate-900">Ready to create localized UGC?</h2>
          <p className="mt-4 text-lg text-slate-600">
            Generate your first video in any of our 50+ supported languages.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/new-video"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:shadow-xl hover:shadow-blue-500/30"
            >
              Generate Your First Video
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LanguagesPage;
