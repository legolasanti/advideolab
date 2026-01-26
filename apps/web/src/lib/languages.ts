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
  { name: 'French', code: 'fr-FR', label: 'French — fr-FR' },
  { name: 'German', code: 'de-DE', label: 'German — de-DE' },
  { name: 'Italian', code: 'it-IT', label: 'Italian — it-IT' },
  { name: 'Dutch', code: 'nl-NL', label: 'Dutch — nl-NL' },
  { name: 'Swedish', code: 'sv-SE', label: 'Swedish — sv-SE' },
  { name: 'Danish', code: 'da-DK', label: 'Danish — da-DK' },
  { name: 'Finnish', code: 'fi-FI', label: 'Finnish — fi-FI' },
  { name: 'Norwegian', code: 'no-NO', label: 'Norwegian — no-NO' },
  { name: 'Icelandic', code: 'is-IS', label: 'Icelandic — is-IS' },
  { name: 'Polish', code: 'pl-PL', label: 'Polish — pl-PL' },
  { name: 'Czech', code: 'cs-CZ', label: 'Czech — cs-CZ' },
  { name: 'Slovak', code: 'sk-SK', label: 'Slovak — sk-SK' },
  { name: 'Hungarian', code: 'hu-HU', label: 'Hungarian — hu-HU' },
  { name: 'Romanian', code: 'ro-RO', label: 'Romanian — ro-RO' },
  { name: 'Bulgarian', code: 'bg-BG', label: 'Bulgarian — bg-BG' },
  { name: 'Greek', code: 'el-GR', label: 'Greek — el-GR' },
  { name: 'Russian', code: 'ru-RU', label: 'Russian — ru-RU' },
  { name: 'Ukrainian', code: 'uk-UA', label: 'Ukrainian — uk-UA' },
  { name: 'Turkish', code: 'tr-TR', label: 'Turkish — tr-TR' },
  { name: 'Arabic', code: 'ar-SA', label: 'Arabic — ar-SA' },
  { name: 'Hebrew', code: 'he-IL', label: 'Hebrew — he-IL' },
  { name: 'Persian (Farsi)', code: 'fa-IR', label: 'Persian (Farsi) — fa-IR' },
  { name: 'Urdu', code: 'ur-PK', label: 'Urdu — ur-PK' },
  { name: 'Hindi', code: 'hi-IN', label: 'Hindi — hi-IN' },
  { name: 'Bengali', code: 'bn-BD', label: 'Bengali — bn-BD' },
  { name: 'Tamil', code: 'ta-IN', label: 'Tamil — ta-IN' },
  { name: 'Telugu', code: 'te-IN', label: 'Telugu — te-IN' },
  { name: 'Marathi', code: 'mr-IN', label: 'Marathi — mr-IN' },
  { name: 'Gujarati', code: 'gu-IN', label: 'Gujarati — gu-IN' },
  { name: 'Kannada', code: 'kn-IN', label: 'Kannada — kn-IN' },
  { name: 'Malayalam', code: 'ml-IN', label: 'Malayalam — ml-IN' },
  { name: 'Punjabi', code: 'pa-IN', label: 'Punjabi — pa-IN' },
  { name: 'Sinhala', code: 'si-LK', label: 'Sinhala — si-LK' },
  { name: 'Nepali', code: 'ne-NP', label: 'Nepali — ne-NP' },
  { name: 'Indonesian', code: 'id-ID', label: 'Indonesian — id-ID' },
  { name: 'Malay', code: 'ms-MY', label: 'Malay — ms-MY' },
  { name: 'Filipino (Tagalog)', code: 'fil-PH', label: 'Filipino (Tagalog) — fil-PH' },
  { name: 'Vietnamese', code: 'vi-VN', label: 'Vietnamese — vi-VN' },
  { name: 'Thai', code: 'th-TH', label: 'Thai — th-TH' },
  { name: 'Japanese', code: 'ja-JP', label: 'Japanese — ja-JP' },
  { name: 'Korean', code: 'ko-KR', label: 'Korean — ko-KR' },
  { name: 'Chinese (Simplified)', code: 'zh-CN', label: 'Chinese (Simplified) — zh-CN' },
  { name: 'Chinese (Traditional)', code: 'zh-TW', label: 'Chinese (Traditional) — zh-TW' },
  { name: 'Swahili', code: 'sw-KE', label: 'Swahili — sw-KE' },
  { name: 'Afrikaans', code: 'af-ZA', label: 'Afrikaans — af-ZA' },
  { name: 'Zulu', code: 'zu-ZA', label: 'Zulu — zu-ZA' },
  { name: 'Xhosa', code: 'xh-ZA', label: 'Xhosa — xh-ZA' },
];

export const formatSupportedLanguages = () => {
  const english = LANGUAGES.slice(0, 2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  const rest = LANGUAGES.slice(2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  return `${english}; ${rest}`;
};
