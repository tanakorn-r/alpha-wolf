import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { loadDiscoveries, loadStockDetail, saveDcaOrder, saveHolding, updateDcaOrderAmount, deleteDcaOrder, type DcaOrder } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { THB_PER_USD } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export type PlanCard = ReturnType<typeof usePlanCard>;

function monthOptions(): Array<{ key: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString(undefined, { month: "short" }) };
  });
}

export function usePlanCard(dash: Dashboard) {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].key);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<Array<{ symbol: string; name: string; market: string }>>([]);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [applied, setApplied] = useState<{ month: string; amount: number; count: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [searchingStocks, setSearchingStocks] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState("");
  const [savingOrderId, setSavingOrderId] = useState<number | null>(null);

  const cashReserve = useWolfStore((state) => state.cashReserve);
  const addCashReserve = useWolfStore((state) => state.addCashReserve);
  const spendCashReserve = useWolfStore((state) => state.spendCashReserve);

  const orders = dash.portfolio?.dcaOrders ?? [];
  const holdings = dash.portfolio?.holdings ?? [];
  const incomeEvents = dash.portfolio?.incomeEvents ?? [];
  const items = orders.filter((order) => order.scheduledFor.startsWith(month));
  const priceQueries = useQueries({
    queries: items.map((order) => ({
      queryKey: ["stock-detail", order.symbol, order.strategy, "plan-price"],
      queryFn: () => loadStockDetail(order.symbol, order.strategy),
      staleTime: 60_000,
    })),
  });
  const priceBySymbol = useMemo(() => {
    const prices = new Map<string, number>();
    items.forEach((order, index) => {
      const detail = priceQueries[index]?.data;
      const price = detail ? stockPriceInBaseCurrency(detail.stock.price, detail.stock.currency) : null;
      if (price && price > 0) prices.set(order.symbol, price);
    });
    return prices;
  }, [items, priceQueries]);
  const orderShares = (order: DcaOrder) => {
    if (order.shares && order.shares > 0) return order.shares;
    const price = priceBySymbol.get(order.symbol);
    return price ? order.amount / price : 0;
  };
  const orderAmount = (order: DcaOrder) => {
    const price = priceBySymbol.get(order.symbol);
    return price ? orderShares(order) * price : order.amount;
  };
  const committed = items.reduce((sum, order) => sum + orderAmount(order), 0);
  const overReserve = items.length > 0 && committed > cashReserve;
  const canApply = items.length > 0 && committed > 0 && committed <= cashReserve;

  const planSymbolSet = new Set(items.map((order) => order.symbol));
  const exDivAnchors = Array.from(new Set(
    incomeEvents
      .filter((event) => event.kind === "ex-dividend" && event.date >= dash.todayKey && planSymbolSet.has(event.symbol))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((event) => event.symbol),
  )).slice(0, 2);

  useEffect(() => { setApplied(null); }, [month]);

  const planSymbols = items.map((order) => order.symbol).join(",");

  useEffect(() => {
    if (!addOpen) return;
    const handle = setTimeout(async () => {
      setSearchingStocks(true);
      try {
        const payload = await loadDiscoveries({ q: addQuery || undefined, kind: "stock", limit: 6 });
        setAddResults(
          (payload.live ?? [])
            .filter((item) => !planSymbols.split(",").includes(item.symbol))
            .map((item) => ({ symbol: item.symbol, name: item.name, market: item.symbol.endsWith(".BK") ? "Thai SET" : "US" })),
        );
      } catch {
        setAddResults([]);
      } finally {
        setSearchingStocks(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [addOpen, addQuery, month, planSymbols]);

  return {
    months,
    month,
    applyLabel: month && items.length ? `to ${months.find((m) => m.key === month)?.label}` : "plan",
    items,
    committed,
    overReserve,
    canApply,
    exDivAnchors,
    cashReserve,
    addOpen,
    addQuery,
    addResults,
    addFundsOpen,
    addFundsAmount,
    applied,
    applying,
    applyError,
    searchingStocks,
    addingSymbol,
    savingOrderId,
    orderShares,
    orderAmount,
    openDetail: dash.openDetail,
    askAi: dash.askAi,
    setMonth,
    toggleAdd() { setAddOpen((open) => !open); },
    setAddQuery,
    showAddFunds() { setAddFundsOpen(true); },
    hideAddFunds() { setAddFundsOpen(false); },
    setAddFundsAmount,
    dismissApplied() { setApplied(null); },
    async addStock(symbol: string) {
      setAddingSymbol(symbol);
      try {
        const detail = await loadStockDetail(symbol, "stable_dca");
        const price = stockPriceInBaseCurrency(detail.stock.price, detail.stock.currency);
        const shares = 1;
        await saveDcaOrder({ symbol, amount: price * shares, shares, scheduledFor: `${month}-01`, strategy: "stable_dca" });
        setAddOpen(false);
        setAddQuery("");
        setApplied(null);
        dash.refresh();
      } finally {
        setAddingSymbol("");
      }
    },
    async setShares(order: DcaOrder, raw: string) {
      const shares = Math.max(0, Math.min(99_999_999, Number(raw.replace(/[^0-9.]/g, "")) || 0));
      const price = priceBySymbol.get(order.symbol);
      if (!shares || !price) return;
      setSavingOrderId(order.id);
      try {
        await updateDcaOrderAmount(order.id, shares * price, shares);
        setApplied(null);
        dash.refresh();
      } finally {
        setSavingOrderId(null);
      }
    },
    async remove(order: DcaOrder) {
      setSavingOrderId(order.id);
      try {
        await deleteDcaOrder(order.id);
        setApplied(null);
        dash.refresh();
      } finally {
        setSavingOrderId(null);
      }
    },
    submitAddFunds(event: React.FormEvent) {
      event.preventDefault();
      // Input is entered in THB (the app's default display currency); store in USD base.
      const baht = Number(addFundsAmount);
      if (!baht || baht <= 0) return;
      addCashReserve(baht / THB_PER_USD);
      setAddFundsOpen(false);
      setAddFundsAmount("");
      setApplied(null);
    },
    async applyPlan() {
      if (!canApply || applying) return;
      setApplying(true);
      setApplyError("");
      try {
        for (const order of items) {
          const detail = await loadStockDetail(order.symbol, order.strategy);
          const price = stockPriceInBaseCurrency(detail.stock.price, detail.stock.currency);
          if (!price || price <= 0) continue;
          const boughtShares = order.shares && order.shares > 0 ? order.shares : order.amount / price;
          const existing = holdings.find((holding) => holding.symbol === order.symbol);
          const totalShares = (existing?.shares ?? 0) + boughtShares;
          const totalCost = (existing?.shares ?? 0) * (existing?.averageCost ?? 0) + boughtShares * price;
          await saveHolding({
            symbol: order.symbol,
            shares: totalShares,
            averageCost: totalCost / totalShares,
            strategy: order.strategy,
            monthlyDca: existing?.monthlyDca ?? 0,
          });
          await deleteDcaOrder(order.id);
        }
        spendCashReserve(committed);
        setApplied({ month, amount: committed, count: items.length });
        dash.refresh();
      } catch {
        setApplyError("Could not execute the full plan — some buys may not have gone through.");
      } finally {
        setApplying(false);
      }
    },
  };
}

function stockPriceInBaseCurrency(price: number, currency?: string) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return currency === "THB" ? price / THB_PER_USD : price;
}
