import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPortfolioWatchlistSymbols,
  deletePortfolioWatchlistSymbol,
  loadBuyTiming,
  loadAuthUser,
  loadDiscoveries,
  loadLatestAiResult,
  loadAnalystReport,
  redeemPremiumPromo,
  loadPortfolio,
  loadPortfolioWatchlist,
  loadStockDetail,
  loadTechnicalAnalysis,
  loadStrategyPlaybook,
  loadUpwardMoves,
  loadValuationVerdict,
  summarizeStock,
  type BuyTimingResponse,
  type AnalystBriefResponse,
  type StockAnalysisResponse,
  type StockDetailResponse,
  type StrategyPlaybookResponse,
  type TechnicalAnalysisResponse,
  type UpwardMovesResponse,
  type ValuationVerdictResponse,
} from "../../lib/api";
import { DISCOVERY_DEBOUNCE_MS, useDebouncedValue } from "../../lib/useDebouncedValue";
import { useWolfStore } from "../../store/useWolfStore";
import { STRAT_CARDS, type HuntTab, type N100Timeframe, type StratMode } from "./lib";

export type HuntAi = ReturnType<typeof useHuntAi>;

type AnalystReport = {
  detail: StockDetailResponse;
  analysis: AnalystBriefResponse;
};

type AgentStamped = {
  agent?: { id?: string | null } | null;
};

type PersistedStrategy = { mode: StratMode; prompt: string; analysis: StrategyPlaybookResponse };
type PersistedReplay = { jobId: string };

// Bump when persona reasoning changes so persisted browser reports cannot make a newly fixed
// Agent appear to repeat an older, generic answer.
const AGENT_REASONING_CACHE_VERSION = "persona-v24-nadia-convex-hedging";

function matchesAgent<T extends AgentStamped | null | undefined>(data: T, agentId: string) {
  return data?.agent?.id === agentId;
}

export function useHuntAi() {
  const queryClient = useQueryClient();
  const [tab, setTabState] = useState<HuntTab>("signals");
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [accountSignInOpen, setAccountSignInOpen] = useState(false);
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
  const [analystAnalysis, setAnalystAnalysis] = useState<AnalystBriefResponse | null>(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystStage, setAnalystStage] = useState<"market_data" | "analysis">("market_data");
  const [technicalAnalysis, setTechnicalAnalysis] = useState<TechnicalAnalysisResponse | null>(null);
  const [technicalAiLoading, setTechnicalAiLoading] = useState(false);
  const [intradayAnalysis, setIntradayAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [intradayAiLoading, setIntradayAiLoading] = useState(false);
  const [n100Timeframe, setN100Timeframe] = useState<N100Timeframe>("1D");
  const [n100RunKey, setN100RunKey] = useState(0);
  const [n100Force, setN100Force] = useState(false);
  const [n100SyncKey, setN100SyncKey] = useState("");
  const [valuationRunKey, setValuationRunKey] = useState(0);
  const [valuationForce, setValuationForce] = useState(false);
  const [valuationSyncTicker, setValuationSyncTicker] = useState("");
  const [timingRunKey, setTimingRunKey] = useState(0);
  const [timingForce, setTimingForce] = useState(false);
  const [timingRunTarget, setTimingRunTarget] = useState("");
  const [aiError, setAiError] = useState("");
  const [activatedTabs, setActivatedTabs] = useState<ReadonlySet<HuntTab>>(() => new Set());

  const openDetail = useWolfStore((s) => s.openDetail);
  const setNext10ReportCache = useWolfStore((s) => s.setNext10ReportCache);
  const getHuntAiCache = useWolfStore((s) => s.getHuntAiCache);
  const setHuntAiCache = useWolfStore((s) => s.setHuntAiCache);
  const activeAgentId = useWolfStore((s) => s.activeAgentId);

  const authQuery = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const accountScope = authQuery.data?.id ? `user:${authQuery.data.id}` : "signed-out";
  const authenticated = Boolean(authQuery.data?.id);
  const premium = Boolean(authQuery.data?.proActive);
  const n100QuotaUsed = authQuery.data?.aiUsage?.used ?? 0;
  const strategyCacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:strategy:last:${activeAgentId}`;
  const strategyCached = getHuntAiCache<PersistedStrategy>(strategyCacheKey);
  const savedStrategyQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "strategy", activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<StrategyPlaybookResponse>({ feature: "strategy", subject: "universe", agent: activeAgentId, variantPrefix: "v7:", signal }),
    enabled: authenticated && premium && tab === "strategy" && activatedTabs.has("strategy"),
    staleTime: 30_000,
    retry: 0,
  });
  const redeemPremiumMutation = useMutation({
    mutationFn: redeemPremiumPromo,
    onSuccess: (user) => {
      if (user) queryClient.setQueryData(["auth-user"], user);
      setTrialModalOpen(false);
    },
    onError: (error) => setAiError(error instanceof Error ? error.message : "Could not activate Pro."),
  });
  const portfolioQuery = useQuery({
    queryKey: ["portfolio", accountScope],
    queryFn: loadPortfolio,
    enabled: authenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const watchlistQuery = useQuery({ queryKey: ["portfolio-watchlist", accountScope], queryFn: loadPortfolioWatchlist, enabled: authenticated });
  const addWatchlistMutation = useMutation({
    mutationFn: addPortfolioWatchlistSymbols,
    onSuccess: (nextSymbols) => queryClient.setQueryData(["portfolio-watchlist", accountScope], nextSymbols),
    onError: (error, addedSymbols) => {
      queryClient.setQueryData<string[]>(["portfolio-watchlist", accountScope], (current = []) => current.filter((symbol) => !addedSymbols.includes(symbol)));
      setAiError(error instanceof Error ? error.message : "Could not save this asset to your watchlist.");
    },
  });
  const removeWatchlistMutation = useMutation({
    mutationFn: deletePortfolioWatchlistSymbol,
    onSuccess: (_data, removedSymbol) => {
      queryClient.setQueryData<string[]>(["portfolio-watchlist", accountScope], (current = []) => current.filter((symbol) => symbol !== removedSymbol));
    },
    onError: (error, removedSymbol) => {
      queryClient.setQueryData<string[]>(["portfolio-watchlist", accountScope], (current = []) => Array.from(new Set([...current, removedSymbol])));
      setAiError(error instanceof Error ? error.message : "Could not remove this asset from your watchlist.");
    },
  });
  const holdingSymbols = portfolioQuery.data?.holdings.map((holding) => holding.symbol) ?? [];
  const watchingSymbols = watchlistQuery.data ?? [];
  const symbols = Array.from(new Set([...holdingSymbols, ...watchingSymbols]));
  const activeTicker = selectedTicker || symbols[0] || "";
  const replayCacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:replay:${activeTicker}:${activeAgentId}`;
  const replayCached = getHuntAiCache<PersistedReplay>(replayCacheKey);
  const debouncedAddQuery = useDebouncedValue(addQuery.trim(), DISCOVERY_DEBOUNCE_MS);

  useEffect(() => {
    if (addQuery.trim() !== debouncedAddQuery) {
      void queryClient.cancelQueries({ queryKey: ["hunt-add-search"] });
    }
  }, [addQuery, debouncedAddQuery, queryClient]);

  useEffect(() => {
    if (selectedTicker && !symbols.includes(selectedTicker)) setSelectedTicker("");
  }, [selectedTicker, symbols]);

  useEffect(() => {
    setStratAnalysis(null);
    setAnalystAnalysis(null);
    setAnalystDetail(null);
    setIntradayAnalysis(null);
    setTechnicalAnalysis(null);
    setValuationRunKey(0);
    setValuationSyncTicker("");
    setTimingRunKey(0);
    setTimingRunTarget("");
    setN100RunKey(0);
    setN100SyncKey("");
  }, [activeAgentId]);

  useEffect(() => {
    const saved = strategyCached?.data;
    if (saved && matchesAgent(saved.analysis, activeAgentId)) {
      setStratMode(saved.mode);
      setStratPrompt(saved.prompt);
      setStratAnalysis(saved.analysis);
    }
  }, [activeAgentId, accountScope]);

  useEffect(() => {
    const saved = savedStrategyQuery.data;
    if (!saved || !matchesAgent(saved, activeAgentId)) return;
    setStratAnalysis(saved);
    setStratPrompt(saved.strategy ?? "");
  }, [activeAgentId, savedStrategyQuery.data]);

  const addQueryResult = useQuery({
    queryKey: ["hunt-add-search", debouncedAddQuery],
    queryFn: ({ signal }) => loadDiscoveries({ q: debouncedAddQuery, kind: "all", limit: 8, signal }),
    enabled: addOpen && debouncedAddQuery.length >= 2,
    staleTime: 60_000,
    retry: 0,
  });
  const addResults = (addQueryResult.data?.live ?? []).filter((item) => !symbols.includes(item.symbol));
  const savedValuationQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "valuation", activeTicker, activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<ValuationVerdictResponse>({ feature: "valuation", subject: activeTicker, agent: activeAgentId, variantPrefix: "v26:stable_dca", signal }),
    enabled: authenticated && tab === "signals" && activatedTabs.has("signals") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const valuationQuery = useQuery({
    queryKey: ["hunt-valuation-verdict", "character-quote-v6-today-tape", activeTicker, activeAgentId, valuationRunKey],
    queryFn: () => loadValuationVerdict(activeTicker, "stable_dca", activeAgentId, valuationForce),
    staleTime: 900_000,
    enabled: tab === "signals" && Boolean(activeTicker) && valuationRunKey > 0 && valuationSyncTicker === activeTicker,
  });
  const valuationCacheKey = `${accountScope}:character-quote-v6-today-tape:${AGENT_REASONING_CACHE_VERSION}:signals:${activeTicker}:stable_dca:${activeAgentId}`;
  const valuationCached = getHuntAiCache<ValuationVerdictResponse>(valuationCacheKey);
  const valuationDone =
    valuationRunKey > 0 &&
    valuationSyncTicker === activeTicker &&
    valuationQuery.isSuccess &&
    valuationQuery.data?.symbol === activeTicker &&
    matchesAgent(valuationQuery.data, activeAgentId);
  const valuationAnalyzedAt = valuationQuery.data?.generatedAt ?? (valuationQuery.dataUpdatedAt ? new Date(valuationQuery.dataUpdatedAt).toISOString() : new Date().toISOString());
  const valuationReport = valuationDone && valuationQuery.data
    ? { analyzedAt: valuationAnalyzedAt, data: valuationQuery.data }
    : matchesAgent(savedValuationQuery.data, activeAgentId) ? { analyzedAt: savedValuationQuery.data!.generatedAt ?? "", data: savedValuationQuery.data! }
    : matchesAgent(valuationCached?.data, activeAgentId) ? valuationCached : undefined;

  useEffect(() => {
    if (valuationDone && valuationQuery.data) {
      setHuntAiCache(valuationCacheKey, { analyzedAt: valuationAnalyzedAt, data: valuationQuery.data });
      void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    }
  }, [setHuntAiCache, valuationAnalyzedAt, valuationCacheKey, valuationDone, valuationQuery.data]);

  const savedTimingQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "buy-timing", activeTicker, activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<BuyTimingResponse>({ feature: "buy-timing", subject: activeTicker, agent: activeAgentId, variantPrefix: "v62:stable_dca", signal }),
    enabled: authenticated && premium && tab === "timing" && activatedTabs.has("timing") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const timingQuery = useQuery({
    queryKey: ["hunt-buy-timing", "live-current-month-v21", AGENT_REASONING_CACHE_VERSION, activeTicker, activeAgentId, timingRunKey],
    queryFn: () => loadBuyTiming(activeTicker, activeAgentId, timingForce),
    staleTime: 900_000,
    retry: 0,
    enabled: tab === "timing" && Boolean(activeTicker) && timingRunKey > 0 && timingRunTarget === `${activeTicker}:${activeAgentId}`,
  });
  const timingCacheKey = `${accountScope}:live-current-month-v21:${AGENT_REASONING_CACHE_VERSION}:buy-timing:${activeTicker}:${activeAgentId}`;
  const timingCached = getHuntAiCache<BuyTimingResponse>(timingCacheKey);
  const timingResultMatches = timingQuery.data?.symbol === activeTicker && matchesAgent(timingQuery.data, activeAgentId);
  const timingRequestActive = timingRunKey > 0 && timingRunTarget === `${activeTicker}:${activeAgentId}`;
  const timingDone = timingRequestActive && timingQuery.isSuccess && timingResultMatches;
  const timingAnalyzedAt = timingQuery.data?.generatedAt ?? (timingQuery.dataUpdatedAt ? new Date(timingQuery.dataUpdatedAt).toISOString() : new Date().toISOString());
  const timingReport = timingDone && timingQuery.data
    ? { analyzedAt: timingAnalyzedAt, data: timingQuery.data }
    : savedTimingQuery.data?.symbol === activeTicker && matchesAgent(savedTimingQuery.data, activeAgentId) ? { analyzedAt: savedTimingQuery.data.generatedAt ?? "", data: savedTimingQuery.data }
    : matchesAgent(timingCached?.data, activeAgentId) ? timingCached : undefined;

  useEffect(() => {
    if (timingDone && timingQuery.data) {
      setHuntAiCache(timingCacheKey, { analyzedAt: timingAnalyzedAt, data: timingQuery.data });
      void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    }
  }, [setHuntAiCache, timingAnalyzedAt, timingCacheKey, timingDone, timingQuery.data]);

  const intradayQuery = useQuery({
    queryKey: ["hunt-intraday-detail", activeTicker],
    queryFn: () => loadStockDetail(activeTicker, "momentum"),
    enabled: tab === "intraday" && Boolean(activeTicker),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
  const technicalDetailQuery = useQuery({
    queryKey: ["hunt-technical-detail", activeTicker],
    queryFn: () => loadStockDetail(activeTicker, "momentum"),
    enabled: tab === "technical" && Boolean(activeTicker),
    staleTime: 300_000,
  });
  const savedIntradayQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "stock-analysis", activeTicker, activeAgentId, "momentum"],
    queryFn: ({ signal }) => loadLatestAiResult<StockAnalysisResponse>({ feature: "stock-analysis", subject: activeTicker, agent: activeAgentId, variantPrefix: "v29:momentum:", signal }),
    enabled: authenticated && premium && tab === "intraday" && activatedTabs.has("intraday") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const savedTechnicalQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "technical", activeTicker, activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<TechnicalAnalysisResponse>({ feature: "technical", subject: activeTicker, agent: activeAgentId, variantPrefix: "v12:", signal }),
    enabled: authenticated && premium && tab === "technical" && activatedTabs.has("technical") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const savedAnalystQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "analyst-report", activeTicker, activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<AnalystBriefResponse>({ feature: "analyst-report", subject: activeTicker, agent: activeAgentId, variantPrefix: "v13:capitalized:", signal }),
    enabled: authenticated && premium && tab === "analyst" && activatedTabs.has("analyst") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const savedAnalystDetailQuery = useQuery({
    queryKey: ["saved-ai-detail", activeTicker, "capitalized"],
    queryFn: () => loadStockDetail(activeTicker, "capitalized"),
    enabled: premium && tab === "analyst" && activatedTabs.has("analyst") && Boolean(savedAnalystQuery.data && activeTicker), staleTime: 180_000, retry: 0,
  });

  useEffect(() => setIntradayAnalysis(null), [activeTicker, activeAgentId]);
  useEffect(() => {
    setAnalystTicker("");
    setAnalystDetail(null);
    setAnalystAnalysis(null);
    setTechnicalAnalysis(null);
    setAiError("");
  }, [activeTicker]);
  const analystCacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:analyst:${activeTicker}:${activeAgentId}`;
  const analystCached = getHuntAiCache<AnalystReport>(analystCacheKey);
  const analystLocalReport =
    analystTicker === activeTicker && analystDetail && analystAnalysis && matchesAgent(analystAnalysis, activeAgentId)
      ? { analyzedAt: analystAnalysis.generatedAt ?? new Date().toISOString(), data: { detail: analystDetail, analysis: analystAnalysis } }
      : null;
  const analystSavedReport = savedAnalystQuery.data && savedAnalystDetailQuery.data && matchesAgent(savedAnalystQuery.data, activeAgentId)
    ? { analyzedAt: savedAnalystQuery.data.generatedAt ?? "", data: { detail: savedAnalystDetailQuery.data, analysis: savedAnalystQuery.data } }
    : undefined;
  const analystReport = analystLocalReport ?? analystSavedReport ?? (matchesAgent(analystCached?.data.analysis, activeAgentId) ? analystCached : undefined);

  const intradayAnalysisCacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:intraday-ai:${activeTicker}:${activeAgentId}`;
  const intradayAnalysisCached = getHuntAiCache<StockAnalysisResponse>(intradayAnalysisCacheKey);
  const intradayAnalysisReport = matchesAgent(intradayAnalysis, activeAgentId)
    ? { analyzedAt: intradayAnalysis!.generatedAt ?? new Date().toISOString(), data: intradayAnalysis! }
    : matchesAgent(savedIntradayQuery.data, activeAgentId) ? { analyzedAt: savedIntradayQuery.data!.generatedAt ?? "", data: savedIntradayQuery.data! }
    : matchesAgent(intradayAnalysisCached?.data, activeAgentId) ? intradayAnalysisCached : undefined;
  const technicalCacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:technical-v2-symbol:${activeTicker}:${activeAgentId}`;
  const technicalCached = getHuntAiCache<TechnicalAnalysisResponse>(technicalCacheKey);
  const technicalReport = technicalAnalysis?.symbol === activeTicker && matchesAgent(technicalAnalysis, activeAgentId)
    ? technicalAnalysis
    : savedTechnicalQuery.data?.symbol === activeTicker && matchesAgent(savedTechnicalQuery.data, activeAgentId) ? savedTechnicalQuery.data
    : technicalCached?.data.symbol === activeTicker && matchesAgent(technicalCached.data, activeAgentId) ? technicalCached.data : null;

  const n100CacheKey = `${accountScope}:${AGENT_REASONING_CACHE_VERSION}:${activeTicker}:${n100Timeframe}:${activeAgentId}`;
  const n100Cached = useWolfStore((s) => s.getNext10ReportCache(n100CacheKey));
  const savedN100Query = useQuery({
    queryKey: ["saved-ai", accountScope, "next-10", activeTicker, activeAgentId, n100Timeframe],
    queryFn: ({ signal }) => loadLatestAiResult<UpwardMovesResponse>({ feature: "next-10", subject: activeTicker, agent: activeAgentId, variantPrefix: `v20:${n100Timeframe}:capitalized`, signal }),
    enabled: authenticated && premium && tab === "n100" && activatedTabs.has("n100") && Boolean(activeTicker), staleTime: 30_000, retry: 0,
  });
  const n100Query = useQuery({
    queryKey: ["hunt-next-100", activeTicker, n100Timeframe, activeAgentId, n100SyncKey, n100RunKey],
    queryFn: () => loadUpwardMoves(activeTicker, n100Timeframe, activeAgentId, n100Force),
    enabled: premium && Boolean(activeTicker) && n100RunKey > 0 && n100SyncKey === n100CacheKey,
  });
  const n100Done =
    n100RunKey > 0 &&
    n100SyncKey === n100CacheKey &&
    n100Query.isSuccess &&
    n100Query.data?.symbol === activeTicker &&
    n100Query.data?.timeframe === n100Timeframe &&
    matchesAgent(n100Query.data, activeAgentId);
  const n100AnalyzedAt = n100Query.data?.generatedAt ?? (n100Query.dataUpdatedAt ? new Date(n100Query.dataUpdatedAt).toISOString() : new Date().toISOString());
  const n100Report = n100Done && n100Query.data
    ? { analyzedAt: n100AnalyzedAt, data: n100Query.data }
    : matchesAgent(savedN100Query.data, activeAgentId) ? { analyzedAt: savedN100Query.data!.generatedAt ?? "", data: savedN100Query.data! }
    : matchesAgent(n100Cached?.data, activeAgentId) ? n100Cached : undefined;
  const n100QuotaLeft = authQuery.data?.aiUsage?.remaining ?? 0;

  useEffect(() => {
    if (n100Done && n100Query.data) {
      setNext10ReportCache(n100CacheKey, { analyzedAt: n100AnalyzedAt, data: n100Query.data });
      void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    }
  }, [n100AnalyzedAt, n100CacheKey, n100Done, n100Query.data, setNext10ReportCache]);

  function runN100(force = false) {
    if (n100QuotaLeft <= 0) return;
    setN100Force(force);
    setN100SyncKey(n100CacheKey);
    setN100RunKey((value) => value + 1);
  }

  const premiumTabs = new Set<HuntTab>(["brief", "timing", "technical", "replay", "analyst"]);
  function setTab(next: HuntTab) {
    setAiError("");
    void queryClient.cancelQueries({ queryKey: ["saved-ai"] });
    void queryClient.cancelQueries({ queryKey: ["saved-ai-detail"] });
    setActivatedTabs((current) => current.has(next) ? current : new Set([...current, next]));
    setTabState(next);
    if (premiumTabs.has(next) && !premium) setTrialModalOpen(true);
  }

  function syncTab(next: HuntTab) {
    setAiError("");
    setTabState(next);
  }

  return {
    tab,
    setTab,
    syncTab,
    premium,
    trialModalOpen,
    closeTrialModal: () => setTrialModalOpen(false),
    aiUsage: authQuery.data?.aiUsage ?? { used: 0, tokens: premium ? 100 : 3, remaining: premium ? 100 : 3 },
    premiumExpiresAt: authQuery.data?.premiumExpiresAt ?? null,
    signedIn: authenticated,
    accountUser: authQuery.data ?? null,
    accountSignInOpen,
    closeAccountSignIn: () => setAccountSignInOpen(false),
    redeemPremium: () => redeemPremiumMutation.mutate(),
    redeemingPremium: redeemPremiumMutation.isPending,
    unlockPremium: () => setTrialModalOpen(true),
    aiError,
    activeAgentId,

    watchlist: {
      symbols,
      holdingSymbols,
      activeTicker,
      loading: authQuery.isPending || (authenticated && portfolioQuery.isPending && watchlistQuery.isPending),
      addOpen,
      addQuery,
      results: addResults,
      searchLoading: addQueryResult.isFetching,
      select: setSelectedTicker,
      setQuery: setAddQuery,
      toggle() {
        if (!authenticated) {
          setAccountSignInOpen(true);
          return;
        }
        setAddOpen((open) => !open);
      },
      add(symbol: string) {
        if (!authenticated) {
          setAccountSignInOpen(true);
          return;
        }
        const normalized = symbol.trim().toUpperCase();
        queryClient.setQueryData<string[]>(["portfolio-watchlist", accountScope], (current = []) => Array.from(new Set([...current, normalized])));
        addWatchlistMutation.mutate([normalized]);
        setSelectedTicker(normalized);
        setAddOpen(false);
        setAddQuery("");
      },
      remove(symbol: string) {
        if (!authenticated) {
          setAccountSignInOpen(true);
          return;
        }
        queryClient.setQueryData<string[]>(["portfolio-watchlist", accountScope], (current = []) => current.filter((item) => item !== symbol));
        removeWatchlistMutation.mutate(symbol);
        if (selectedTicker === symbol) setSelectedTicker("");
      },
    },

    signals: {
      ticker: activeTicker,
      symbols,
      // Portfolio and watchlist are independent. Render as soon as either source is ready;
      // a slow holdings request must not block usable watchlist symbols or saved local cards.
      loading: authQuery.isPending || (authenticated && portfolioQuery.isPending && watchlistQuery.isPending),
      openDetail,
      verdict: (valuationReport?.data ?? null) as ValuationVerdictResponse | null,
      analyzedAt: valuationReport?.analyzedAt ?? "",
      pending: !valuationReport?.data && valuationQuery.isFetching && valuationRunKey > 0 && valuationSyncTicker === activeTicker,
      fetching: valuationQuery.isFetching,
      failed: Boolean(valuationQuery.isError) && !valuationReport?.data,
      hasRun: Boolean(valuationReport?.data),
      run() {
        if (!activeTicker) return;
        setValuationForce(false);
        setValuationSyncTicker(activeTicker);
        setValuationRunKey((value) => value + 1);
      },
      rerun() {
        if (!activeTicker) return;
        setValuationForce(true);
        setValuationSyncTicker(activeTicker);
        setValuationRunKey((value) => value + 1);
      },
      retry() {
        if (!activeTicker) return;
        setValuationForce(true);
        setValuationSyncTicker(activeTicker);
        setValuationRunKey((value) => value + 1);
      },
    },

    timing: {
      loading: authQuery.isPending || (authenticated && portfolioQuery.isPending && watchlistQuery.isPending),
      openDetail,
      rows: activeTicker
        ? [{
            symbol: activeTicker,
            // A deliberate rerun replaces the result surface with AgentThinking. Keeping the
            // persisted card visible made Refresh appear inert, especially when the new request
            // later failed and silently fell back to that same card.
            pending: timingRequestActive && timingQuery.isFetching,
            fetching: timingQuery.isFetching,
            failed: timingRequestActive && !timingQuery.isFetching && (Boolean(timingQuery.isError) || Boolean(timingQuery.isSuccess && timingQuery.data && !timingResultMatches)),
            error: timingQuery.error instanceof Error ? timingQuery.error.message : "",
            timing: (timingRequestActive && (timingQuery.isFetching || timingQuery.isError) ? null : timingReport?.data ?? null) as BuyTimingResponse | null,
            analyzedAt: timingReport?.analyzedAt ?? "",
            run() {
              setTimingForce(false);
              setTimingRunTarget(`${activeTicker}:${activeAgentId}`);
              setTimingRunKey((value) => value + 1);
            },
            retry() {
              setTimingForce(true);
              setTimingRunTarget(`${activeTicker}:${activeAgentId}`);
              setTimingRunKey((value) => value + 1);
            },
          }]
        : [],
    },

    technical: {
      ticker: activeTicker,
      detail: technicalDetailQuery.data ?? null,
      pending: Boolean(activeTicker && technicalDetailQuery.isPending),
      failed: technicalDetailQuery.isError,
      analysis: technicalReport,
      aiLoading: Boolean(activeTicker && technicalAiLoading),
      retry: () => void technicalDetailQuery.refetch(),
      async run(force = false) {
        if (!activeTicker) return;
        setTechnicalAiLoading(true);
        setAiError("");
        try {
          const result = await loadTechnicalAnalysis(activeTicker, activeAgentId, force);
          setTechnicalAnalysis(result);
          setHuntAiCache(technicalCacheKey, { analyzedAt: result.generatedAt ?? new Date().toISOString(), data: result });
          void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
        } catch (error) {
          setAiError(error instanceof Error ? error.message : "Technical Analysis could not generate a chart read.");
        } finally {
          setTechnicalAiLoading(false);
        }
      },
    },

    intraday: {
      ticker: activeTicker,
      symbols,
      select: setSelectedTicker,
      detail: intradayQuery.data,
      pending: Boolean(activeTicker && intradayQuery.isPending),
      failed: intradayQuery.isError,
      retry: () => void intradayQuery.refetch(),
      analysis: intradayAnalysisReport?.data ?? null,
      analyzedAt: intradayAnalysisReport?.analyzedAt ?? "",
      aiLoading: Boolean(activeTicker && intradayAiLoading),
      async run(force = false) {
        if (!activeTicker) return;
        setIntradayAiLoading(true);
        try {
          const analysis = await summarizeStock(activeTicker, "momentum", activeAgentId, force);
          setIntradayAnalysis(analysis);
          setHuntAiCache(intradayAnalysisCacheKey, { analyzedAt: analysis.generatedAt ?? new Date().toISOString(), data: analysis });
          void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
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
      quotaLimit: (authQuery.data?.aiUsage?.used ?? 0) + (authQuery.data?.aiUsage?.tokens ?? 0),
      report: n100Report,
      fetching: Boolean(activeTicker && n100Query.isFetching),
      error: n100Query.isError ? (n100Query.error as Error).message || "Could not load Next 10." : "",
      run: () => runN100(false),
      rerun: () => runN100(true),
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
      async run(mode: StratMode, force = false) {
        setStratMode(mode);
        setStratAnalysis(null);
        setStratLoading(true);
        setAiError("");
        try {
          const card = STRAT_CARDS.find((c) => c.key === mode);
          const strategy = stratPrompt.trim() || (card ? `${card.label}: ${card.subtitle}` : mode);
          const result = await loadStrategyPlaybook({ strategy, region: "all", limit: 5, candidateLimit: 40, agent: activeAgentId, force });
          setStratAnalysis(result);
          setHuntAiCache(strategyCacheKey, { analyzedAt: result.generatedAt ?? new Date().toISOString(), data: { mode, prompt: stratPrompt, analysis: result } });
          void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
        } catch {
          setAiError("Strategy AI could not rank the stock universe for this strategy.");
        } finally {
          setStratLoading(false);
        }
      },
    },

    replay: {
      savedJobId: replayCached?.data.jobId ?? "",
      persistJob(jobId: string) {
        setHuntAiCache(replayCacheKey, { analyzedAt: new Date().toISOString(), data: { jobId } });
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
      // Restoring a saved card is passive data hydration, not an active Agent run. Only an
      // explicit Analyze/Refresh action may show the Agent thinking state.
      loading: Boolean(activeTicker && analystLoading),
      stage: analystStage,
      async run(ticker?: string, force = false) {
        const sym = (ticker || activeTicker).trim().toUpperCase();
        if (!sym) return;
        setAnalystTicker(sym);
        setAnalystDetail(null);
        setAnalystAnalysis(null);
        setAnalystLoading(true);
        setAnalystStage("market_data");
        setAiError("");
        try {
          const { detail, analysis } = await loadAnalystReport(sym, "capitalized", activeAgentId, force, setAnalystStage);
          setAnalystDetail(detail);
          setAnalystAnalysis(analysis);
          setHuntAiCache(`${accountScope}:${AGENT_REASONING_CACHE_VERSION}:analyst:${sym}:${activeAgentId}`, { analyzedAt: analysis.generatedAt ?? new Date().toISOString(), data: { detail, analysis } });
          void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
        } catch (error) {
          setAiError(error instanceof Error ? error.message : "Stock Analyst could not generate a report for this ticker.");
        } finally {
          setAnalystLoading(false);
        }
      },
    },
  };
}
