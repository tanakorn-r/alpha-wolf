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
  monthlyTrend?: number | null;
  quarterlyTrend?: number | null;
  oneYearReturn?: number | null;
  relativePosition?: number | null;
  volumeRatio?: number | null;
  sparkline: number[];
  recommendation: string;
  story: string;
  strategyScores: Record<StrategyKey, number>;
  dividendYield?: number | null;
  exDividendDate?: string | null;
};

export const strategyLabels: Record<StrategyKey, string> = {
  capitalized: "Value Investing",
  stable_dca: "Dividend Dips",
  yield: "Dividend Income",
  momentum: "Growth"
};

export const strategyDescriptions: Record<StrategyKey, string> = {
  capitalized: "Best for long-term value and business quality.",
  stable_dca: "Best when you want to buy resets around dividend patterns and calmer pullbacks.",
  yield: "Best for strong and sustainable dividend income.",
  momentum: "Best for growth names with confirming price action."
};
