import { getLocaleSettings } from "./locale";

export function formatMoney(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return formatMoneyAs(value, getLocaleSettings().baseCurrency);
}

export type FxRates = Record<string, number>;
const FX_RATES: FxRates = { USD: 1, THB: 36.5, EUR: 0.86, GBP: 0.74, JPY: 159, HKD: 7.85, CNY: 7.18 };

/** THB per 1 USD — the app stores money in USD base and displays THB by default. */
export let THB_PER_USD = FX_RATES.THB;

export function setFxRates(rates?: FxRates | null) {
  if (!rates) return;
  for (const [currency, rate] of Object.entries(rates)) {
    if (Number.isFinite(rate) && rate > 0) FX_RATES[currency.toUpperCase()] = rate;
  }
  THB_PER_USD = FX_RATES.THB;
}

/** Convert an instrument-native per-share price (e.g. a THB price for a .BK stock)
 * into the USD base the portfolio store expects. A `.BK` symbol implies THB. */
export function priceToUsdBase(price: number, currencyOrSymbol?: string | null, rates: FxRates = FX_RATES): number {
  const token = (currencyOrSymbol || "").toUpperCase();
  const currency = token === "THB" || token.endsWith(".BK") ? "THB" : "USD";
  return price / (rates[currency] || FX_RATES[currency]);
}

/** value is always in USD; converts and formats for the selected display currency. */
export function formatMoneyAs(value: number | undefined, currency: string) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const token = currency.toUpperCase();
  const converted = value * (FX_RATES[token] || 1);
  return new Intl.NumberFormat(getLocaleSettings().numberLocale, {
    style: "currency",
    currency: token,
    maximumFractionDigits: Math.abs(converted) >= 100 ? 0 : 2,
  }).format(converted);
}

/** Backward-compatible name; formats USD-base app money in the account's selected currency. */
export function formatMoneyBaht(value?: number) {
  return formatMoneyAs(value, getLocaleSettings().baseCurrency);
}

/** Primary figure in the selected portfolio currency, with USD as a reference when different. */
export function formatMoneyDual(value?: number) {
  const currency = getLocaleSettings().baseCurrency;
  return { primary: formatMoneyAs(value, currency), secondary: currency === "USD" ? null : formatMoneyAs(value, "USD") };
}

export function formatCurrency(value?: number, currency?: string | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  // A default parameter only covers `undefined` — the API can genuinely send `currency: null`
  // (e.g. a freshly-uncached symbol whose backend cache-first fallback hasn't populated yet),
  // which bypasses the default and crashes Intl.NumberFormat with "Invalid currency code".
  return new Intl.NumberFormat(getLocaleSettings().numberLocale, { style: "currency", currency: currency || "USD", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

export function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat(getLocaleSettings().numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatNumber(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(getLocaleSettings().numberLocale, { maximumFractionDigits: 2 }).format(value);
}

export function formatMultiple(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(getLocaleSettings().numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
}

export function formatBig(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(getLocaleSettings().numberLocale, {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const settings = getLocaleSettings();
  return date.toLocaleDateString(settings.dateLocale, { timeZone: settings.timezone, month: "short", day: "numeric", year: "numeric" });
}

export function formatCompactMoney(value: number) {
  const settings = getLocaleSettings();
  const converted = value * (FX_RATES[settings.baseCurrency] || 1);
  return new Intl.NumberFormat(settings.numberLocale, { style: "currency", currency: settings.baseCurrency, notation: "compact", maximumFractionDigits: 0 }).format(converted);
}
