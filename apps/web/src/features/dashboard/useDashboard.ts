import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteHolding, loadAuthUser, loadPortfolio, loadPortfolioQuotes, loadPortfolioReview, saveHolding, type PortfolioHolding, type PortfolioReviewResponse } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { priceToUsdBase } from "../../lib/format";

export type Dashboard = ReturnType<typeof useDashboard>;

// Bump when the portfolio review prompt/shape changes so a persisted browser cache
// can't make a newly fixed Agent appear to repeat an older, generic review.
const PORTFOLIO_REVIEW_CACHE_VERSION = "v1";

export function useDashboard() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const getHuntAiCache = useWolfStore((state) => state.getHuntAiCache);
  const setHuntAiCache = useWolfStore((state) => state.setHuntAiCache);
  const [actionError, setActionError] = useState("");
  const [analysis, setAnalysis] = useState<PortfolioReviewResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sellTarget, setSellTarget] = useState<PortfolioHolding | null>(null);
  const [selling, setSelling] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formValue, setFormValue] = useState({ symbol: "", shares: "", averageCost: "" });
  const [formSaving, setFormSaving] = useState(false);

  const authQuery = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const accountScope = authQuery.data?.id ? `user:${authQuery.data.id}` : "signed-out";
  const portfolioQuery = useQuery({ queryKey: ["portfolio", accountScope], queryFn: loadPortfolio, enabled: Boolean(authQuery.data?.id) });
  const savedPortfolio = portfolioQuery.data;
  const holdingSymbolsKey = (savedPortfolio?.holdings ?? []).map((holding) => holding.symbol).sort().join(",");
  const quoteRefreshStartedAt = useRef(0);
  const quotesQuery = useQuery({
    queryKey: ["portfolio-quotes", accountScope, holdingSymbolsKey],
    queryFn: loadPortfolioQuotes,
    enabled: Boolean(authQuery.data?.id && holdingSymbolsKey),
    staleTime: 0,
    retry: 0,
  });

  useEffect(() => {
    quoteRefreshStartedAt.current = Date.now();
  }, [holdingSymbolsKey]);

  useEffect(() => {
    if (!quotesQuery.data?.pending || Date.now() - quoteRefreshStartedAt.current >= 60_000) return;
    const timer = window.setTimeout(() => { void quotesQuery.refetch(); }, 1_500);
    return () => window.clearTimeout(timer);
  }, [quotesQuery.data?.pending, quotesQuery.dataUpdatedAt, quotesQuery.refetch]);

  const portfolio = useMemo(() => {
    if (!savedPortfolio) return undefined;
    const freshQuotes = new Map(
      (quotesQuery.data?.quotes ?? [])
        .filter((quote) => quote.fresh && (quote.price ?? 0) > 0)
        .map((quote) => [quote.symbol, quote]),
    );
    if (!freshQuotes.size) return savedPortfolio;
    const holdings = savedPortfolio.holdings.map((holding) => {
      const quote = freshQuotes.get(holding.symbol);
      if (!quote?.price) return holding;
      const value = holding.shares * priceToUsdBase(quote.price, holding.symbol);
      const gainLoss = value - holding.cost;
      return {
        ...holding,
        price: quote.price,
        currency: quote.currency ?? holding.currency,
        changePct: quote.changePct,
        value,
        gainLoss,
        gainLossPct: holding.cost > 0 ? (gainLoss / holding.cost) * 100 : 0,
      };
    });
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const invested = holdings.reduce((sum, holding) => sum + holding.cost, 0);
    const priorAnnualIncome = savedPortfolio.summary.totalValue * savedPortfolio.summary.forwardYield / 100;
    const today = new Date().toISOString().slice(0, 10);
    const chart = [...savedPortfolio.chart];
    const livePoint = { date: today, value: totalValue, cost: invested };
    if (chart.at(-1)?.date === today) chart[chart.length - 1] = livePoint;
    else chart.push(livePoint);
    return {
      ...savedPortfolio,
      holdings,
      chart,
      summary: {
        ...savedPortfolio.summary,
        totalValue,
        invested,
        gainLoss: totalValue - invested,
        gainLossPct: invested > 0 ? ((totalValue - invested) / invested) * 100 : 0,
        forwardYield: totalValue > 0 ? (priorAnnualIncome / totalValue) * 100 : 0,
      },
    };
  }, [quotesQuery.data?.quotes, savedPortfolio]);
  const refresh = () => { void portfolioQuery.refetch(); };
  useEffect(() => {
    if (portfolio) setPortfolioSummary(portfolio.summary.totalValue, portfolio.summary.gainLossPct);
  }, [portfolio, setPortfolioSummary]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;
  const hasPlan = (portfolio?.dcaOrders.length ?? 0) > 0;
  const hasIncome = (portfolio?.incomeEvents.length ?? 0) > 0;

  const reviewCacheKey = `${accountScope}:${PORTFOLIO_REVIEW_CACHE_VERSION}:portfolio-review:${activeAgentId}`;
  const reviewCached = getHuntAiCache<PortfolioReviewResponse>(reviewCacheKey);
  // Re-key on the active Agent: a review for a different Agent (in local state or
  // the persisted cache) must never render as if it were the current Agent's take.
  const review =
    analysis?.agent.id === activeAgentId
      ? analysis
      : reviewCached?.data.agent.id === activeAgentId
        ? reviewCached.data
        : null;

  async function askAi() {
    if (!portfolio?.holdings.length) return;
    setAnalyzing(true);
    try {
      const result = await loadPortfolioReview(activeAgentId, true);
      setAnalysis(result);
      setHuntAiCache(reviewCacheKey, { analyzedAt: new Date().toISOString(), data: result });
    } catch {
      setActionError("AI analysis could not be generated.");
    } finally {
      setAnalyzing(false);
    }
  }

  return {
    portfolio,
    summary: portfolio?.summary,
    firstBuyDate: portfolio?.markers[0]?.date ?? portfolio?.chart[0]?.date,
    todayKey,
    hasHoldings,
    hasPlan,
    hasIncome,
    showEmptyHero: (!hasHoldings && !hasPlan) || !portfolio,
    isSkeleton: authQuery.isPending || (Boolean(authQuery.data?.id) && portfolioQuery.isPending && !portfolio),
    isError: portfolioQuery.isError,
    isFetching: portfolioQuery.isFetching || quotesQuery.isFetching,
    quotesUpdating: quotesQuery.isFetching,
    actionError,
    activeAgentId,
    analysis: review,
    analyzing,
    sellTarget,
    selling,
    openDetail,
    refresh,
    askAi,
    startSell(holding: PortfolioHolding) { setSellTarget(holding); },
    cancelSell() { setSellTarget(null); },
    async confirmSell() {
      if (!sellTarget) return;
      setSelling(true);
      try {
        await deleteHolding(sellTarget.symbol);
        setSellTarget(null);
        refresh();
      } finally {
        setSelling(false);
      }
    },
    nextExDivFor(symbol: string) {
      return (portfolio?.incomeEvents ?? [])
        .filter((event) => event.symbol === symbol && event.kind === "ex-dividend" && event.date >= todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    },
    holdingForm: {
      open: formOpen,
      value: formValue,
      saving: formSaving,
      show() { setFormOpen(true); },
      hide() { setFormOpen(false); },
      set(field: keyof typeof formValue, value: string) { setFormValue((current) => ({ ...current, [field]: value })); },
      async submit() {
        const symbol = formValue.symbol.trim().toUpperCase();
        const boughtShares = Number(formValue.shares);
        // The user types the price in the stock's native currency (THB for .BK); the store is USD base.
        const price = priceToUsdBase(Number(formValue.averageCost), symbol);
        if (!symbol || !(boughtShares > 0) || !(price > 0)) return;
        setFormSaving(true);
        try {
          // Adding more of a stock already held averages into the existing position;
          // a fresh symbol just records the buy as-is.
          const existing = portfolio?.holdings.find((holding) => holding.symbol === symbol);
          const totalShares = (existing?.shares ?? 0) + boughtShares;
          const totalCost = (existing?.shares ?? 0) * (existing?.averageCost ?? 0) + boughtShares * price;
          await saveHolding({
            symbol,
            shares: totalShares,
            averageCost: totalCost / totalShares,
            monthlyDca: existing?.monthlyDca ?? 0,
            strategy: existing?.strategy ?? "stable_dca",
          });
          setFormOpen(false);
          setFormValue({ symbol: "", shares: "", averageCost: "" });
          refresh();
        } finally {
          setFormSaving(false);
        }
      },
    },
  };
}
