export type LanguageOption = {
  name: string;
  code: string;
  label: string;
  flag: string;
  country: string;
};

export const LANGUAGES: LanguageOption[] = [
  { name: 'English (US)', code: 'en-US', label: 'English (US) — en-US', flag: '🇺🇸', country: 'US' },
  { name: 'English (UK)', code: 'en-GB', label: 'English (UK) — en-GB', flag: '🇬🇧', country: 'GB' },
  { name: 'Spanish', code: 'es-ES', label: 'Spanish — es-ES', flag: '🇪🇸', country: 'ES' },
  { name: 'Portuguese (Brazil)', code: 'pt-BR', label: 'Portuguese (Brazil) — pt-BR', flag: '🇧🇷', country: 'BR' },
  { name: 'Portuguese (Portugal)', code: 'pt-PT', label: 'Portuguese (Portugal) — pt-PT', flag: '🇵🇹', country: 'PT' },
  { name: 'French', code: 'fr-FR', label: 'French — fr-FR', flag: '🇫🇷', country: 'FR' },
  { name: 'German', code: 'de-DE', label: 'German — de-DE', flag: '🇩🇪', country: 'DE' },
  { name: 'Italian', code: 'it-IT', label: 'Italian — it-IT', flag: '🇮🇹', country: 'IT' },
  { name: 'Dutch', code: 'nl-NL', label: 'Dutch — nl-NL', flag: '🇳🇱', country: 'NL' },
  { name: 'Swedish', code: 'sv-SE', label: 'Swedish — sv-SE', flag: '🇸🇪', country: 'SE' },
  { name: 'Danish', code: 'da-DK', label: 'Danish — da-DK', flag: '🇩🇰', country: 'DK' },
  { name: 'Finnish', code: 'fi-FI', label: 'Finnish — fi-FI', flag: '🇫🇮', country: 'FI' },
  { name: 'Norwegian', code: 'no-NO', label: 'Norwegian — no-NO', flag: '🇳🇴', country: 'NO' },
  { name: 'Icelandic', code: 'is-IS', label: 'Icelandic — is-IS', flag: '🇮🇸', country: 'IS' },
  { name: 'Polish', code: 'pl-PL', label: 'Polish — pl-PL', flag: '🇵🇱', country: 'PL' },
  { name: 'Czech', code: 'cs-CZ', label: 'Czech — cs-CZ', flag: '🇨🇿', country: 'CZ' },
  { name: 'Slovak', code: 'sk-SK', label: 'Slovak — sk-SK', flag: '🇸🇰', country: 'SK' },
  { name: 'Hungarian', code: 'hu-HU', label: 'Hungarian — hu-HU', flag: '🇭🇺', country: 'HU' },
  { name: 'Romanian', code: 'ro-RO', label: 'Romanian — ro-RO', flag: '🇷🇴', country: 'RO' },
  { name: 'Bulgarian', code: 'bg-BG', label: 'Bulgarian — bg-BG', flag: '🇧🇬', country: 'BG' },
  { name: 'Greek', code: 'el-GR', label: 'Greek — el-GR', flag: '🇬🇷', country: 'GR' },
  { name: 'Russian', code: 'ru-RU', label: 'Russian — ru-RU', flag: '🇷🇺', country: 'RU' },
  { name: 'Ukrainian', code: 'uk-UA', label: 'Ukrainian — uk-UA', flag: '🇺🇦', country: 'UA' },
  { name: 'Turkish', code: 'tr-TR', label: 'Turkish — tr-TR', flag: '🇹🇷', country: 'TR' },
  { name: 'Arabic', code: 'ar-SA', label: 'Arabic — ar-SA', flag: '🇸🇦', country: 'SA' },
  { name: 'Hebrew', code: 'he-IL', label: 'Hebrew — he-IL', flag: '🇮🇱', country: 'IL' },
  { name: 'Persian (Farsi)', code: 'fa-IR', label: 'Persian (Farsi) — fa-IR', flag: '🇮🇷', country: 'IR' },
  { name: 'Urdu', code: 'ur-PK', label: 'Urdu — ur-PK', flag: '🇵🇰', country: 'PK' },
  { name: 'Hindi', code: 'hi-IN', label: 'Hindi — hi-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Bengali', code: 'bn-BD', label: 'Bengali — bn-BD', flag: '🇧🇩', country: 'BD' },
  { name: 'Tamil', code: 'ta-IN', label: 'Tamil — ta-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Telugu', code: 'te-IN', label: 'Telugu — te-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Marathi', code: 'mr-IN', label: 'Marathi — mr-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Gujarati', code: 'gu-IN', label: 'Gujarati — gu-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Kannada', code: 'kn-IN', label: 'Kannada — kn-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Malayalam', code: 'ml-IN', label: 'Malayalam — ml-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Punjabi', code: 'pa-IN', label: 'Punjabi — pa-IN', flag: '🇮🇳', country: 'IN' },
  { name: 'Sinhala', code: 'si-LK', label: 'Sinhala — si-LK', flag: '🇱🇰', country: 'LK' },
  { name: 'Nepali', code: 'ne-NP', label: 'Nepali — ne-NP', flag: '🇳🇵', country: 'NP' },
  { name: 'Indonesian', code: 'id-ID', label: 'Indonesian — id-ID', flag: '🇮🇩', country: 'ID' },
  { name: 'Malay', code: 'ms-MY', label: 'Malay — ms-MY', flag: '🇲🇾', country: 'MY' },
  { name: 'Filipino (Tagalog)', code: 'fil-PH', label: 'Filipino (Tagalog) — fil-PH', flag: '🇵🇭', country: 'PH' },
  { name: 'Vietnamese', code: 'vi-VN', label: 'Vietnamese — vi-VN', flag: '🇻🇳', country: 'VN' },
  { name: 'Thai', code: 'th-TH', label: 'Thai — th-TH', flag: '🇹🇭', country: 'TH' },
  { name: 'Japanese', code: 'ja-JP', label: 'Japanese — ja-JP', flag: '🇯🇵', country: 'JP' },
  { name: 'Korean', code: 'ko-KR', label: 'Korean — ko-KR', flag: '🇰🇷', country: 'KR' },
  { name: 'Chinese (Simplified)', code: 'zh-CN', label: 'Chinese (Simplified) — zh-CN', flag: '🇨🇳', country: 'CN' },
  { name: 'Chinese (Traditional)', code: 'zh-TW', label: 'Chinese (Traditional) — zh-TW', flag: '🇹🇼', country: 'TW' },
  { name: 'Swahili', code: 'sw-KE', label: 'Swahili — sw-KE', flag: '🇰🇪', country: 'KE' },
  { name: 'Afrikaans', code: 'af-ZA', label: 'Afrikaans — af-ZA', flag: '🇿🇦', country: 'ZA' },
  { name: 'Zulu', code: 'zu-ZA', label: 'Zulu — zu-ZA', flag: '🇿🇦', country: 'ZA' },
  { name: 'Xhosa', code: 'xh-ZA', label: 'Xhosa — xh-ZA', flag: '🇿🇦', country: 'ZA' },
];

export const formatSupportedLanguages = () => {
  const english = LANGUAGES.slice(0, 2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  const rest = LANGUAGES.slice(2).map((lang) => `${lang.name} (${lang.code})`).join(', ');
  return `${english}; ${rest}`;
};
