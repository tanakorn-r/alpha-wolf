import type { LocaleSettings, MarketPreference } from "./api";

export const MARKET_CHOICES: Array<{ value: MarketPreference; name: string; exchange: string; example: string }> = [
  { value: "us", name: "United States", exchange: "NYSE · Nasdaq", example: "AAPL" },
  { value: "europe", name: "Europe", exchange: "Euronext · LSE", example: "ASML.AS" },
  { value: "japan", name: "Japan", exchange: "Tokyo Stock Exchange", example: "7203.T" },
  { value: "hong-kong-china", name: "Hong Kong / China", exchange: "HKEX · SSE/SZSE", example: "0700.HK" },
  { value: "thailand", name: "Thailand", exchange: "SET", example: "PTT.BK" },
];

export const CURRENCY_CHOICES: Array<{ value: LocaleSettings["baseCurrency"]; label: string }> = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "THB", label: "THB — Thai Baht" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "HKD", label: "HKD — Hong Kong Dollar" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
];

export const LANGUAGE_CHOICES = [
  { value: "en", label: "English" },
] as const;

export const TIMEZONE_CHOICES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Amsterdam", "Europe/Paris", "Europe/Berlin",
  "Asia/Bangkok", "Asia/Tokyo", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Singapore",
  "Australia/Sydney", "UTC",
];

export const LOCALE_CHOICES = [
  { value: "en-US", label: "English (US) — 1,234.56" },
  { value: "en-GB", label: "English (UK) — 1,234.56" },
  { value: "th-TH", label: "ไทย — 1,234.56" },
  { value: "de-DE", label: "Deutsch — 1.234,56" },
  { value: "fr-FR", label: "Français — 1 234,56" },
  { value: "ja-JP", label: "日本語 — 1,234.56" },
  { value: "zh-HK", label: "繁體中文 — 1,234.56" },
  { value: "zh-CN", label: "简体中文 — 1,234.56" },
];

type CountryChoice = {
  code: string;
  name: string;
  language: string;
  currency: LocaleSettings["baseCurrency"];
  timezone: string;
  locale: string;
  markets: MarketPreference[];
};

export const COUNTRY_CHOICES: CountryChoice[] = [
  { code: "US", name: "United States", language: "en", currency: "USD", timezone: "America/New_York", locale: "en-US", markets: ["us"] },
  { code: "TH", name: "Thailand", language: "th", currency: "THB", timezone: "Asia/Bangkok", locale: "th-TH", markets: ["thailand", "us"] },
  { code: "GB", name: "United Kingdom", language: "en", currency: "GBP", timezone: "Europe/London", locale: "en-GB", markets: ["europe", "us"] },
  { code: "NL", name: "Netherlands", language: "en", currency: "EUR", timezone: "Europe/Amsterdam", locale: "en-GB", markets: ["europe", "us"] },
  { code: "FR", name: "France", language: "en", currency: "EUR", timezone: "Europe/Paris", locale: "fr-FR", markets: ["europe", "us"] },
  { code: "DE", name: "Germany", language: "en", currency: "EUR", timezone: "Europe/Berlin", locale: "de-DE", markets: ["europe", "us"] },
  { code: "JP", name: "Japan", language: "ja", currency: "JPY", timezone: "Asia/Tokyo", locale: "ja-JP", markets: ["japan", "us"] },
  { code: "HK", name: "Hong Kong", language: "zh-Hant", currency: "HKD", timezone: "Asia/Hong_Kong", locale: "zh-HK", markets: ["hong-kong-china", "us"] },
  { code: "CN", name: "China", language: "zh-Hans", currency: "CNY", timezone: "Asia/Shanghai", locale: "zh-CN", markets: ["hong-kong-china", "us"] },
  { code: "SG", name: "Singapore", language: "en", currency: "USD", timezone: "Asia/Singapore", locale: "en-GB", markets: ["hong-kong-china", "us"] },
];

const FALLBACK_SETTINGS: LocaleSettings = {
  countryCode: "US",
  displayLanguage: "en",
  baseCurrency: "USD",
  timezone: "America/New_York",
  dateLocale: "en-US",
  numberLocale: "en-US",
  preferredMarkets: ["us"],
};

let activeSettings: LocaleSettings = FALLBACK_SETTINGS;

export function detectLocaleSettings(): LocaleSettings {
  if (typeof window === "undefined") return { ...FALLBACK_SETTINGS };
  const browserLocale = window.navigator.language || "en-US";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const region = browserLocale.split("-")[1]?.toUpperCase();
  const country = COUNTRY_CHOICES.find((item) => item.timezone === timezone)
    ?? COUNTRY_CHOICES.find((item) => item.code === region)
    ?? FALLBACK_SETTINGS_TO_COUNTRY;
  const language = browserLocale.split("-")[0];
  const supportedLanguage = LANGUAGE_CHOICES.some((item) => item.value === language) ? language : "en";
  return {
    countryCode: country.code,
    displayLanguage: supportedLanguage,
    baseCurrency: country.currency,
    timezone,
    dateLocale: LOCALE_CHOICES.some((item) => item.value === browserLocale) ? browserLocale : country.locale,
    numberLocale: LOCALE_CHOICES.some((item) => item.value === browserLocale) ? browserLocale : country.locale,
    preferredMarkets: [...country.markets],
  };
}

const FALLBACK_SETTINGS_TO_COUNTRY = COUNTRY_CHOICES[0];

export function defaultsForCountry(countryCode: string, current: LocaleSettings): LocaleSettings {
  const country = COUNTRY_CHOICES.find((item) => item.code === countryCode);
  if (!country) return current;
  return {
    ...current,
    countryCode: country.code,
    displayLanguage: LANGUAGE_CHOICES.some((item) => item.value === country.language) ? country.language : "en",
    baseCurrency: country.currency,
    timezone: country.timezone,
    dateLocale: country.locale,
    numberLocale: country.locale,
    preferredMarkets: [...country.markets],
  };
}

export function configureLocale(settings?: LocaleSettings | null): LocaleSettings {
  activeSettings = settings ? { ...settings, preferredMarkets: [...settings.preferredMarkets] } : detectLocaleSettings();
  if (typeof document !== "undefined") document.documentElement.lang = activeSettings.displayLanguage;
  return activeSettings;
}

export function getLocaleSettings(): LocaleSettings {
  return activeSettings;
}

export function formatLocalDateTime(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(activeSettings.dateLocale, { timeZone: activeSettings.timezone, ...options });
}

export function formatLocalDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(activeSettings.dateLocale, { timeZone: activeSettings.timezone, ...options });
}
