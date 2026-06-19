export const brandTheme = {
  name: "Alpha Wolf",
  tagline: "Investment strategy platform"
} as const;

export const radarIndexes = [
  { key: "all", label: "All" },
  { key: "most_active", label: "Most Active" },
  { key: "day_gainers", label: "Day Gainers" },
  { key: "day_losers", label: "Day Losers" },
  { key: "growth_technology", label: "Growth Tech" },
  { key: "undervalued_large_caps", label: "Value Large Caps" },
  { key: "technology", label: "Technology" },
  { key: "semiconductors", label: "Semiconductors" },
  { key: "communication_services", label: "Comm Services" },
  { key: "consumer_cyclical", label: "Consumer Cyclical" },
  { key: "consumer_staples", label: "Consumer Staples" },
  { key: "financials", label: "Financials" },
  { key: "healthcare", label: "Healthcare" },
  { key: "energy", label: "Energy" },
  { key: "etf", label: "ETF" },
] as const;

export const radarSorts = [
  { key: "score", label: "Score" },
  { key: "change", label: "Change" },
  { key: "trend", label: "Trend" }
] as const;

export const radarDirections = [
  { key: "desc", label: "High to low" },
  { key: "asc", label: "Low to high" }
] as const;
