import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteHolding, loadAuthUser, loadPortfolio, loadPortfolioReview, saveHolding, type PortfolioHolding, type PortfolioReviewResponse } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { priceToUsdBase } from "../../lib/format";

export type Dashboard = ReturnType<typeof useDashboard>;

export function useDashboard() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
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
  const portfolio = portfolioQuery.data;
  const refresh = () => { void portfolioQuery.refetch(); };
  useEffect(() => {
    if (portfolio) setPortfolioSummary(portfolio.summary.totalValue, portfolio.summary.gainLossPct);
  }, [portfolio, setPortfolioSummary]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;
  const hasPlan = (portfolio?.dcaOrders.length ?? 0) > 0;
  const hasIncome = (portfolio?.incomeEvents.length ?? 0) > 0;

  async function askAi() {
    if (!portfolio?.holdings.length) return;
    setAnalyzing(true);
    try {
      setAnalysis(await loadPortfolioReview(activeAgentId, true));
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
    isFetching: portfolioQuery.isFetching,
    actionError,
    activeAgentId,
    analysis,
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
