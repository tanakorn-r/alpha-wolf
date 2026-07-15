import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buyHolding, loadAuthUser, loadLatestAiResult, loadPortfolio, loadPortfolioQuotes, loadPortfolioReview, sellHolding, type PortfolioHolding, type PortfolioReviewResponse } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { priceToUsdBase, setFxRates } from "../../lib/format";
import { localDateKey } from "../../lib/date";

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
  const [sellValue, setSellValue] = useState({ shares: "", price: "", fees: "0", occurredAt: localDateKey() });
  const [selling, setSelling] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [formValue, setFormValue] = useState({ symbol: "", shares: "", averageCost: "", fees: "0", occurredAt: localDateKey() });
  const [formSaving, setFormSaving] = useState(false);

  const authQuery = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });
  const accountScope = authQuery.data?.id ? `user:${authQuery.data.id}` : "signed-out";
  const portfolioQuery = useQuery({ queryKey: ["portfolio", accountScope], queryFn: loadPortfolio, enabled: Boolean(authQuery.data?.id) });
  const savedPortfolio = portfolioQuery.data;
  setFxRates(savedPortfolio?.fxRates);
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
      const value = holding.shares * priceToUsdBase(quote.price, holding.currency ?? holding.symbol, quotesQuery.data?.fxRates ?? savedPortfolio.fxRates);
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
    const securitiesValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const totalValue = securitiesValue + (savedPortfolio.summary.cashBalance ?? 0);
    const invested = holdings.reduce((sum, holding) => sum + holding.cost, 0);
    const unrealizedGainLoss = securitiesValue - invested;
    const realizedGainLoss = savedPortfolio.summary.realizedGainLoss ?? 0;
    const totalReturn = unrealizedGainLoss + realizedGainLoss + savedPortfolio.summary.dividendsYtd;
    const savedSecuritiesValue = savedPortfolio.holdings.reduce((sum, holding) => sum + holding.value, 0);
    const priorAnnualIncome = savedSecuritiesValue * savedPortfolio.summary.forwardYield / 100;
    const today = localDateKey();
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
        gainLoss: totalReturn,
        gainLossPct: savedPortfolio.summary.netContributions > 0 ? (totalReturn / savedPortfolio.summary.netContributions) * 100 : 0,
        unrealizedGainLoss,
        realizedGainLoss,
        totalReturn,
        forwardYield: securitiesValue > 0 ? (priorAnnualIncome / securitiesValue) * 100 : 0,
      },
    };
  }, [quotesQuery.data?.quotes, savedPortfolio]);
  const refresh = () => { void portfolioQuery.refetch(); };
  useEffect(() => {
    if (portfolio) setPortfolioSummary(portfolio.summary.totalValue, portfolio.summary.gainLossPct);
  }, [portfolio, setPortfolioSummary]);

  const todayKey = localDateKey();
  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;
  const hasPlan = (portfolio?.dcaOrders.length ?? 0) > 0;
  const hasIncome = (portfolio?.incomeEvents.length ?? 0) > 0;
  const hasTransactions = (portfolio?.transactions.length ?? 0) > 0;

  const reviewCacheKey = `${accountScope}:${PORTFOLIO_REVIEW_CACHE_VERSION}:portfolio-review:${activeAgentId}`;
  const reviewCached = getHuntAiCache<PortfolioReviewResponse>(reviewCacheKey);
  const savedReviewQuery = useQuery({
    queryKey: ["saved-ai", accountScope, "portfolio", activeAgentId],
    queryFn: ({ signal }) => loadLatestAiResult<PortfolioReviewResponse>({ feature: "portfolio", subject: "portfolio", agent: activeAgentId, variantPrefix: "v5", signal }),
    enabled: Boolean(authQuery.data?.id && hasHoldings),
    // This is a passive DB restore, not a regeneration. Keep it for the browser session so
    // navigating away from Overview and back never replays the request or Agent animation.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 0,
  });
  // Re-key on the active Agent: a review for a different Agent (in local state or
  // the persisted cache) must never render as if it were the current Agent's take.
  const review =
    analysis?.agent.id === activeAgentId
      ? analysis
      : savedReviewQuery.data?.agent.id === activeAgentId
        ? savedReviewQuery.data
      : reviewCached?.data.agent.id === activeAgentId
        ? reviewCached.data
        : null;

  async function askAi(force = false) {
    if (!portfolio?.holdings.length) return;
    setAnalyzing(true);
    try {
      const result = await loadPortfolioReview(activeAgentId, force);
      setAnalysis(result);
      setHuntAiCache(reviewCacheKey, { analyzedAt: result.generatedAt ?? new Date().toISOString(), data: result });
    } catch {
      setActionError("AI analysis could not be generated.");
    } finally {
      setAnalyzing(false);
    }
  }

  return {
    portfolio,
    summary: portfolio?.summary,
    firstBuyDate: portfolio?.transactions.filter((item) => item.kind === "BUY").map((item) => item.occurredAt.slice(0, 10)).sort()[0] ?? portfolio?.chart[0]?.date,
    todayKey,
    hasHoldings,
    hasPlan,
    hasIncome,
    hasTransactions,
    showEmptyHero: (!hasHoldings && !hasPlan && !hasTransactions) || !portfolio,
    isSkeleton: authQuery.isPending || (Boolean(authQuery.data?.id) && portfolioQuery.isPending && !portfolio),
    isError: portfolioQuery.isError,
    isFetching: portfolioQuery.isFetching || quotesQuery.isFetching,
    quotesUpdating: quotesQuery.isFetching,
    actionError,
    accountUser: authQuery.data ?? null,
    signedIn: Boolean(authQuery.data?.id),
    signInOpen,
    closeSignIn: () => setSignInOpen(false),
    activeAgentId,
    analysis: review,
    // Only the explicit Review/Re-run button owns the Agent thinking state. A DB restore may
    // hydrate the card in the background, but must never pretend the Agent is generating it.
    analyzing,
    sellTarget,
    selling,
    openDetail,
    refresh,
    askAi,
    startSell(holding: PortfolioHolding) {
      setSellTarget(holding);
      setActionError("");
      setSellValue({ shares: String(holding.shares), price: String(holding.price), fees: "0", occurredAt: localDateKey() });
    },
    cancelSell() { setSellTarget(null); },
    sellForm: {
      value: sellValue,
      set(field: keyof typeof sellValue, value: string) { setSellValue((current) => ({ ...current, [field]: value })); },
    },
    async confirmSell() {
      if (!sellTarget) return;
      const shares = Number(sellValue.shares);
      const nativePrice = Number(sellValue.price);
      const nativeFees = Number(sellValue.fees || 0);
      const price = priceToUsdBase(nativePrice, sellTarget.currency ?? sellTarget.symbol, portfolio?.fxRates);
      const fees = priceToUsdBase(nativeFees, sellTarget.currency ?? sellTarget.symbol, portfolio?.fxRates);
      const fullSaleTolerance = Math.max(1e-8, Math.abs(sellTarget.shares) * 1e-10);
      const normalizedShares = Math.abs(shares - sellTarget.shares) <= fullSaleTolerance ? sellTarget.shares : shares;
      if (!(normalizedShares > 0) || normalizedShares > sellTarget.shares + fullSaleTolerance || !(price > 0) || fees < 0) {
        setActionError("Enter a valid share quantity, execution price, and fee.");
        return;
      }
      setSelling(true);
      try {
        await sellHolding(sellTarget.symbol, { shares: normalizedShares, price: nativePrice, fees: nativeFees, currency: sellTarget.currency ?? undefined, occurredAt: sellValue.occurredAt });
        setSellTarget(null);
        refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not remove this holding.");
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
      show() {
        if (!authQuery.data?.id) {
          setSignInOpen(true);
          return;
        }
        setFormOpen(true);
      },
      hide() { setFormOpen(false); },
      set(field: keyof typeof formValue, value: string) { setFormValue((current) => ({ ...current, [field]: value })); },
      async submit() {
        const symbol = formValue.symbol.trim().toUpperCase();
        const boughtShares = Number(formValue.shares);
        // The user types the price in the stock's native currency (THB for .BK); the store is USD base.
        const price = Number(formValue.averageCost);
        const fees = Number(formValue.fees || 0);
        if (!symbol || !(boughtShares > 0) || !(price > 0) || fees < 0) return;
        setFormSaving(true);
        try {
          const existing = portfolio?.holdings.find((holding) => holding.symbol === symbol);
          await buyHolding({
            symbol,
            shares: boughtShares,
            price,
            fees,
            currency: symbol.endsWith(".BK") ? "THB" : "USD",
            occurredAt: formValue.occurredAt,
            monthlyDca: existing?.monthlyDca ?? 0,
            strategy: existing?.strategy ?? "stable_dca",
          });
          setFormOpen(false);
          setFormValue({ symbol: "", shares: "", averageCost: "", fees: "0", occurredAt: localDateKey() });
          refresh();
        } catch (error) {
          setActionError(error instanceof Error ? error.message : "Could not save this holding.");
        } finally {
          setFormSaving(false);
        }
      },
    },
  };
}
