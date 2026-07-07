import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  loadBuyTiming,
  loadDeepAnalysis,
  loadDiscoveries,
  loadPortfolio,
  loadStockDetail,
  loadStrategyPlaybook,
  loadUpwardMoves,
  summarizeStock,
  type BuyTimingResponse,
  type StockAnalysisResponse,
  type StockDetailResponse,
  type StrategyPlaybookResponse,
} from "../../lib/api";
import { N100_QUOTA_LIMIT, useWolfStore } from "../../store/useWolfStore";
import { STRAT_CARDS, type HuntTab, type N100Timeframe, type StratMode } from "./lib";

export type HuntAi = ReturnType<typeof useHuntAi>;

export function useHuntAi() {
  const [tab, setTab] = useState<HuntTab>("signals");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [stratMode, setStratMode] = useState<StratMode | null>(null);
  const [stratPrompt, setStratPrompt] = useState("");
  const [stratAnalysis, setStratAnalysis] = useState<StrategyPlaybookResponse | null>(null);
  const [stratLoading, setStratLoading] = useState(false);
  const [analystQuery, setAnalystQuery] = useState("");
  const [analystTicker, setAnalystTicker] = useState("");
  const [analystDetail, setAnalystDetail] = useState<StockDetailResponse | null>(null);
  const [analystAnalysis, setAnalystAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [intradayAnalysis, setIntradayAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [intradayAiLoading, setIntradayAiLoading] = useState(false);
  const [n100Timeframe, setN100Timeframe] = useState<N100Timeframe>("1D");
  const [n100RunKey, setN100RunKey] = useState(0);
  const [n100SyncKey, setN100SyncKey] = useState("");
  const [aiError, setAiError] = useState("");

  const deepExtras = useWolfStore((s) => s.deepExtras);
  const addDeepExtra = useWolfStore((s) => s.addDeepExtra);
  const removeDeepExtra = useWolfStore((s) => s.removeDeepExtra);
  const openDetail = useWolfStore((s) => s.openDetail);
  const premium = useWolfStore((s) => s.premium);
  const unlockPremium = useWolfStore((s) => s.unlockPremium);
  const n100QuotaUsed = useWolfStore((s) => s.n100QuotaUsed);
  const useN100Quota = useWolfStore((s) => s.useN100Quota);
  const setNext10ReportCache = useWolfStore((s) => s.setNext10ReportCache);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const holdingSymbols = portfolioQuery.data?.holdings.map((holding) => holding.symbol) ?? [];
  const symbols = Array.from(new Set([...holdingSymbols, ...deepExtras]));
  const activeTicker = selectedTicker || symbols[0] || "";

  useEffect(() => {
    if (selectedTicker && !symbols.includes(selectedTicker)) setSelectedTicker("");
  }, [selectedTicker, symbols]);

  const addQueryResult = useQuery({
    queryKey: ["hunt-add-search", addQuery],
    queryFn: () => loadDiscoveries({ q: addQuery, kind: "stock", limit: 8 }),
    enabled: addOpen && addQuery.trim().length >= 1,
  });
  const addResults = (addQueryResult.data?.live ?? []).filter((item) => !symbols.includes(item.symbol));

  const signalQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["hunt-daily-signal", symbol],
      queryFn: () => loadDeepAnalysis(symbol),
      staleTime: 300_000,
      enabled: tab === "signals",
    })),
  });

  const timingQuery = useQuery({
    queryKey: ["hunt-buy-timing", activeTicker],
    queryFn: () => loadBuyTiming(activeTicker),
    staleTime: 900_000,
    enabled: tab === "timing" && Boolean(activeTicker),
  });

  const intradayQuery = useQuery({
    queryKey: ["hunt-intraday-detail", activeTicker],
    queryFn: () => loadStockDetail(activeTicker, "momentum"),
    enabled: tab === "intraday" && Boolean(activeTicker),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });

  useEffect(() => setIntradayAnalysis(null), [activeTicker]);

  const n100CacheKey = `${activeTicker}:${n100Timeframe}`;
  const n100Cached = useWolfStore((s) => s.getNext10ReportCache(n100CacheKey));
  const n100Query = useQuery({
    queryKey: ["hunt-next-100", activeTicker, n100Timeframe, n100SyncKey, n100RunKey],
    queryFn: () => loadUpwardMoves(activeTicker, n100Timeframe),
    enabled: premium && Boolean(activeTicker) && n100RunKey > 0 && n100SyncKey === n100CacheKey,
  });
  const n100Done =
    n100RunKey > 0 &&
    n100SyncKey === n100CacheKey &&
    n100Query.isSuccess &&
    n100Query.data?.symbol === activeTicker &&
    n100Query.data?.timeframe === n100Timeframe;
  const n100AnalyzedAt = n100Query.dataUpdatedAt ? new Date(n100Query.dataUpdatedAt).toISOString() : new Date().toISOString();
  const n100Report = n100Done && n100Query.data ? { analyzedAt: n100AnalyzedAt, data: n100Query.data } : n100Cached;
  const n100QuotaLeft = N100_QUOTA_LIMIT - n100QuotaUsed;

  useEffect(() => {
    if (n100Done && n100Query.data) setNext10ReportCache(n100CacheKey, { analyzedAt: n100AnalyzedAt, data: n100Query.data });
  }, [n100AnalyzedAt, n100CacheKey, n100Done, n100Query.data, setNext10ReportCache]);

  function runN100() {
    if (n100QuotaLeft <= 0) return;
    useN100Quota();
    setN100SyncKey(n100CacheKey);
    setN100RunKey((value) => value + 1);
  }

  return {
    tab,
    setTab,
    premium,
    unlockPremium,
    aiError,

    watchlist: {
      symbols,
      holdingSymbols,
      activeTicker,
      loading: portfolioQuery.isPending,
      addOpen,
      addQuery,
      results: addResults,
      searchLoading: addQueryResult.isFetching,
      select: setSelectedTicker,
      setQuery: setAddQuery,
      toggle() { setAddOpen((open) => !open); },
      add(symbol: string) {
        addDeepExtra(symbol);
        setSelectedTicker(symbol);
        setAddOpen(false);
        setAddQuery("");
      },
      remove(symbol: string) {
        removeDeepExtra(symbol);
        if (selectedTicker === symbol) setSelectedTicker("");
      },
    },

    signals: {
      loading: portfolioQuery.isPending,
      openDetail,
      rows: symbols.map((symbol, index) => ({
        symbol,
        pending: signalQueries[index]?.isPending ?? true,
        failed: Boolean(signalQueries[index]?.isError) || (!signalQueries[index]?.isPending && !signalQueries[index]?.data),
        deep: signalQueries[index]?.data ?? null,
        retry: () => void signalQueries[index]?.refetch(),
      })),
    },

    timing: {
      loading: portfolioQuery.isPending,
      openDetail,
      rows: activeTicker
        ? [{
            symbol: activeTicker,
            pending: timingQuery.isPending,
            failed: Boolean(timingQuery.isError) || (!timingQuery.isPending && !timingQuery.data),
            timing: (timingQuery.data ?? null) as BuyTimingResponse | null,
            retry: () => void timingQuery.refetch(),
          }]
        : [],
    },

    intraday: {
      ticker: activeTicker,
      symbols,
      select: setSelectedTicker,
      detail: intradayQuery.data,
      pending: intradayQuery.isPending,
      failed: intradayQuery.isError,
      retry: () => void intradayQuery.refetch(),
      analysis: intradayAnalysis,
      aiLoading: intradayAiLoading,
      async run() {
        if (!activeTicker) return;
        setIntradayAiLoading(true);
        try {
          setIntradayAnalysis(await summarizeStock(activeTicker, "momentum"));
        } finally {
          setIntradayAiLoading(false);
        }
      },
    },

    next100: {
      ticker: activeTicker,
      timeframe: n100Timeframe,
      quotaUsed: n100QuotaUsed,
      quotaLeft: n100QuotaLeft,
      report: n100Report,
      fetching: n100Query.isFetching,
      error: n100Query.isError ? (n100Query.error as Error).message || "Could not load Next 10." : "",
      run: runN100,
      setTimeframe(timeframe: N100Timeframe) {
        setN100Timeframe(timeframe);
        setN100SyncKey("");
        setN100RunKey(0);
      },
    },

    strategy: {
      mode: stratMode,
      prompt: stratPrompt,
      setPrompt: setStratPrompt,
      analysis: stratAnalysis,
      loading: stratLoading,
      async run(mode: StratMode) {
        setStratMode(mode);
        setStratAnalysis(null);
        setStratLoading(true);
        setAiError("");
        try {
          const card = STRAT_CARDS.find((c) => c.key === mode);
          const strategy = stratPrompt.trim() || (card ? `${card.label}: ${card.subtitle}` : mode);
          setStratAnalysis(await loadStrategyPlaybook({ strategy, region: "all", limit: 5, candidateLimit: 40 }));
        } catch {
          setAiError("Strategy AI could not rank the stock universe for this strategy.");
        } finally {
          setStratLoading(false);
        }
      },
    },

    analyst: {
      query: analystQuery,
      setQuery: setAnalystQuery,
      ticker: analystTicker,
      holdingSymbols,
      detail: analystDetail,
      analysis: analystAnalysis,
      loading: analystLoading,
      async run(ticker: string) {
        const sym = ticker.trim().toUpperCase();
        if (!sym) return;
        setAnalystTicker(sym);
        setAnalystDetail(null);
        setAnalystAnalysis(null);
        setAnalystLoading(true);
        setAiError("");
        try {
          const [detail, analysis] = await Promise.all([
            loadStockDetail(sym, "capitalized"),
            summarizeStock(sym, "stable_dca"),
          ]);
          setAnalystDetail(detail);
          setAnalystAnalysis(analysis);
        } catch {
          setAiError("Stock Analyst could not generate a report for this ticker.");
        } finally {
          setAnalystLoading(false);
        }
      },
    },
  };
}
