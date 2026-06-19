const PALETTE = [
  { bg: "#f7931a", fg: "#1a1106" }, // bitcoin orange
  { bg: "#5b6dee", fg: "#ffffff" }, // ethereum blue
  { bg: "#16a34a", fg: "#ffffff" }, // ripple green
  { bg: "#0f172a", fg: "#ffffff" }, // near-black
  { bg: "#dc2626", fg: "#ffffff" },
  { bg: "#7c3aed", fg: "#ffffff" },
  { bg: "#0891b2", fg: "#ffffff" },
  { bg: "#ca8a04", fg: "#1a1106" }
];

export function colorForSymbol(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initialFor(symbol: string) {
  return symbol.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?";
}
