export function formatMoney(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
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
