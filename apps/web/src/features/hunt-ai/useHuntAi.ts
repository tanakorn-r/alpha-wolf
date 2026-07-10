import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  loadBuyTiming,
  loadDiscoveries,
  loadPortfolio,
  loadStockDetail,
  loadStrategyPlaybook,
  loadUpwardMoves,
  loadValuationVerdict,
  summarizeStock,
  type BuyTimingResponse,
  type StockAnalysisResponse,
  type StockDetailResponse,
  type StrategyPlaybookResponse,
  type ValuationVerdictResponse,
} from "../../lib/api";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { N100_QUOTA_LIMIT, useWolfStore } from "../../store/useWolfStore";
import { STRAT_CARDS, type HuntTab, type N100Timeframe, type StratMode } from "./lib";

export type HuntAi = ReturnType<typeof useHuntAi>;

type AnalystReport = {
  detail: StockDetailResponse;
  analysis: StockAnalysisResponse;
};

type AgentStamped = {
  agent?: { id?: string | null } | null;
};

function matchesAgent<T extends AgentStamped | null | undefined>(data: T, agentId: string) {
  return data?.agent?.id === agentId;
}

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
  const [valuationRunKey, setValuationRunKey] = useState(0);
  const [valuationSyncTicker, setValuationSyncTicker] = useState("");
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
  const getHuntAiCache = useWolfStore((s) => s.getHuntAiCache);
  const setHuntAiCache = useWolfStore((s) => s.setHuntAiCache);
  const activeAgentId = useWolfStore((s) => s.activeAgentId);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const holdingSymbols = portfolioQuery.data?.holdings.map((holding) => holding.symbol) ?? [];
  const symbols = Array.from(new Set([...holdingSymbols, ...deepExtras]));
  const activeTicker = selectedTicker || symbols[0] || "";
  const debouncedAddQuery = useDebouncedValue(addQuery.trim(), 350);

  useEffect(() => {
    if (selectedTicker && !symbols.includes(selectedTicker)) setSelectedTicker("");
  }, [selectedTicker, symbols]);

  useEffect(() => {
    setStratAnalysis(null);
    setAnalystAnalysis(null);
    setAnalystDetail(null);
    setIntradayAnalysis(null);
    setValuationRunKey(0);
    setValuationSyncTicker("");
    setN100RunKey(0);
    setN100SyncKey("");
  }, [activeAgentId]);

  const addQueryResult = useQuery({
    queryKey: ["hunt-add-search", debouncedAddQuery],
    queryFn: () => loadDiscoveries({ q: debouncedAddQuery, kind: "stock", limit: 8 }),
    enabled: addOpen && debouncedAddQuery.length >= 1,
  });
  const addResults = (addQueryResult.data?.live ?? []).filter((item) => !symbols.includes(item.symbol));

  const valuationQuery = useQuery({
    queryKey: ["hunt-valuation-verdict", activeTicker, activeAgentId, valuationRunKey],
    queryFn: () => loadValuationVerdict(activeTicker, "stable_dca", activeAgentId),
    staleTime: 900_000,
    enabled: tab === "signals" && Boolean(activeTicker) && valuationRunKey > 0 && valuationSyncTicker === activeTicker,
  });
  const valuationCacheKey = `signals:${activeTicker}:stable_dca:${activeAgentId}`;
  const valuationCached = getHuntAiCache<ValuationVerdictResponse>(valuationCacheKey);
  const valuationDone =
    valuationRunKey > 0 &&
    valuationSyncTicker === activeTicker &&
    valuationQuery.isSuccess &&
    valuationQuery.data?.symbol === activeTicker &&
    matchesAgent(valuationQuery.data, activeAgentId);
  const valuationAnalyzedAt = valuationQuery.dataUpdatedAt ? new Date(valuationQuery.dataUpdatedAt).toISOString() : new Date().toISOString();
  const valuationReport = valuationDone && valuationQuery.data
    ? { analyzedAt: valuationAnalyzedAt, data: valuationQuery.data }
    : matchesAgent(valuationCached?.data, activeAgentId) ? valuationCached : undefined;

  useEffect(() => {
    if (valuationDone && valuationQuery.data) {
      setHuntAiCache(valuationCacheKey, { analyzedAt: valuationAnalyzedAt, data: valuationQuery.data });
    }
  }, [setHuntAiCache, valuationAnalyzedAt, valuationCacheKey, valuationDone, valuationQuery.data]);

  const timingQuery = useQuery({
    queryKey: ["hunt-buy-timing", activeTicker, activeAgentId],
    queryFn: () => loadBuyTiming(activeTicker, activeAgentId),
    staleTime: 900_000,
    enabled: tab === "timing" && Boolean(activeTicker),
  });
  const timingCacheKey = `buy-timing:${activeTicker}:${activeAgentId}`;
  const timingCached = getHuntAiCache<BuyTimingResponse>(timingCacheKey);
  const timingDone = timingQuery.isSuccess && timingQuery.data?.symbol === activeTicker && matchesAgent(timingQuery.data, activeAgentId);
  const timingAnalyzedAt = timingQuery.dataUpdatedAt ? new Date(timingQuery.dataUpdatedAt).toISOString() : new Date().toISOString();
  const timingReport = timingDone && timingQuery.data
    ? { analyzedAt: timingAnalyzedAt, data: timingQuery.data }
    : matchesAgent(timingCached?.data, activeAgentId) ? timingCached : undefined;

  useEffect(() => {
    if (timingDone && timingQuery.data) {
      setHuntAiCache(timingCacheKey, { analyzedAt: timingAnalyzedAt, data: timingQuery.data });
    }
  }, [setHuntAiCache, timingAnalyzedAt, timingCacheKey, timingDone, timingQuery.data]);

  const intradayQuery = useQuery({
    queryKey: ["hunt-intraday-detail", activeTicker],
    queryFn: () => loadStockDetail(activeTicker, "momentum"),
    enabled: tab === "intraday" && Boolean(activeTicker),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });

  useEffect(() => setIntradayAnalysis(null), [activeTicker, activeAgentId]);
  useEffect(() => {
    setAnalystTicker("");
    setAnalystDetail(null);
    setAnalystAnalysis(null);
  }, [activeTicker]);
  const analystCacheKey = `analyst:${activeTicker}:${activeAgentId}`;
  const analystCached = getHuntAiCache<AnalystReport>(analystCacheKey);
  const analystLocalReport =
    analystTicker === activeTicker && analystDetail && analystAnalysis && matchesAgent(analystAnalysis, activeAgentId)
      ? { analyzedAt: new Date().toISOString(), data: { detail: analystDetail, analysis: analystAnalysis } }
      : null;
  const analystReport = analystLocalReport ?? (matchesAgent(analystCached?.data.analysis, activeAgentId) ? analystCached : undefined);

  const intradayAnalysisCacheKey = `intraday-ai:${activeTicker}:${activeAgentId}`;
  const intradayAnalysisCached = getHuntAiCache<StockAnalysisResponse>(intradayAnalysisCacheKey);
  const intradayAnalysisReport = matchesAgent(intradayAnalysis, activeAgentId)
    ? { analyzedAt: new Date().toISOString(), data: intradayAnalysis }
    : matchesAgent(intradayAnalysisCached?.data, activeAgentId) ? intradayAnalysisCached : undefined;

  const n100CacheKey = `${activeTicker}:${n100Timeframe}:${activeAgentId}`;
  const n100Cached = useWolfStore((s) => s.getNext10ReportCache(n100CacheKey));
  const n100Query = useQuery({
    queryKey: ["hunt-next-100", activeTicker, n100Timeframe, activeAgentId, n100SyncKey, n100RunKey],
    queryFn: () => loadUpwardMoves(activeTicker, n100Timeframe, activeAgentId),
    enabled: premium && Boolean(activeTicker) && n100RunKey > 0 && n100SyncKey === n100CacheKey,
  });
  const n100Done =
    n100RunKey > 0 &&
    n100SyncKey === n100CacheKey &&
    n100Query.isSuccess &&
    n100Query.data?.symbol === activeTicker &&
    n100Query.data?.timeframe === n100Timeframe &&
    matchesAgent(n100Query.data, activeAgentId);
  const n100AnalyzedAt = n100Query.dataUpdatedAt ? new Date(n100Query.dataUpdatedAt).toISOString() : new Date().toISOString();
  const n100Report = n100Done && n100Query.data
    ? { analyzedAt: n100AnalyzedAt, data: n100Query.data }
    : matchesAgent(n100Cached?.data, activeAgentId) ? n100Cached : undefined;
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
    activeAgentId,

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
      ticker: activeTicker,
      symbols,
      loading: portfolioQuery.isPending,
      openDetail,
      verdict: (valuationReport?.data ?? null) as ValuationVerdictResponse | null,
      analyzedAt: valuationReport?.analyzedAt ?? "",
      pending: !valuationReport?.data && valuationQuery.isPending && valuationRunKey > 0 && valuationSyncTicker === activeTicker,
      fetching: valuationQuery.isFetching,
      failed: Boolean(valuationQuery.isError) && !valuationReport?.data,
      hasRun: Boolean(valuationReport?.data),
      run() {
        if (!activeTicker) return;
        setValuationSyncTicker(activeTicker);
        setValuationRunKey((value) => value + 1);
      },
      retry() {
        if (!activeTicker) return;
        setValuationSyncTicker(activeTicker);
        setValuationRunKey((value) => value + 1);
      },
    },

    timing: {
      loading: portfolioQuery.isPending,
      openDetail,
      rows: activeTicker
        ? [{
            symbol: activeTicker,
            pending: !timingReport?.data && timingQuery.isPending,
            fetching: timingQuery.isFetching,
            failed: Boolean(timingQuery.isError) && !timingReport?.data,
            timing: (timingReport?.data ?? null) as BuyTimingResponse | null,
            analyzedAt: timingReport?.analyzedAt ?? "",
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
      analysis: intradayAnalysisReport?.data ?? null,
      analyzedAt: intradayAnalysisReport?.analyzedAt ?? "",
      aiLoading: intradayAiLoading,
      async run() {
        if (!activeTicker) return;
        setIntradayAiLoading(true);
        try {
          const analysis = await summarizeStock(activeTicker, "momentum", activeAgentId);
          setIntradayAnalysis(analysis);
          setHuntAiCache(intradayAnalysisCacheKey, { analyzedAt: new Date().toISOString(), data: analysis });
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
      analysis: matchesAgent(stratAnalysis, activeAgentId) ? stratAnalysis : null,
      loading: stratLoading,
      async run(mode: StratMode) {
        setStratMode(mode);
        setStratAnalysis(null);
        setStratLoading(true);
        setAiError("");
        try {
          const card = STRAT_CARDS.find((c) => c.key === mode);
          const strategy = stratPrompt.trim() || (card ? `${card.label}: ${card.subtitle}` : mode);
          setStratAnalysis(await loadStrategyPlaybook({ strategy, region: "all", limit: 5, candidateLimit: 40, agent: activeAgentId }));
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
      ticker: analystTicker || activeTicker,
      activeTicker,
      holdingSymbols,
      detail: analystReport?.data.detail ?? null,
      analysis: analystReport?.data.analysis ?? null,
      analyzedAt: analystReport?.analyzedAt ?? "",
      loading: analystLoading,
      async run(ticker?: string) {
        const sym = (ticker || activeTicker).trim().toUpperCase();
        if (!sym) return;
        setAnalystTicker(sym);
        setAnalystDetail(null);
        setAnalystAnalysis(null);
        setAnalystLoading(true);
        setAiError("");
        try {
          const [detail, analysis] = await Promise.all([
            loadStockDetail(sym, "capitalized"),
            summarizeStock(sym, "stable_dca", activeAgentId),
          ]);
          setAnalystDetail(detail);
          setAnalystAnalysis(analysis);
          setHuntAiCache(`analyst:${sym}:${activeAgentId}`, { analyzedAt: new Date().toISOString(), data: { detail, analysis } });
        } catch {
          setAiError("Stock Analyst could not generate a report for this ticker.");
        } finally {
          setAnalystLoading(false);
        }
      },
    },
  };
}
