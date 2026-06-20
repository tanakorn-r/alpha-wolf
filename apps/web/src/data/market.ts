export type StrategyKey = "capitalized" | "stable_dca" | "yield" | "momentum";

export type StockRecord = {
  symbol: string;
  name: string;
  sector: string;
  industry?: string;
  exchange?: string;
  currency?: string;
  marketCap?: number;
  indexes: string[];
  price: number;
  changePct: number;
  weeklyTrend: number;
  sparkline: number[];
  recommendation: string;
  story: string;
  strategyScores: Record<StrategyKey, number>;
};

export const strategyLabels: Record<StrategyKey, string> = {
  capitalized: "Capitalized",
  stable_dca: "Stable DCA",
  yield: "Yield",
  momentum: "Momentum"
};
