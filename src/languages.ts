/**
 * Languages of a site's data. Codes are language + region, lower case, as
 * in OpenCart (`uk-ua`, `en-gb`, `en-us`, `de-at`): the region gives the
 * flag and tells apart en-gb from en-us. The editor shows names in its own
 * language (`Intl.DisplayNames`), with the native name beside.
 */

export interface LanguageInfo {
  /** `uk-ua` */
  code: string;
  /** The name in the language itself. */
  native: string;
  /** Right to left. */
  rtl?: true;
}

/** Which languages a site has: the default first, then the others in order. */
export interface LanguageSettings {
  /** Data without a translation falls back to this one; the published HTML is in it. */
  default: string;
  /** Enabled languages in order, the default among them. */
  enabled: string[];
}

export const LANG_CODE_RE = /^[a-z]{2,3}-[a-z0-9]{2,4}$/;

/* prettier-ignore */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'af-za', native: 'Afrikaans' },
  { code: 'am-et', native: 'አማርኛ' },
  { code: 'ar-ae', native: 'العربية (الإمارات)', rtl: true },
  { code: 'ar-eg', native: 'العربية (مصر)', rtl: true },
  { code: 'ar-sa', native: 'العربية (السعودية)', rtl: true },
  { code: 'az-az', native: 'Azərbaycan' },
  { code: 'be-by', native: 'Беларуская' },
  { code: 'bg-bg', native: 'Български' },
  { code: 'bn-bd', native: 'বাংলা' },
  { code: 'bs-ba', native: 'Bosanski' },
  { code: 'ca-es', native: 'Català' },
  { code: 'cs-cz', native: 'Čeština' },
  { code: 'cy-gb', native: 'Cymraeg' },
  { code: 'da-dk', native: 'Dansk' },
  { code: 'de-at', native: 'Deutsch (Österreich)' },
  { code: 'de-ch', native: 'Deutsch (Schweiz)' },
  { code: 'de-de', native: 'Deutsch' },
  { code: 'el-gr', native: 'Ελληνικά' },
  { code: 'en-au', native: 'English (Australia)' },
  { code: 'en-ca', native: 'English (Canada)' },
  { code: 'en-gb', native: 'English (UK)' },
  { code: 'en-ie', native: 'English (Ireland)' },
  { code: 'en-in', native: 'English (India)' },
  { code: 'en-nz', native: 'English (New Zealand)' },
  { code: 'en-us', native: 'English (US)' },
  { code: 'en-za', native: 'English (South Africa)' },
  { code: 'es-ar', native: 'Español (Argentina)' },
  { code: 'es-cl', native: 'Español (Chile)' },
  { code: 'es-co', native: 'Español (Colombia)' },
  { code: 'es-es', native: 'Español' },
  { code: 'es-mx', native: 'Español (México)' },
  { code: 'et-ee', native: 'Eesti' },
  { code: 'eu-es', native: 'Euskara' },
  { code: 'fa-ir', native: 'فارسی', rtl: true },
  { code: 'fi-fi', native: 'Suomi' },
  { code: 'fil-ph', native: 'Filipino' },
  { code: 'fr-be', native: 'Français (Belgique)' },
  { code: 'fr-ca', native: 'Français (Canada)' },
  { code: 'fr-ch', native: 'Français (Suisse)' },
  { code: 'fr-fr', native: 'Français' },
  { code: 'ga-ie', native: 'Gaeilge' },
  { code: 'gl-es', native: 'Galego' },
  { code: 'gu-in', native: 'ગુજરાતી' },
  { code: 'he-il', native: 'עברית', rtl: true },
  { code: 'hi-in', native: 'हिन्दी' },
  { code: 'hr-hr', native: 'Hrvatski' },
  { code: 'hu-hu', native: 'Magyar' },
  { code: 'hy-am', native: 'Հայերեն' },
  { code: 'id-id', native: 'Bahasa Indonesia' },
  { code: 'is-is', native: 'Íslenska' },
  { code: 'it-ch', native: 'Italiano (Svizzera)' },
  { code: 'it-it', native: 'Italiano' },
  { code: 'ja-jp', native: '日本語' },
  { code: 'ka-ge', native: 'ქართული' },
  { code: 'kk-kz', native: 'Қазақ' },
  { code: 'km-kh', native: 'ខ្មែរ' },
  { code: 'kn-in', native: 'ಕನ್ನಡ' },
  { code: 'ko-kr', native: '한국어' },
  { code: 'ky-kg', native: 'Кыргызча' },
  { code: 'lo-la', native: 'ລາວ' },
  { code: 'lt-lt', native: 'Lietuvių' },
  { code: 'lv-lv', native: 'Latviešu' },
  { code: 'mk-mk', native: 'Македонски' },
  { code: 'ml-in', native: 'മലയാളം' },
  { code: 'mn-mn', native: 'Монгол' },
  { code: 'mr-in', native: 'मराठी' },
  { code: 'ms-my', native: 'Bahasa Melayu' },
  { code: 'mt-mt', native: 'Malti' },
  { code: 'my-mm', native: 'မြန်မာ' },
  { code: 'nb-no', native: 'Norsk bokmål' },
  { code: 'ne-np', native: 'नेपाली' },
  { code: 'nl-be', native: 'Nederlands (België)' },
  { code: 'nl-nl', native: 'Nederlands' },
  { code: 'nn-no', native: 'Norsk nynorsk' },
  { code: 'pa-in', native: 'ਪੰਜਾਬੀ' },
  { code: 'pl-pl', native: 'Polski' },
  { code: 'pt-br', native: 'Português (Brasil)' },
  { code: 'pt-pt', native: 'Português' },
  { code: 'ro-md', native: 'Română (Moldova)' },
  { code: 'ro-ro', native: 'Română' },
  { code: 'ru-ru', native: 'Русский' },
  { code: 'si-lk', native: 'සිංහල' },
  { code: 'sk-sk', native: 'Slovenčina' },
  { code: 'sl-si', native: 'Slovenščina' },
  { code: 'sq-al', native: 'Shqip' },
  { code: 'sr-rs', native: 'Српски' },
  { code: 'sv-fi', native: 'Svenska (Finland)' },
  { code: 'sv-se', native: 'Svenska' },
  { code: 'sw-ke', native: 'Kiswahili' },
  { code: 'ta-in', native: 'தமிழ்' },
  { code: 'te-in', native: 'తెలుగు' },
  { code: 'tg-tj', native: 'Тоҷикӣ' },
  { code: 'th-th', native: 'ไทย' },
  { code: 'tk-tm', native: 'Türkmen' },
  { code: 'tr-tr', native: 'Türkçe' },
  { code: 'uk-ua', native: 'Українська' },
  { code: 'ur-pk', native: 'اردو', rtl: true },
  { code: 'uz-uz', native: 'Oʻzbek' },
  { code: 'vi-vn', native: 'Tiếng Việt' },
  { code: 'zh-cn', native: '中文（简体）' },
  { code: 'zh-hk', native: '中文（香港）' },
  { code: 'zh-tw', native: '中文（繁體）' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** A language of the catalog (or a bare one for a code not in it). */
export const languageInfo = (code: string): LanguageInfo => BY_CODE.get(code) || { code, native: code };

/** The flag of the code's region: `uk-ua` → 🇺🇦 (regional indicator letters). */
export function flagOf(code: string): string {
  const region = code.split('-')[1] || '';
  if (!/^[a-z]{2}$/.test(region)) return '🏳';
  return String.fromCodePoint(...[...region.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The region's two letters, upper case (a badge where flags do not draw, e.g. Windows). */
export const regionOf = (code: string): string => (code.split('-')[1] || '').toUpperCase();

/** A language's name in the editor's language (`Intl.DisplayNames`), else the native name. */
export function languageName(code: string, uiLocale?: string): string {
  try {
    const dn = new Intl.DisplayNames(uiLocale ? [uiLocale] : undefined, { type: 'language' });
    const [lang, region] = code.split('-');
    const name = dn.of(region ? `${lang}-${region.toUpperCase()}` : lang);
    if (name && name.toLowerCase() !== code) return name;
  } catch {
    /* no Intl.DisplayNames */
  }
  return languageInfo(code).native;
}

/** Cleans settings: known shape, unique codes, the default enabled and first. Null: no languages. */
export function normalizeLanguages(raw: unknown): LanguageSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const list = (Array.isArray(o.enabled) ? o.enabled : [])
    .map((c) => String(c).trim().toLowerCase().replace('_', '-'))
    .filter((c, i, a) => LANG_CODE_RE.test(c) && a.indexOf(c) === i);
  let def = typeof o.default === 'string' ? o.default.trim().toLowerCase().replace('_', '-') : '';
  if (!LANG_CODE_RE.test(def)) def = list[0] || '';
  if (!def) return null;
  return { default: def, enabled: [def, ...list.filter((c) => c !== def)] };
}

/**
 * Is a value a map of translations (`{ 'uk-ua': …, 'en-gb': … }`)? Every
 * key must be a language code: field names and the keys of image, link or
 * file values (`url`, `alt`…) never have a hyphen, so they are never taken
 * for one.
 */
export function isLangMap(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => LANG_CODE_RE.test(k));
}

/** A translated value in a language: its own, else the fallback's, else any. A plain value is the same in every language. */
export function pickLang(v: unknown, lang: string, fallback?: string): unknown {
  if (!isLangMap(v)) return v;
  const empty = (x: unknown): boolean => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length);
  if (!empty(v[lang])) return v[lang];
  if (fallback && !empty(v[fallback])) return v[fallback];
  return Object.values(v).find((x) => !empty(x));
}
