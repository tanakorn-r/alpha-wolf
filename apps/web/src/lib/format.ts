export function formatMoney(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

export type FxRates = Record<string, number>;
const FX_RATES: FxRates = { USD: 1, THB: 36.5 };
const CURRENCY_SYMBOL = { USD: "$", THB: "฿" } as const;

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
export function formatMoneyAs(value: number | undefined, currency: "USD" | "THB") {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const converted = value * FX_RATES[currency];
  const sign = converted < 0 ? "-" : "";
  // A thin space keeps the ฿ glyph from visually colliding with a leading digit
  // (some fonts give it a wide right sidebearing that overlaps a following "0").
  return `${sign}${CURRENCY_SYMBOL[currency]} ${Math.abs(Math.round(converted)).toLocaleString("en-US")}`;
}

/** value is always in USD base; formats it as the app's default display currency (THB). */
export function formatMoneyBaht(value?: number) {
  return formatMoneyAs(value, "THB");
}

/** Primary figure in THB (the site's default display currency) plus a USD equivalent for reference. */
export function formatMoneyDual(value?: number) {
  return { primary: formatMoneyAs(value, "THB"), secondary: formatMoneyAs(value, "USD") };
}

export function formatCurrency(value?: number, currency?: string | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  // A default parameter only covers `undefined` — the API can genuinely send `currency: null`
  // (e.g. a freshly-uncached symbol whose backend cache-first fallback hasn't populated yet),
  // which bypasses the default and crashes Intl.NumberFormat with "Invalid currency code".
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

export function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatNumber(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatMultiple(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}x`;
}

export function formatBig(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return formatMoney(value);
}

export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
