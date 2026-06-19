export type StrategyKey = "capitalized" | "stable_dca" | "yield" | "momentum";

export type StockRecord = {
  symbol: string;
  name: string;
  sector: string;
  indexes: string[];
  price: number;
  changePct: number;
  weeklyTrend: number;
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
