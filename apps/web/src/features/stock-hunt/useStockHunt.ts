import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StockRecord, StrategyKey } from "../../data/market";
import { buyHolding, loadAuthUser, loadDiscoveries, loadFxRates, summarizeStock, type MarketPreference, type StockAnalysisResponse } from "../../lib/api";
import { formatCurrency, formatPercent, formatShortDate, priceToUsdBase } from "../../lib/format";
import { DISCOVERY_DEBOUNCE_MS, useDebouncedValue } from "../../lib/useDebouncedValue";
import { useWolfStore } from "../../store/useWolfStore";
import type { StrategyIconKind } from "../../components/ui/icons";
import { getLocaleSettings } from "../../lib/locale";

export type Market = "all" | "us" | "th" | "europe" | "japan" | "hong-kong-china";
export type SortKey = "score" | "yield" | "change" | "name";
export type StrategyMode = StrategyIconKind;
export type Top5State = "idle" | "loading" | "open";

const marketPreferenceFilters: Record<MarketPreference, Exclude<Market, "all">> = {
  us: "us",
  europe: "europe",
  japan: "japan",
  "hong-kong-china": "hong-kong-china",
  thailand: "th",
};
const marketLabels: Record<Exclude<Market, "all">, string> = {
  us: "United States · NYSE / Nasdaq",
  europe: "Europe · Euronext / LSE",
  japan: "Japan · Tokyo Stock Exchange",
  "hong-kong-china": "Hong Kong / China · HKEX / SSE / SZSE",
  th: "Thailand · SET",
};
export const chipLabels: Record<StrategyMode, string> = {
  swing: "Swing Trade",
  day: "Day Trade",
  long: "Long-Term",
  value: "Value / Capital",
  fomo: "FOMO / Momentum",
};
export const chipColors: Record<StrategyMode, string> = {
  swing: "#3ecf8e",
  day: "#f2575c",
  long: "#74a4ff",
  value: "#f5c451",
  fomo: "#c77dff",
};
const chipOrder: StrategyMode[] = ["swing", "day", "long", "value", "fomo"];
const modeToBaseStrategy: Record<StrategyMode, StrategyKey> = {
  swing: "momentum",
  day: "momentum",
  long: "stable_dca",
  value: "capitalized",
  fomo: "momentum",
};
const modeDescriptions: Record<StrategyMode, string> = {
  swing: "Best for turning-point entries near support after a pullback starts to recover.",
  day: "Best for short-lived moves where today's tape and volume matter most.",
  long: "Best for durable names you can hold through multiple cycles.",
  value: "Best for quality businesses trading at more attractive entry levels.",
  fomo: "Best for aggressive breakout hunting when strength is already obvious.",
};
export const sortLabels: Record<SortKey, string> = {
  score: "Top match score",
  yield: "Dividend yield",
  change: "Today's move",
  name: "Ticker",
};

// Fixed GICS sectors the backend catalog is built from (see catalog.CATALOG_SECTORS).
// Sector filtering is server-side, so the dropdown uses this fixed list, not loaded items.
export const SECTORS = [
  "Technology",
  "Financial Services",
  "Healthcare",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Communication Services",
  "Energy",
  "Utilities",
  "Real Estate",
  "Basic Materials",
] as const;

export type MatchVM = {
  item: StockRecord;
  rank: number;
  score: number;
  scoreColor: string;
  marketBadge: string;
  sectorBadge: string;
  story: string;
  signals: Array<{ good: boolean; label: string }>;
  priceLabel: string;
  changeLabel: string;
  changeGood: boolean;
  metaLabel: string;
  suggested: number | null;
};

export type StockHunt = ReturnType<typeof useStockHunt>;

export function useStockHunt() {
  const queryClient = useQueryClient();
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const setSearchQuery = useWolfStore((state) => state.setSearchQuery);
  const openDetail = useWolfStore((state) => state.openDetail);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const setSelectedMode = useWolfStore((state) => state.setSelectedMode);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const detailOpen = useWolfStore((state) => state.detailOpen);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>("swing");
  const baseStrategy = modeToBaseStrategy[strategyMode];

  const query = useDebouncedValue(searchQuery.trim(), DISCOVERY_DEBOUNCE_MS);

  useEffect(() => {
    if (searchQuery.trim() !== query) {
      void queryClient.cancelQueries({ queryKey: ["discoveries"] });
    }
  }, [query, queryClient, searchQuery]);

  useEffect(() => {
    if (detailOpen) void queryClient.cancelQueries({ queryKey: ["discoveries"] });
  }, [detailOpen, queryClient]);
  const [market, setMarketState] = useState<Market>(() => preferredScannerMarket());
  const [sector, setSectorState] = useState("all");
  const [sortBy, setSortByState] = useState<SortKey>("score");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingSymbol, setAnalyzingSymbol] = useState("");
  const [top5State, setTop5State] = useState<Top5State>("idle");
  const [top5Applied, setTop5Applied] = useState<{ count: number; amount: number } | null>(null);
  const [applyingTop5, setApplyingTop5] = useState(false);
  const [applyTop5Error, setApplyTop5Error] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  const [discoveryReady, setDiscoveryReady] = useState(false);
  const authQuery = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const preferredMarketKey = (authQuery.data?.settings?.preferredMarkets ?? getLocaleSettings().preferredMarkets).join(",");
  const configuredMarkets = useMemo(
    () => preferredMarketKey.split(",").filter(Boolean).map((value) => marketPreferenceFilters[value as MarketPreference]),
    [preferredMarketKey],
  );
  const marketOptions = useMemo<Array<{ value: Market; label: string }>>(
    () => [
      { value: "all", label: "All preferred markets" },
      ...configuredMarkets.map((value) => ({ value, label: marketLabels[value] })),
    ],
    [configuredMarkets],
  );

  useEffect(() => {
    if (market !== "all" && !configuredMarkets.includes(market)) {
      setMarketState(preferredScannerMarket(configuredMarkets));
      resetTop5();
    }
  }, [configuredMarkets, market]);

  useEffect(() => {
    // React Strict Mode intentionally performs a throwaway mount in development. Defer the
    // initial network query past that cycle so it never becomes a duplicate backend request.
    const handle = window.setTimeout(() => setDiscoveryReady(true), 50);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    setStrategy(baseStrategy);
    setSelectedMode(strategyMode);
  }, [baseStrategy, strategyMode, setSelectedMode, setStrategy]);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const discoveryQuery = useInfiniteQuery({
    queryKey: ["discoveries", query, market, preferredMarketKey, baseStrategy, strategyMode, sortBy, sector],
    queryFn: ({ pageParam, signal }) => loadDiscoveries({ q: query || undefined, kind: "stock", region: market, markets: configuredMarkets, strategy: baseStrategy, mode: strategyMode, sort: sortBy, sector, page: pageParam, limit: 40, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    staleTime: 60_000,
    refetchOnMount: false,
    retry: 1,
    enabled: discoveryReady && !detailOpen,
  });
  const items = useMemo(() => discoveryQuery.data?.pages.flatMap((page) => page.live) ?? [], [discoveryQuery.data]);
  const total = discoveryQuery.data?.pages[0]?.total ?? 0;

  const sectors = SECTORS;

  const candidates = useMemo(() => {
    // Sector filtering happens server-side (see loadDiscoveries `sector`); items are already scoped.
    const ranked = [...items];
    ranked.sort((a, b) => {
      if (sortBy === "score") return scoreForMode(b, strategyMode) - scoreForMode(a, strategyMode);
      if (sortBy === "yield") return (b.strategyScores.yield ?? 0) - (a.strategyScores.yield ?? 0);
      if (sortBy === "change") return a.changePct - b.changePct;
      return a.symbol.localeCompare(b.symbol);
    });
    return ranked;
  }, [items, sortBy, strategyMode]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && discoveryQuery.hasNextPage && !discoveryQuery.isFetchingNextPage) void discoveryQuery.fetchNextPage();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [discoveryQuery.hasNextPage, discoveryQuery.isFetchingNextPage, discoveryQuery.fetchNextPage]);

  const matches = useMemo<MatchVM[]>(() => {
    const suggested = null;
    return candidates.map((item, index) => {
      const score = scoreForMode(item, strategyMode);
      const scoreColor = score >= 85 ? "#3ecf8e" : score >= 70 ? "#f5c451" : "#8c8c95";
      const meta = [
        item.dividendYield ? `Yield ${item.dividendYield.toFixed(2)}%` : null,
        item.exDividendDate ? `Ex-div ${formatShortDate(item.exDividendDate).replace(/, \d{4}$/, "")}` : null,
      ].filter(Boolean).join(" · ");
      const signals: MatchVM["signals"] = [
        { good: item.changePct <= 0, label: item.changePct <= 0 ? "Down today" : "Positive today" },
        { good: item.strategyScores.yield >= 65, label: `Dividend income ${item.strategyScores.yield}/100` },
        { good: score >= 70, label: `${chipLabels[strategyMode]} ${score}/100` },
      ];
      const exDiv = exDivLabel(item.exDividendDate);
      if (exDiv) signals.push({ good: true, label: exDiv });
      return {
        item,
        rank: index + 1,
        score,
        scoreColor,
        marketBadge: marketBadgeFor(item),
        sectorBadge: item.sector && item.sector !== "Unknown" ? item.sector : item.exchange ?? "Equity",
        story: catalogStory(item.story ?? ""),
        signals,
        priceLabel: formatCurrency(item.price, item.currency),
        changeLabel: formatPercent(item.changePct),
        changeGood: item.changePct >= 0,
        metaLabel: meta,
        suggested,
      };
    });
  }, [candidates, strategyMode]);

  const top5 = useMemo(
    () => candidates.slice(0, 5).map((item) => ({ item, amount: 200 })),
    [candidates],
  );

  const chip = strategyMode;
  const chipOptions = chipOrder.map((key) => ({ value: key, label: chipLabels[key], icon: key, color: chipColors[key] }));

  function resetTop5() {
    setTop5State("idle");
    setTop5Applied(null);
  }

  return {
    searchQuery,
    market,
    marketOptions,
    sector,
    sectors,
    sortBy,
    chip,
    chipOptions,
    strategy: baseStrategy,
    strategyMode,
    strategyDescription: modeDescriptions[strategyMode],
    matches,
    total,
    countLabel: `${matches.length === total ? `All ${matches.length}` : `${matches.length} of ${total}`} matches · sorted by ${sortLabels[sortBy]}`,
    top5,
    top5Label: chipLabels[strategyMode],
    top5State,
    top5Applied,
    applyingTop5,
    applyTop5Error,
    accountUser: authQuery.data ?? null,
    signInOpen,
    closeSignIn: () => setSignInOpen(false),
    analysis,
    analyzing,
    analyzingSymbol,
    loadMoreRef,
    isPending: discoveryQuery.isPending,
    isError: discoveryQuery.isError,
    isFetching: discoveryQuery.isFetching,
    isUpdating: discoveryQuery.isFetching && !discoveryQuery.isPending && !discoveryQuery.isFetchingNextPage,
    isFetchingNextPage: discoveryQuery.isFetchingNextPage,
    hasNextPage: discoveryQuery.hasNextPage,
    openDetail(symbol: string) { openDetail(symbol, strategyMode); },
    setQuery(value: string) { setSearchQuery(value); resetTop5(); },
    setMarket(value: Market) { setMarketState(value); resetTop5(); },
    setSector(value: string) { setSectorState(value); resetTop5(); },
    setSortBy(value: SortKey) { setSortByState(value); resetTop5(); },
    pickChip(value: StrategyMode) {
      setStrategyMode(value);
      setStrategy(modeToBaseStrategy[value]);
      setSelectedMode(value);
      resetTop5();
    },
    async rankTop5() {
      setTop5State("loading");
      setTop5Applied(null);
      await new Promise((resolve) => setTimeout(resolve, 700));
      setTop5State("open");
    },
    async applyTop5() {
      if (!top5.length || applyingTop5) return;
      if (!authQuery.data?.id) {
        setSignInOpen(true);
        return;
      }
      setApplyingTop5(true);
      setApplyTop5Error("");
      try {
        const fx = await loadFxRates();
        for (const pick of top5) {
          if (!pick.item.price || pick.item.price <= 0) continue;
          // pick.amount is a USD-base budget; convert the native price so share count is right for THB.
          const price = priceToUsdBase(pick.item.price, pick.item.currency ?? pick.item.symbol, fx.rates);
          const boughtShares = pick.amount / price;
          await buyHolding({ symbol: pick.item.symbol, shares: boughtShares, price: pick.item.price, currency: pick.item.currency ?? undefined, strategy: baseStrategy });
        }
        const amount = top5.reduce((sum, pick) => sum + pick.amount, 0);
        setTop5Applied({ count: top5.length, amount });
        setTop5State("idle");
      } catch {
        setApplyTop5Error("Could not buy the full top-5 list — some buys may not have gone through.");
      } finally {
        setApplyingTop5(false);
      }
    },
    dismissApplied() { setTop5Applied(null); },
    async askAi(symbol: string) {
      setAnalyzing(true);
      setAnalyzingSymbol(symbol);
      try {
        setAnalysis(await summarizeStock(symbol, baseStrategy, activeAgentId, analysis?.agent?.id === activeAgentId));
      } finally {
        setAnalyzing(false);
        setAnalyzingSymbol("");
      }
    },
    retry() { void discoveryQuery.refetch(); },
  };
}

function preferredScannerMarket(configured = getLocaleSettings().preferredMarkets.map((value) => marketPreferenceFilters[value])): Market {
  if (configured.length === 1) return configured[0];
  return "all";
}

function marketBadgeFor(item: StockRecord): string {
  if (item.indexes.includes("th")) return "Thai SET";
  if (item.indexes.includes("japan")) return "Japan";
  if (item.indexes.includes("hong-kong-china")) return "Hong Kong / China";
  if (item.indexes.includes("europe")) return "Europe";
  return "US";
}

function exDivLabel(date?: string | null): string | null {
  if (!date) return null;
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days < 0 || days > 30) return null;
  if (days === 0) return "Ex-div today";
  return `Ex-div in ${days} day${days === 1 ? "" : "s"}`;
}

function catalogStory(value: string) {
  return value.replace("weekly move", "daily move").replace("daily volatility", "session move");
}

function scoreForMode(item: StockRecord, mode: StrategyMode) {
  const momentum = strategyScore(item.strategyScores.momentum);
  const value = strategyScore(item.strategyScores.capitalized);
  const longTerm = strategyScore(item.strategyScores.stable_dca);
  const income = strategyScore(item.strategyScores.yield);
  const todayImpulse = boundedScore(item.changePct, -2.5, 6.5);
  const todayPullback = boundedScore(-item.changePct, -2, 6);
  const shortTrend = boundedScore(item.monthlyTrend ?? item.weeklyTrend, -12, 24);
  const midTrend = boundedScore(item.quarterlyTrend ?? item.oneYearReturn ?? 0, -25, 70);
  const yearlyStrength = item.oneYearReturn == null ? 42 : boundedScore(item.oneYearReturn, -40, 95);
  const entryValue = item.relativePosition == null ? 42 : boundedScore(1 - item.relativePosition, 0, 1);
  const swingZone = swingTurningZoneScore(item);
  const turnSignal = turnSignalScore(item.changePct);
  const volume = item.volumeRatio == null ? 42 : boundedScore(item.volumeRatio, 0.55, 2.8);
  const calmTape = boundedScore(-Math.abs(item.changePct), -6, 0);
  const priceHeatPenalty = (
    (item.relativePosition != null && item.relativePosition > 0.78 ? 16 : 0)
    + ((item.monthlyTrend ?? item.weeklyTrend) > 18 ? 8 : 0)
    + (item.changePct > 6 ? 8 : 0)
  );

  if (mode === "swing") {
    const raw = 0.34 * swingZone + 0.18 * turnSignal + 0.16 * value + 0.12 * volume + 0.10 * momentum + 0.06 * entryValue + 0.04 * midTrend - priceHeatPenalty;
    return distributedModeScore(raw, 51, 1.58);
  }
  if (mode === "day") {
    const raw = 0.38 * todayImpulse + 0.28 * momentum + 0.16 * volume + 0.10 * shortTrend + 0.08 * calmTape;
    return distributedModeScore(raw, 50, 1.55);
  }
  if (mode === "long") {
    const raw = 0.36 * longTerm + 0.24 * value + 0.18 * income + 0.12 * calmTape + 0.10 * yearlyStrength;
    return distributedModeScore(raw, 52, 1.42);
  }
  if (mode === "value") {
    const raw = 0.48 * value + 0.22 * entryValue + 0.14 * longTerm + 0.10 * todayPullback + 0.06 * income;
    return distributedModeScore(raw, 45, 1.85);
  }
  const raw = 0.42 * momentum + 0.24 * todayImpulse + 0.14 * yearlyStrength + 0.12 * volume + 0.08 * shortTrend;
  return distributedModeScore(raw, 52, 1.58);
}

function boundedScore(value: number, low: number, high: number) {
  if (high <= low) return 50;
  return Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
}

function strategyScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 30;
}

function swingTurningZoneScore(item: StockRecord) {
  if (item.relativePosition != null) {
    const position = item.relativePosition;
    if (position >= 0.16 && position <= 0.46) return 96;
    if (position >= 0.06 && position < 0.16) return 82;
    if (position > 0.46 && position <= 0.62) return 66;
    if (position < 0.06) return 56;
    if (position <= 0.74) return 42;
    if (position <= 0.86) return 24;
    return 10;
  }
  if (item.monthlyTrend == null) {
    const longerTrend = item.oneYearReturn;
    if (longerTrend != null && longerTrend >= -12 && longerTrend <= 5) return 52;
    if (longerTrend != null && longerTrend < -12 && longerTrend >= -25) return 42;
    if (longerTrend != null && longerTrend > 5 && longerTrend <= 12) return 36;
    if (longerTrend != null && longerTrend > 12) return 24;
    return 40;
  }
  const trend = item.monthlyTrend;
  if (trend >= -10 && trend <= 4) return 78;
  if (trend > 4 && trend <= 12) return 58;
  if (trend < -10 && trend >= -22) return 52;
  if (trend > 12) return 30;
  return 24;
}

function turnSignalScore(changePct: number) {
  if (changePct >= 0.15 && changePct <= 3.2) return 94;
  if (changePct > 3.2 && changePct <= 5.5) return 66;
  if (changePct > 5.5) return 30;
  if (changePct > -1.5) return 70;
  if (changePct > -3.5) return 42;
  return 18;
}

function distributedModeScore(value: number, center = 52, spread = 1.46) {
  let shaped = center + (value - center) * spread;
  if (value >= 78) shaped += 5;
  else if (value >= 68) shaped += 2;
  else if (value <= 34) shaped -= 7;
  else if (value <= 44) shaped -= 4;
  return roundedScore(shaped);
}

function roundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
