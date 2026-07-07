import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteHolding, loadPortfolio, saveHolding, summarizeStock, type PortfolioHolding, type StockAnalysisResponse } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";

export type Dashboard = ReturnType<typeof useDashboard>;

export function useDashboard() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const [actionError, setActionError] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sellTarget, setSellTarget] = useState<PortfolioHolding | null>(null);
  const [selling, setSelling] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formValue, setFormValue] = useState({ symbol: "", shares: "", averageCost: "", monthlyDca: "" });
  const [formSaving, setFormSaving] = useState(false);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
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
    const symbol = portfolio?.holdings[0]?.symbol;
    if (!symbol) return;
    setAnalyzing(true);
    try {
      setAnalysis(await summarizeStock(symbol, "stable_dca"));
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
    isSkeleton: portfolioQuery.isPending && !portfolio,
    isError: portfolioQuery.isError,
    isFetching: portfolioQuery.isFetching,
    actionError,
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
        setFormSaving(true);
        try {
          await saveHolding({
            symbol: formValue.symbol,
            shares: Number(formValue.shares),
            averageCost: Number(formValue.averageCost),
            monthlyDca: Number(formValue.monthlyDca || 0),
            strategy: "stable_dca",
          });
          setFormOpen(false);
          setFormValue({ symbol: "", shares: "", averageCost: "", monthlyDca: "" });
          refresh();
        } finally {
          setFormSaving(false);
        }
      },
    },
  };
}
