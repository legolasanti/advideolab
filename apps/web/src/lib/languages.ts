export type LanguageOption = {
  name: string;
  code: string;
  label: string;
};

export const LANGUAGES: LanguageOption[] = [
  { name: 'English (US)', code: 'en-US', label: 'English (US) — en-US' },
  { name: 'English (UK)', code: 'en-GB', label: 'English (UK) — en-GB' },
  { name: 'Spanish', code: 'es-ES', label: 'Spanish — es-ES' },
  { name: 'Portuguese (Brazil)', code: 'pt-BR', label: 'Portuguese (Brazil) — pt-BR' },
  { name: 'Portuguese (Portugal)', code: 'pt-PT', label: 'Portuguese (Portugal) — pt-PT' },
  { name: 'German', code: 'de-DE', label: 'German — de-DE' },
  { name: 'French', code: 'fr-FR', label: 'French — fr-FR' },
  { name: 'Italian', code: 'it-IT', label: 'Italian — it-IT' },
  { name: 'Dutch', code: 'nl-NL', label: 'Dutch — nl-NL' },
  { name: 'Swedish', code: 'sv-SE', label: 'Swedish — sv-SE' },
  { name: 'Danish', code: 'da-DK', label: 'Danish — da-DK' },
  { name: 'Finnish', code: 'fi-FI', label: 'Finnish — fi-FI' },
  { name: 'Polish', code: 'pl-PL', label: 'Polish — pl-PL' },
  { name: 'Turkish', code: 'tr-TR', label: 'Turkish — tr-TR' },
  { name: 'Norwegian', code: 'no-NO', label: 'Norwegian — no-NO' },
  { name: 'Russian', code: 'ru-RU', label: 'Russian — ru-RU' },
  { name: 'Arabic', code: 'ar-SA', label: 'Arabic — ar-SA' },
  { name: 'Hindi', code: 'hi-IN', label: 'Hindi — hi-IN' },
  { name: 'Indonesian', code: 'id-ID', label: 'Indonesian — id-ID' },
  { name: 'Japanese', code: 'ja-JP', label: 'Japanese — ja-JP' },
  { name: 'Korean', code: 'ko-KR', label: 'Korean — ko-KR' },
];

export const formatSupportedLanguages = () => {
  const english = LANGUAGES.slice(0, 2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  const rest = LANGUAGES.slice(2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  return `${english}; ${rest}`;
};
