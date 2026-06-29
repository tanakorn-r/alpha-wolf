import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReferenceDot, ReferenceLine } from "recharts";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Money } from "../components/Money";
import { Sparkline } from "../components/Sparkline";
import { AllocationChart, DcaPerformanceChart, PortfolioPerformanceChart } from "../components/charts/PortfolioCharts";
import { formatMoney, formatPercent, formatShortDate } from "../lib/format";
import {
  deleteDcaOrder,
  deleteHolding,
  loadDiscoveries,
  loadPortfolio,
  loadStockDetail,
  saveDcaOrder,
  saveHolding,
  summarizeStock,
  updateDcaOrderAmount,
  type DcaOrder,
  type PortfolioDashboard,
  type PortfolioHolding,
  type StockAnalysisResponse,
} from "../lib/api";
import { useWolfStore } from "../store/useWolfStore";
import { useNavigate } from 'react-router-dom';
const card = "rounded-xl border border-[#2a2a31] bg-[#161619]";
const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function DashboardPage() {
  
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const [actionError, setActionError] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [sellTarget, setSellTarget] = useState<PortfolioHolding | null>(null);
  const [selling, setSelling] = useState(false);

  const todayKey = new Date().toISOString().slice(0, 10);
  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const portfolio = portfolioQuery.data;
  const refresh = () => { void portfolioQuery.refetch(); };
  useEffect(() => { if (portfolio) setPortfolioSummary(portfolio.summary.totalValue, portfolio.summary.gainLossPct); }, [portfolio, setPortfolioSummary]);
  const summary = portfolio?.summary;

  async function askAi() {
    const symbol = portfolio?.holdings[0]?.symbol;
    if (!symbol) return;
    setAnalyzing(true);
    try { setAnalysis(await summarizeStock(symbol, "stable_dca")); } catch { setActionError("AI analysis could not be generated."); } finally { setAnalyzing(false); }
  }

  async function confirmSell(holding: PortfolioHolding) {
    setSelling(true);
    try {
      await deleteHolding(holding.symbol);
      setSellTarget(null);
      refresh();
    } finally {
      setSelling(false);
    }
  }

  if (portfolioQuery.isPending && !portfolio) return <DashboardSkeleton />;

  const firstBuyDate = portfolio?.markers[0]?.date ?? portfolio?.chart[0]?.date;
  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;
  const hasPlan = (portfolio?.dcaOrders.length ?? 0) > 0;
  const hasIncome = (portfolio?.incomeEvents.length ?? 0) > 0;
  const showEmptyHero = !hasHoldings && !hasPlan;

  return (
    <div className="flex flex-col gap-5 text-[#ececee]">
      {portfolioQuery.isError || actionError ? <div className="flex items-center justify-between rounded-lg border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]"><span>{actionError || "Portfolio service is unavailable."}</span><button type="button" disabled={portfolioQuery.isFetching} onClick={refresh} className="flex items-center gap-2 rounded border border-[#f2575c] px-2 py-1 text-xs disabled:opacity-60">{portfolioQuery.isFetching ? <LoadingSpinner size={12} /> : null}Retry</button></div> : null}

      {showEmptyHero || !portfolio ? (
        <>
          <EmptyPortfolio onAdd={() => setShowHoldingForm(true)} />
        </>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
            <Stat label="Total value" value={<Money value={summary?.totalValue} />} />
            <Stat label="Invested (cost)" value={<Money value={summary?.invested} />} />
            <Stat label="Total gain / loss" value={<Money value={summary?.gainLoss} />} sub={formatPercent(summary?.gainLossPct)} tone={(summary?.gainLoss ?? 0) >= 0 ? "good" : "bad"} />
            <Stat label="Dividends YTD" value={<Money value={summary?.dividendsYtd} />} sub={`${summary?.forwardYield ?? 0}% forward yield`} />
          </section>

          <section className="grid gap-[14px] xl:grid-cols-[1fr_320px]">
            <div className={`${card} px-[18px] pb-[14px] pt-[18px]`}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">Portfolio value</h2>
                  <div className="mt-1 text-[11px] text-[#8c8c95]">Investing since <span className="font-mono text-[#74a4ff]">{formatShortDate(firstBuyDate)}</span></div>
                  <div className="mt-2 flex gap-4 text-[11px] text-[#8c8c95]"><Legend color="#3ecf8e" label="Value" /><Legend color="#5a5a62" label="Cost basis" dashed /><Legend color="#3ecf8e" label="Capital added" dot /></div>
                </div>
                <button type="button" onClick={() => setShowHoldingForm(true)} className="rounded-lg border border-[#34343c] px-3 py-2 text-xs hover:border-[#3ecf8e]">Edit holdings</button>
              </div>
              <div className="relative mt-1 h-[300px]">
                <PortfolioPerformanceChart data={portfolio} loading={portfolioQuery.isPending} error={portfolioQuery.isError} onRetry={refresh}>
                  {firstBuyDate ? (
                    <>
                      <ReferenceLine x={firstBuyDate} stroke="#74a4ff" strokeDasharray="4 4" />
                      <ReferenceDot x={firstBuyDate} y={portfolio.chart[0]?.value} r={4} fill="#74a4ff" stroke="#0e0e10" strokeWidth={2} label={{ value: "First buy", position: "insideTopLeft", fill: "#74a4ff", fontSize: 10 }} />
                    </>
                  ) : null}
                </PortfolioPerformanceChart>
              </div>
            </div>

            <PlanCard portfolio={portfolio} onChanged={refresh} onAskAi={askAi} onOpenDetail={openDetail} />
          </section>

          {hasHoldings ? <section className="grid gap-[14px] lg:grid-cols-2"><div className={`${card} p-[18px]`}><h2 className="font-semibold">Contribution performance</h2><p className="mt-1 text-xs text-[#8c8c95]">Portfolio path with actual buy dates and capital added</p><div className="mt-3 h-52"><DcaPerformanceChart data={portfolio}/></div></div><div className={`${card} p-[18px]`}><h2 className="font-semibold">Allocation</h2><p className="mt-1 text-xs text-[#8c8c95]">Live position value by sector</p><div className="mt-3 h-52"><AllocationChart data={portfolio}/></div></div></section> : null}
        </>
      )}

      {hasHoldings || hasIncome ? <section className={`grid gap-[14px] ${hasHoldings && hasIncome ? "xl:grid-cols-[1fr_320px]" : "xl:grid-cols-1"}`}>
        {hasHoldings ? <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#2a2a31] px-5 py-4"><h2 className="font-semibold">Holdings</h2><span className="font-mono text-xs text-[#8c8c95]">{portfolio?.holdings.length ?? 0} positions</span></div>
          <div className="divide-y divide-[#23232a]">
            {portfolio?.holdings.map((holding) => {
              const good = holding.gainLoss >= 0;
              const nextExDiv = portfolio.incomeEvents
                .filter((event) => event.symbol === holding.symbol && event.kind === "ex-dividend" && event.date >= todayKey)
                .sort((a, b) => a.date.localeCompare(b.date))[0];
              return (
                <div key={holding.symbol} className="grid w-full grid-cols-[1fr_70px_repeat(4,minmax(72px,96px))_auto] items-center gap-3 px-5 py-3 text-left hover:bg-[#1c1c20]">
                  <button type="button" onClick={() => openDetail(holding.symbol)} className="min-w-0 text-left"><strong>{holding.symbol}</strong><div className="truncate text-xs text-[#8c8c95]">{holding.name}</div></button>
                  <Sparkline values={[holding.averageCost, holding.price]} color={good ? "#3ecf8e" : "#f2575c"} />
                  <Cell label="Since buy" value={formatPercent(holding.gainLossPct)} good={good} />
                  <Cell label="Value" value={<Money value={holding.value} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} />
                  <Cell label="P/L" value={<Money value={holding.gainLoss} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} good={good} />
                  <Cell label="Yield" value={holding.story?.match(/[\d.]+% yield/)?.[0] ?? "—"} />
                  <Cell label="Ex-div" value={nextExDiv ? nextExDiv.date.slice(5) : "—"} />
                  <button type="button" onClick={() => setSellTarget(holding)} className="justify-self-end rounded-lg border border-[#2a2a31] px-3 py-1.5 text-xs text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c]">Sell</button>
                </div>
              );
            })}
          </div>
        </div> : null}

        {hasIncome ? <div className={`${card} p-5`}>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Upcoming income</h2><span className="text-xs text-[#8c8c95]">Live calendar</span></div>
          <div className="mt-4 space-y-3">{portfolio?.incomeEvents.map((event) => <div key={`${event.date}-${event.symbol}-${event.kind}`} className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${event.kind === "payment" ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`} /><div className="flex-1"><div className="text-sm font-semibold">{event.symbol} · {event.kind}</div><div className="text-xs text-[#8c8c95]">{event.date}</div></div><span className="font-mono text-xs text-[#3ecf8e]">{event.amount ? `+${formatMoney(event.amount)}` : "—"}</span></div>)}</div>
        </div> : null}
      </section> : null}

      {hasHoldings ? <section className={`${card} flex items-center justify-between gap-5 border-[#285f48] p-5`}><div><div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div><h2 className="mt-1 text-lg font-semibold">Need a second opinion on this month?</h2><p className="mt-1 text-sm text-[#8c8c95]">AI runs only after you ask and uses live technicals and fundamentals.</p></div><button type="button" disabled={!portfolio?.holdings.length || analyzing} onClick={askAi} className="flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-5 py-3 text-sm font-bold text-[#06120c] disabled:opacity-40">{analyzing ? <LoadingSpinner size={14} /> : null}{analyzing ? "Analyzing…" : "Suggest my next move"}</button></section> : null}
      {analyzing ? <div className="flex items-center justify-center gap-3.5 rounded-xl border border-[#2a2a31] bg-[#141417] p-[34px] text-[#8c8c95]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Analyzing your portfolio…</div> : null}
      {analysis ? <AiVerdictCard value={analysis} onRerun={askAi} size="modal" /> : null}

      {showHoldingForm ? <HoldingForm onClose={() => setShowHoldingForm(false)} onSaved={() => { setShowHoldingForm(false); refresh(); }} /> : null}
      {sellTarget ? <SellModal holding={sellTarget} selling={selling} onClose={() => setSellTarget(null)} onConfirm={() => confirmSell(sellTarget)} /> : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "good" | "bad" }) { return <div className={`${card} px-[18px] py-4`}><div className="text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">{label}</div><div className={`mt-[7px] font-mono text-[25px] font-semibold tracking-[-0.5px] ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : ""}`}>{value}</div>{sub ? <div className="mt-px font-mono text-xs text-[#8c8c95]">{sub}</div> : null}</div>; }
function Cell({ label, value, good }: { label: string; value: React.ReactNode; good?: boolean }) { return <div><div className="text-[10px] uppercase text-[#5a5a62]">{label}</div><div className={`mt-1 font-mono text-sm ${good === true ? "text-[#3ecf8e]" : good === false ? "text-[#f2575c]" : ""}`}>{value}</div></div>; }
function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) { return <span className="flex items-center gap-1.5"><span className={dot ? "h-2 w-2 rounded-full" : "h-0 w-3 border-t-2"} style={{ background: dot ? color : undefined, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />{label}</span>; }

function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[#2a2a31] bg-gradient-to-b from-[#15171a] to-[#0f1011] px-6 py-16 text-center">
      <div className="mb-5 grid h-[74px] w-[74px] place-items-center rounded-2xl bg-[#08090b]">
        <span className="h-7 w-7 -rotate-45 rounded-full border-[3px] border-[#3ecf8e] border-r-transparent" />
      </div>
      <h2 className="text-[23px] font-bold tracking-[-0.4px]">Start your Alpha Wolf book</h2>
      <p className="mt-[9px] max-w-[460px] text-sm leading-[1.6] text-[#8c8c95]">You don't own anything yet. Find the stocks you trust, decide how much dry powder to deploy, and AlphaWolf will track the setup, the income, and the result.</p>
      <div className="mt-[30px] flex flex-wrap justify-center gap-3.5">
        <OnboardStep n="01" title="Scan the field" body="Search US or Thai stocks and see which strategy setup matches the tape." />
        <OnboardStep n="02" title="Set your plan" body="Add a stock to a month and type how much capital you want ready." />
        <OnboardStep n="03" title="Track the outcome" body="Watch income dates, position value, and timing decisions in one place." />
      </div>
      <button type="button" onClick={() => { navigate('/scanner', { replace: true }); }} className="mt-[30px] flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-6 py-[13px] text-sm font-bold text-[#06120c]">
        Add your first holding
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#06120c" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
function OnboardStep({ n, title, body }: { n: string; title: string; body: string }) { return <div className="w-[200px] rounded-xl border border-[#2a2a31] bg-[#161619] p-[18px] text-left"><div className="font-mono text-[13px] font-semibold text-[#3ecf8e]">{n}</div><div className="mt-2 text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-[1.5] text-[#8c8c95]">{body}</div></div>; }

function HoldingForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ symbol: "", shares: "", averageCost: "", monthlyDca: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { await saveHolding({ symbol: value.symbol, shares: Number(value.shares), averageCost: Number(value.averageCost), monthlyDca: Number(value.monthlyDca || 0), strategy: "stable_dca" }); onSaved(); } finally { setSaving(false); } };
  return <Modal title="Add or update holding" onClose={onClose}><form onSubmit={submit} className="grid gap-3"><input required className={input} placeholder="Ticker, e.g. KO" value={value.symbol} onChange={(e) => setValue({ ...value, symbol: e.target.value.toUpperCase() })}/><input required type="number" step="any" className={input} placeholder="Shares" value={value.shares} onChange={(e) => setValue({ ...value, shares: e.target.value })}/><input required type="number" step="any" className={input} placeholder="Average cost" value={value.averageCost} onChange={(e) => setValue({ ...value, averageCost: e.target.value })}/><input type="number" step="any" className={input} placeholder="Monthly capital plan" value={value.monthlyDca} onChange={(e) => setValue({ ...value, monthlyDca: e.target.value })}/><button disabled={saving} className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c] disabled:opacity-60">{saving ? <LoadingSpinner size={14} /> : null}Save holding</button></form></Modal>;
}

function SellModal({ holding, selling, onClose, onConfirm }: { holding: PortfolioHolding; selling: boolean; onClose: () => void; onConfirm: () => void }) {
  const proceeds = holding.shares * holding.price;
  return (
    <Modal title={`Sell ${holding.symbol}`} onClose={onClose}>
      <p className="text-[13px] leading-[1.6] text-[#bcbcc2]">This places a market order to sell <span className="text-[#ececee]">all {holding.shares} shares</span> at the current price. Cash settles in 1–2 business days.</p>
      <div className="mt-4 overflow-hidden rounded-[11px] border border-[#2a2a31]">
        <Row label="Shares" value={String(holding.shares)} />
        <Row label="Current price" value={<Money value={holding.price} />} />
        <Row label="Realized P/L" value={<Money value={holding.gainLoss} />} color={holding.gainLoss >= 0 ? "#3ecf8e" : "#f2575c"} />
        <div className="flex items-center justify-between bg-[#121215] px-[15px] py-[14px]"><span className="font-semibold">Estimated proceeds</span><span className="font-mono text-[17px] font-semibold text-[#3ecf8e]"><Money value={proceeds} /></span></div>
      </div>
      <div className="mt-4 flex gap-2.5">
        <button type="button" disabled={selling} onClick={onClose} className="flex-1 rounded-[10px] border border-[#2a2a31] py-3 text-[13.5px] font-medium hover:border-[#8c8c95] disabled:opacity-60">Cancel</button>
        <button type="button" disabled={selling} onClick={onConfirm} className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#f2575c] py-3 text-[13.5px] font-bold text-[#1a0608] hover:bg-[#e04349] disabled:opacity-60">{selling ? <LoadingSpinner size={14} /> : null}Sell all shares</button>
      </div>
    </Modal>
  );
}
function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) { return <div className="flex items-center justify-between border-t border-[#1f1f24] px-[15px] py-3 text-[13px] first:border-t-0"><span className="text-[#8c8c95]">{label}</span><span className="font-mono" style={{ color }}>{value}</span></div>; }

function monthOptions(): Array<{ key: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: date.toLocaleDateString(undefined, { month: "short" }) };
  });
}

function PlanCard({ portfolio, onChanged, onAskAi, onOpenDetail }: { portfolio: PortfolioDashboard; onChanged: () => void; onAskAi: () => void; onOpenDetail: (symbol: string) => void }) {
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

  const items = portfolio.dcaOrders.filter((order) => order.scheduledFor.startsWith(month));
  const committed = items.reduce((sum, order) => sum + order.amount, 0);
  const overReserve = items.length > 0 && committed > cashReserve;
  const canApply = items.length > 0 && committed > 0 && committed <= cashReserve;

  const todayKey = new Date().toISOString().slice(0, 10);
  const planSymbolSet = new Set(items.map((order) => order.symbol));
  const exDivAnchors = Array.from(new Set(
    portfolio.incomeEvents
      .filter((event) => event.kind === "ex-dividend" && event.date >= todayKey && planSymbolSet.has(event.symbol))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((event) => event.symbol)
  )).slice(0, 2);

  useEffect(() => { setApplied(null); }, [month]);

  const planSymbols = items.map((order) => order.symbol).join(",");

  useEffect(() => {
    if (!addOpen) return;
    const handle = setTimeout(async () => {
      setSearchingStocks(true);
      try {
        const payload = await loadDiscoveries({ q: addQuery || undefined, kind: "stock", limit: 6 });
        setAddResults((payload.live ?? []).filter((item) => !planSymbols.split(",").includes(item.symbol)).map((item) => ({ symbol: item.symbol, name: item.name, market: item.symbol.endsWith(".BK") ? "Thai SET" : "US" })));
      } catch {
        setAddResults([]);
      } finally {
        setSearchingStocks(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [addOpen, addQuery, month, planSymbols]);

  async function addStock(symbol: string) {
    setAddingSymbol(symbol);
    try {
      await saveDcaOrder({ symbol, amount: 200, scheduledFor: `${month}-01`, strategy: "stable_dca" });
      setAddOpen(false);
      setAddQuery("");
      setApplied(null);
      onChanged();
    } finally {
      setAddingSymbol("");
    }
  }

  async function setAmount(order: DcaOrder, raw: string) {
    const usd = Math.max(0, Math.min(9_999_999, parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0));
    setSavingOrderId(order.id);
    try {
      await updateDcaOrderAmount(order.id, usd);
      setApplied(null);
      onChanged();
    } finally {
      setSavingOrderId(null);
    }
  }

  async function remove(order: DcaOrder) {
    setSavingOrderId(order.id);
    try {
      await deleteDcaOrder(order.id);
      setApplied(null);
      onChanged();
    } finally {
      setSavingOrderId(null);
    }
  }

  function submitAddFunds(event: React.FormEvent) {
    event.preventDefault();
    const usd = Number(addFundsAmount);
    if (!usd || usd <= 0) return;
    addCashReserve(usd);
    setAddFundsOpen(false);
    setAddFundsAmount("");
    setApplied(null);
  }

  async function applyPlan() {
    if (!canApply || applying) return;
    setApplying(true);
    setApplyError("");
    try {
      for (const order of items) {
        const detail = await loadStockDetail(order.symbol, order.strategy);
        const price = detail.stock.price;
        if (!price || price <= 0) continue;
        const boughtShares = order.amount / price;
        const existing = portfolio.holdings.find((holding) => holding.symbol === order.symbol);
        const totalShares = (existing?.shares ?? 0) + boughtShares;
        const totalCost = (existing?.shares ?? 0) * (existing?.averageCost ?? 0) + order.amount;
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
      onChanged();
    } catch {
      setApplyError("Could not execute the full plan — some buys may not have gone through.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] px-[18px] py-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">This month's plan</h2>
        <span className="text-[10px] uppercase tracking-[0.6px] text-[#5a5a62]">This month</span>
      </div>
      {exDivAnchors.length ? <p className="mt-1 text-[11px] text-[#5a5a62]">Built around {exDivAnchors.join(" + ")} ex-dividend date{exDivAnchors.length > 1 ? "s" : ""}</p> : null}

      <div className="mt-3 flex items-center justify-between gap-2.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-[14px] py-[13px]">
        <div className="min-w-0">
          <div className="text-[11px] text-[#8c8c95]">Cash to invest</div>
          <div className="mt-0.5 font-mono text-[23px] font-bold tracking-[-0.5px]"><Money value={cashReserve} secondaryClassName="text-[12px] font-normal text-[#5a5a62]" /></div>
        </div>
        <button type="button" onClick={() => setAddFundsOpen(true)} className="flex flex-none items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#161619] px-[13px] py-2 text-xs font-semibold text-[#3ecf8e] hover:border-[#3ecf8e]">
          <span className="text-base leading-none">+</span> Add funds
        </button>
      </div>

      <div className="mt-3 flex gap-[3px] rounded-lg border border-[#2a2a31] bg-[#0e0e10] p-[3px]">
        {months.map((option) => (
          <button key={option.key} type="button" onClick={() => setMonth(option.key)} className={`flex-1 rounded-md py-1.5 text-center text-xs font-medium ${month === option.key ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}>
            {option.label}
          </button>
        ))}
      </div>

      {applied ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#285f48] bg-[#173528] px-3.5 py-2.5 text-xs">
          <span className="text-[#3ecf8e]">Deployed {formatMoney(applied.amount)} across {applied.count} stock{applied.count === 1 ? "" : "s"} at today&apos;s price — check your holdings below.</span>
          <button type="button" onClick={() => setApplied(null)} className="text-[#82b99f] hover:text-[#ececee]">Dismiss</button>
        </div>
      ) : null}

      <div className="mt-[13px] flex flex-col gap-[11px]">
        {items.map((order) => (
          <div key={order.id} className="flex items-center gap-[9px]">
            <button type="button" onClick={() => onOpenDetail(order.symbol)} className="min-w-0 flex-1 text-left text-[13px] font-medium">{order.symbol}</button>
            <input
              defaultValue={String(Math.round(order.amount))}
              onBlur={(event) => setAmount(order, event.target.value)}
              disabled={savingOrderId === order.id}
              className="w-[88px] flex-none rounded-md border border-[#2a2a31] bg-[#0e0e10] px-2 py-1 text-right font-mono text-[12.5px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
            {savingOrderId === order.id ? <LoadingSpinner size={14} className="text-[#8c8c95]" /> : null}
            <StepperButton disabled={savingOrderId === order.id} label="×" hoverColor="#f2575c" onClick={() => remove(order)} />
          </div>
        ))}
        {!items.length ? <div className="rounded-[9px] border border-dashed border-[#2a2a31] p-3.5 text-center text-xs text-[#8c8c95]">No stocks yet — add one below.</div> : null}
      </div>

      <button type="button" onClick={() => setAddOpen(!addOpen)} className="mt-[11px] flex w-full items-center justify-center gap-[7px] rounded-lg border border-dashed border-[#2a2a31] py-2.5 text-[13px] font-medium text-[#3ecf8e] hover:border-[#3ecf8e] hover:bg-[#3ecf8e]/5">
        <span className="text-base leading-none">{addOpen ? "−" : "+"}</span>{addOpen ? "Close" : "Add stock"}
      </button>

      {addOpen ? (
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-[#2a2a31] bg-[#0e0e10]">
          <div className="p-2.5"><input autoFocus value={addQuery} onChange={(event) => setAddQuery(event.target.value)} placeholder="Search ticker or company…" className="w-full rounded-lg border border-[#2a2a31] bg-[#161619] px-[11px] py-[9px] text-[12.5px] text-[#ececee] outline-none focus:border-[#3ecf8e]" /></div>
          <div className="max-h-[220px] overflow-y-auto">
            {searchingStocks ? <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-[#8c8c95]"><LoadingSpinner size={12} />Loading stocks…</div> : null}
            {addResults.map((item) => (
              <button key={item.symbol} type="button" disabled={addingSymbol === item.symbol} onClick={() => addStock(item.symbol)} className="flex w-full items-center gap-[9px] border-t border-[#1a1a1e] px-3 py-2.5 text-left hover:bg-[#161619] disabled:opacity-60">
                <span className="w-[54px] flex-none font-mono text-[12.5px] font-semibold">{item.symbol}</span>
                <span className="flex-none rounded-[4px] border border-[#2a2a31] px-[5px] py-px text-[9.5px] text-[#8c8c95]">{item.market}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#8c8c95]">{item.name}</span>
                <span className="flex items-center gap-2 flex-none font-mono text-[11.5px] text-[#3ecf8e]">{addingSymbol === item.symbol ? <LoadingSpinner size={12} /> : null}+{formatMoney(200)}</span>
              </button>
            ))}
            {!searchingStocks && !addResults.length ? <div className="p-3.5 text-center text-xs text-[#8c8c95]">Everything matching is already in the plan.</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-[14px] flex items-center justify-between border-t border-[#2a2a31] pt-[13px]">
        <div><div className={`text-xs font-semibold ${overReserve ? "text-[#f2575c]" : "text-[#3ecf8e]"}`}>{overReserve ? "Over your cash to deploy" : "Committed"}</div><div className="text-[11px] text-[#8c8c95]">of {formatMoney(cashReserve)} cash ready</div></div>
        <span className={`font-mono text-lg font-semibold ${overReserve ? "text-[#f2575c]" : "text-[#ececee]"}`}><Money value={committed} secondaryClassName="text-[11px] font-normal text-[#5a5a62]" /></span>
      </div>

      <button type="button" onClick={applyPlan} disabled={!canApply || applying} className="mt-[10px] flex w-full items-center justify-center gap-[7px] rounded-lg bg-[#3ecf8e] py-2.5 text-[13px] font-bold text-[#06120c] disabled:cursor-not-allowed disabled:bg-[#23232a] disabled:text-[#5a5a62]">
        {applying ? <LoadingSpinner size={14} /> : null}
        {applying ? "Buying at current prices…" : `Apply ${month && items.length ? `to ${months.find((m) => m.key === month)?.label}` : "plan"}`}
      </button>
      {overReserve ? <p className="mt-2 text-center text-[11px] text-[#f2575c]">Committed amount exceeds your cash to invest — add funds or lower an amount.</p> : null}
      {applyError ? <p className="mt-2 text-center text-[11px] text-[#f2575c]">{applyError}</p> : null}

      <button type="button" onClick={onAskAi} className="mt-[11px] flex w-full items-center justify-center gap-[7px] rounded-lg border border-[#f5c451]/35 bg-[#f5c451]/[.07] py-2.5 text-[13px] font-medium text-[#f5c451] hover:bg-[#f5c451]/[.13]">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.6 4.3L14 7l-4.4 1.2L8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5z" fill="#f5c451" /></svg>
        Ask AI where to place it
      </button>

      {addFundsOpen ? (
        <Modal title="Add funds" onClose={() => setAddFundsOpen(false)}>
          <form onSubmit={submitAddFunds} className="grid gap-3">
            <input autoFocus required type="number" min="1" step="any" className={input} placeholder="Amount in USD" value={addFundsAmount} onChange={(event) => setAddFundsAmount(event.target.value)} />
            <button className="mt-1 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Add to cash to invest</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function StepperButton({ label, hoverColor, onClick, disabled }: { label: string; hoverColor: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md border border-[#2a2a31] bg-[#0e0e10] text-[15px] leading-none text-[#8c8c95] hover:text-[#ececee] disabled:opacity-50"
      onMouseEnter={(event) => (event.currentTarget.style.borderColor = hoverColor)}
      onMouseLeave={(event) => (event.currentTarget.style.borderColor = "")}
    >
      {label}
    </button>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md rounded-xl border border-[#34343c] bg-[#161619] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-[#8c8c95]">×</button></div>{children}</div></div>; }
function DashboardSkeleton() { return <div className="grid gap-4"><div className="grid grid-cols-4 gap-3">{[1,2,3,4].map((item) => <div key={item} className="skeleton-block h-24" />)}</div><div className="skeleton-block h-96" /></div>; }
