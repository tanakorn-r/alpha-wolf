import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReferenceDot, ReferenceLine } from "recharts";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { Sparkline } from "../components/Sparkline";
import { AllocationChart, DcaPerformanceChart, PortfolioPerformanceChart } from "../components/charts/PortfolioCharts";
import { formatMoneyAs, formatPercent, formatShortDate } from "../lib/format";
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
  const currency = useWolfStore((state) => state.currency);
  const [actionError, setActionError] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [sellTarget, setSellTarget] = useState<PortfolioHolding | null>(null);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const portfolio = portfolioQuery.data;
  const refresh = () => { void portfolioQuery.refetch(); };
  useEffect(() => { if (portfolio) setPortfolioSummary(portfolio.summary.totalValue, portfolio.summary.gainLossPct); }, [portfolio, setPortfolioSummary]);
  const summary = portfolio?.summary;
  const money = (value?: number) => formatMoneyAs(value, currency);

  async function askAi() {
    const symbol = portfolio?.holdings[0]?.symbol;
    if (!symbol) return;
    setAnalyzing(true);
    try { setAnalysis(await summarizeStock(symbol, "stable_dca")); } catch { setActionError("AI analysis could not be generated."); } finally { setAnalyzing(false); }
  }

  async function confirmSell(holding: PortfolioHolding) {
    await deleteHolding(holding.symbol);
    setSellTarget(null);
    refresh();
  }

  if (portfolioQuery.isPending && !portfolio) return <DashboardSkeleton />;

  const firstBuyDate = portfolio?.markers[0]?.date ?? portfolio?.chart[0]?.date;
  const hasPlan = (portfolio?.dcaOrders.length ?? 0) > 0;
  const showEmptyHero = !portfolio?.holdings.length && !hasPlan;

  return (
    <div className="flex flex-col gap-5 text-[#ececee]">
      {portfolioQuery.isError || actionError ? <div className="flex items-center justify-between rounded-lg border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]"><span>{actionError || "Portfolio service is unavailable."}</span><button type="button" onClick={refresh} className="rounded border border-[#f2575c] px-2 py-1 text-xs">Retry</button></div> : null}

      {showEmptyHero || !portfolio ? (
        <>
          <EmptyPortfolio onAdd={() => setShowHoldingForm(true)} />
          {portfolio ? <PlanCard portfolio={portfolio} onChanged={refresh} onAskAi={askAi} onOpenDetail={openDetail} /> : null}
        </>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
            <Stat label="Total value" value={money(summary?.totalValue)} />
            <Stat label="Invested (cost)" value={money(summary?.invested)} />
            <Stat label="Total gain / loss" value={money(summary?.gainLoss)} sub={formatPercent(summary?.gainLossPct)} tone={(summary?.gainLoss ?? 0) >= 0 ? "good" : "bad"} />
            <Stat label="Dividends YTD" value={money(summary?.dividendsYtd)} sub={`${summary?.forwardYield ?? 0}% forward yield`} />
          </section>

          <section className="grid gap-[14px] xl:grid-cols-[1fr_320px]">
            <div className={`${card} px-[18px] pb-[14px] pt-[18px]`}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">Portfolio value</h2>
                  <div className="mt-1 text-[11px] text-[#8c8c95]">Investing since <span className="font-mono text-[#74a4ff]">{formatShortDate(firstBuyDate)}</span></div>
                  <div className="mt-2 flex gap-4 text-[11px] text-[#8c8c95]"><Legend color="#3ecf8e" label="Value" /><Legend color="#5a5a62" label="Cost basis" dashed /><Legend color="#3ecf8e" label="DCA buy" dot /></div>
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

          <section className="grid gap-[14px] lg:grid-cols-2"><div className={`${card} p-[18px]`}><h2 className="font-semibold">DCA performance</h2><p className="mt-1 text-xs text-[#8c8c95]">Portfolio path with actual contribution dates</p><div className="mt-3 h-52"><DcaPerformanceChart data={portfolio}/></div></div><div className={`${card} p-[18px]`}><h2 className="font-semibold">Allocation</h2><p className="mt-1 text-xs text-[#8c8c95]">Live position value by sector</p><div className="mt-3 h-52"><AllocationChart data={portfolio}/></div></div></section>
        </>
      )}

      <section className="grid gap-[14px] xl:grid-cols-[1fr_320px]">
        <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#2a2a31] px-5 py-4"><h2 className="font-semibold">Holdings</h2><span className="font-mono text-xs text-[#8c8c95]">{portfolio?.holdings.length ?? 0} positions</span></div>
          <div className="divide-y divide-[#23232a]">
            {portfolio?.holdings.map((holding) => {
              const good = holding.gainLoss >= 0;
              return (
                <div key={holding.symbol} className="grid w-full grid-cols-[1fr_repeat(3,minmax(80px,110px))_70px_auto] items-center gap-3 px-5 py-3 text-left hover:bg-[#1c1c20]">
                  <button type="button" onClick={() => openDetail(holding.symbol)} className="min-w-0 text-left"><strong>{holding.symbol}</strong><div className="truncate text-xs text-[#8c8c95]">{holding.name}</div></button>
                  <Cell label="Value" value={money(holding.value)} />
                  <Cell label="Since buy" value={formatPercent(holding.gainLossPct)} good={good} />
                  <Cell label="Yield" value={holding.story?.match(/[\d.]+% yield/)?.[0] ?? "—"} />
                  <Sparkline values={[holding.averageCost, holding.price]} color={good ? "#3ecf8e" : "#f2575c"} />
                  <button type="button" onClick={() => setSellTarget(holding)} className="justify-self-end rounded-lg border border-[#2a2a31] px-3 py-1.5 text-xs text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c]">Sell</button>
                </div>
              );
            })}
          </div>
          {!portfolio?.holdings.length ? <div className="px-5 py-10 text-center text-sm text-[#5a5a62]">Add a holding to begin tracking real performance.</div> : null}
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Upcoming income</h2><span className="text-xs text-[#8c8c95]">Live calendar</span></div>
          <div className="mt-4 space-y-3">{portfolio?.incomeEvents.map((event) => <div key={`${event.date}-${event.symbol}-${event.kind}`} className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${event.kind === "payment" ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`} /><div className="flex-1"><div className="text-sm font-semibold">{event.symbol} · {event.kind}</div><div className="text-xs text-[#8c8c95]">{event.date}</div></div><span className="font-mono text-xs text-[#3ecf8e]">{event.amount ? `+${money(event.amount)}` : "—"}</span></div>)}</div>
          {!portfolio?.incomeEvents.length ? <p className="mt-8 text-center text-sm text-[#5a5a62]">No upcoming dividend events reported.</p> : null}
        </div>
      </section>

      <section className={`${card} flex items-center justify-between gap-5 border-[#285f48] p-5`}><div><div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div><h2 className="mt-1 text-lg font-semibold">Need a second opinion on this month?</h2><p className="mt-1 text-sm text-[#8c8c95]">AI runs only after you ask and uses live technicals and fundamentals.</p></div><button type="button" disabled={!portfolio?.holdings.length || analyzing} onClick={askAi} className="rounded-lg bg-[#3ecf8e] px-5 py-3 text-sm font-bold text-[#06120c] disabled:opacity-40">{analyzing ? "Analyzing…" : "Suggest my next move"}</button></section>
      {analyzing ? <div className="flex items-center justify-center gap-3.5 rounded-xl border border-[#2a2a31] bg-[#141417] p-[34px] text-[#8c8c95]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Analyzing your portfolio…</div> : null}
      {analysis ? <AiVerdictCard value={analysis} onRerun={askAi} size="modal" /> : null}

      {showHoldingForm ? <HoldingForm onClose={() => setShowHoldingForm(false)} onSaved={() => { setShowHoldingForm(false); refresh(); }} /> : null}
      {sellTarget ? <SellModal holding={sellTarget} currency={currency} onClose={() => setSellTarget(null)} onConfirm={() => confirmSell(sellTarget)} /> : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) { return <div className={`${card} px-[18px] py-4`}><div className="text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">{label}</div><div className={`mt-[7px] font-mono text-[25px] font-semibold tracking-[-0.5px] ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : ""}`}>{value}</div>{sub ? <div className="mt-px font-mono text-xs text-[#8c8c95]">{sub}</div> : null}</div>; }
function Cell({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div><div className="text-[10px] uppercase text-[#5a5a62]">{label}</div><div className={`mt-1 font-mono text-sm ${good === true ? "text-[#3ecf8e]" : good === false ? "text-[#f2575c]" : ""}`}>{value}</div></div>; }
function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) { return <span className="flex items-center gap-1.5"><span className={dot ? "h-2 w-2 rounded-full" : "h-0 w-3 border-t-2"} style={{ background: dot ? color : undefined, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />{label}</span>; }

function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[#2a2a31] bg-gradient-to-b from-[#15171a] to-[#0f1011] px-6 py-16 text-center">
      <div className="mb-5 grid h-[74px] w-[74px] place-items-center rounded-2xl bg-[#08090b]">
        <span className="h-7 w-7 -rotate-45 rounded-full border-[3px] border-[#3ecf8e] border-r-transparent" />
      </div>
      <h2 className="text-[23px] font-bold tracking-[-0.4px]">Start your dividend portfolio</h2>
      <p className="mt-[9px] max-w-[460px] text-sm leading-[1.6] text-[#8c8c95]">You don't own anything yet. Find a dividend stock you like, decide how much to add this month, and AlphaWolf will track every payout as it lands.</p>
      <div className="mt-[30px] flex flex-wrap justify-center gap-3.5">
        <OnboardStep n="01" title="Scan for stocks" body="Search US or Thai dividend payers and see an AI match score for your plan." />
        <OnboardStep n="02" title="Set your amount" body="Add a stock to a month and type how much you'll invest — any amount, any month." />
        <OnboardStep n="03" title="Track the income" body="Watch dividends land on the calendar and your value grow over time." />
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
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await saveHolding({ symbol: value.symbol, shares: Number(value.shares), averageCost: Number(value.averageCost), monthlyDca: Number(value.monthlyDca || 0), strategy: "stable_dca" }); onSaved(); };
  return <Modal title="Add or update holding" onClose={onClose}><form onSubmit={submit} className="grid gap-3"><input required className={input} placeholder="Ticker, e.g. KO" value={value.symbol} onChange={(e) => setValue({ ...value, symbol: e.target.value.toUpperCase() })}/><input required type="number" step="any" className={input} placeholder="Shares" value={value.shares} onChange={(e) => setValue({ ...value, shares: e.target.value })}/><input required type="number" step="any" className={input} placeholder="Average cost" value={value.averageCost} onChange={(e) => setValue({ ...value, averageCost: e.target.value })}/><input type="number" step="any" className={input} placeholder="Monthly DCA amount" value={value.monthlyDca} onChange={(e) => setValue({ ...value, monthlyDca: e.target.value })}/><button className="mt-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Save holding</button></form></Modal>;
}

function SellModal({ holding, currency, onClose, onConfirm }: { holding: PortfolioHolding; currency: "USD" | "THB"; onClose: () => void; onConfirm: () => void }) {
  const proceeds = holding.shares * holding.price;
  const money = (value: number) => formatMoneyAs(value, currency);
  return (
    <Modal title={`Sell ${holding.symbol}`} onClose={onClose}>
      <p className="text-[13px] leading-[1.6] text-[#bcbcc2]">This places a market order to sell <span className="text-[#ececee]">all {holding.shares} shares</span> at the current price. Cash settles in 1–2 business days.</p>
      <div className="mt-4 overflow-hidden rounded-[11px] border border-[#2a2a31]">
        <Row label="Shares" value={String(holding.shares)} />
        <Row label="Current price" value={money(holding.price)} />
        <Row label="Realized P/L" value={money(holding.gainLoss)} color={holding.gainLoss >= 0 ? "#3ecf8e" : "#f2575c"} />
        <div className="flex items-center justify-between bg-[#121215] px-[15px] py-[14px]"><span className="font-semibold">Estimated proceeds</span><span className="font-mono text-[17px] font-semibold text-[#3ecf8e]">{money(proceeds)}</span></div>
      </div>
      <div className="mt-4 flex gap-2.5">
        <button type="button" onClick={onClose} className="flex-1 rounded-[10px] border border-[#2a2a31] py-3 text-[13.5px] font-medium hover:border-[#8c8c95]">Cancel</button>
        <button type="button" onClick={onConfirm} className="flex-1 rounded-[10px] bg-[#f2575c] py-3 text-[13.5px] font-bold text-[#1a0608] hover:bg-[#e04349]">Sell all shares</button>
      </div>
    </Modal>
  );
}
function Row({ label, value, color }: { label: string; value: string; color?: string }) { return <div className="flex items-center justify-between border-t border-[#1f1f24] px-[15px] py-3 text-[13px] first:border-t-0"><span className="text-[#8c8c95]">{label}</span><span className="font-mono" style={{ color }}>{value}</span></div>; }

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

  const currency = useWolfStore((state) => state.currency);
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const addCashReserve = useWolfStore((state) => state.addCashReserve);
  const spendCashReserve = useWolfStore((state) => state.spendCashReserve);
  const money = (value: number) => formatMoneyAs(value, currency);

  const items = portfolio.dcaOrders.filter((order) => order.scheduledFor.startsWith(month));
  const committed = items.reduce((sum, order) => sum + order.amount, 0);
  const overReserve = items.length > 0 && committed > cashReserve;
  const canApply = items.length > 0 && committed > 0 && committed <= cashReserve;

  useEffect(() => { setApplied(null); }, [month]);

  const planSymbols = items.map((order) => order.symbol).join(",");

  useEffect(() => {
    if (!addOpen) return;
    const handle = setTimeout(() => {
      loadDiscoveries({ q: addQuery || undefined, kind: "stock", limit: 6 })
        .then((payload) => setAddResults((payload.live ?? []).filter((item) => !planSymbols.split(",").includes(item.symbol)).map((item) => ({ symbol: item.symbol, name: item.name, market: item.symbol.endsWith(".BK") ? "Thai SET" : "US" }))))
        .catch(() => setAddResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [addOpen, addQuery, month, planSymbols]);

  async function addStock(symbol: string) {
    await saveDcaOrder({ symbol, amount: 200, scheduledFor: `${month}-01`, strategy: "stable_dca" });
    setAddOpen(false);
    setAddQuery("");
    setApplied(null);
    onChanged();
  }

  async function setAmount(order: DcaOrder, raw: string) {
    const displayValue = Math.max(0, Math.min(9_999_999, parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0));
    const usd = currency === "THB" ? Math.round(displayValue / 36.5) : displayValue;
    await updateDcaOrderAmount(order.id, usd);
    setApplied(null);
    onChanged();
  }

  async function remove(order: DcaOrder) {
    await deleteDcaOrder(order.id);
    setApplied(null);
    onChanged();
  }

  function submitAddFunds(event: React.FormEvent) {
    event.preventDefault();
    const displayValue = Number(addFundsAmount);
    if (!displayValue || displayValue <= 0) return;
    const usd = currency === "THB" ? displayValue / 36.5 : displayValue;
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

      <div className="mt-3 flex items-center justify-between gap-2.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-[14px] py-[13px]">
        <div className="min-w-0">
          <div className="text-[11px] text-[#8c8c95]">Cash to invest</div>
          <div className="mt-0.5 font-mono text-[23px] font-bold tracking-[-0.5px]">{money(cashReserve)}</div>
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
          <span className="text-[#3ecf8e]">Bought {money(applied.amount)} across {applied.count} stock{applied.count === 1 ? "" : "s"} at today's price — check your holdings below.</span>
          <button type="button" onClick={() => setApplied(null)} className="text-[#82b99f] hover:text-[#ececee]">Dismiss</button>
        </div>
      ) : null}

      <div className="mt-[13px] flex flex-col gap-[11px]">
        {items.map((order) => (
          <div key={order.id} className="flex items-center gap-[9px]">
            <button type="button" onClick={() => onOpenDetail(order.symbol)} className="min-w-0 flex-1 text-left text-[13px] font-medium">{order.symbol}</button>
            <input
              key={`${order.id}-${currency}`}
              defaultValue={String(Math.round(order.amount * (currency === "THB" ? 36.5 : 1)))}
              onBlur={(event) => setAmount(order, event.target.value)}
              className="w-[88px] flex-none rounded-md border border-[#2a2a31] bg-[#0e0e10] px-2 py-1 text-right font-mono text-[12.5px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
            <StepperButton label="×" hoverColor="#f2575c" onClick={() => remove(order)} />
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
            {addResults.map((item) => (
              <button key={item.symbol} type="button" onClick={() => addStock(item.symbol)} className="flex w-full items-center gap-[9px] border-t border-[#1a1a1e] px-3 py-2.5 text-left hover:bg-[#161619]">
                <span className="w-[54px] flex-none font-mono text-[12.5px] font-semibold">{item.symbol}</span>
                <span className="flex-none rounded-[4px] border border-[#2a2a31] px-[5px] py-px text-[9.5px] text-[#8c8c95]">{item.market}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#8c8c95]">{item.name}</span>
                <span className="flex-none font-mono text-[11.5px] text-[#3ecf8e]">+{money(200)}</span>
              </button>
            ))}
            {!addResults.length ? <div className="p-3.5 text-center text-xs text-[#8c8c95]">Everything matching is already in the plan.</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-[14px] flex items-center justify-between border-t border-[#2a2a31] pt-[13px]">
        <div><div className={`text-xs font-semibold ${overReserve ? "text-[#f2575c]" : "text-[#3ecf8e]"}`}>{overReserve ? "Over your cash to invest" : "Committed"}</div><div className="text-[11px] text-[#8c8c95]">of {money(cashReserve)} cash to invest</div></div>
        <span className={`font-mono text-lg font-semibold ${overReserve ? "text-[#f2575c]" : "text-[#ececee]"}`}>{money(committed)}</span>
      </div>

      <button type="button" onClick={applyPlan} disabled={!canApply || applying} className="mt-[10px] flex w-full items-center justify-center gap-[7px] rounded-lg bg-[#3ecf8e] py-2.5 text-[13px] font-bold text-[#06120c] disabled:cursor-not-allowed disabled:bg-[#23232a] disabled:text-[#5a5a62]">
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
            <input autoFocus required type="number" min="1" step="any" className={input} placeholder={`Amount in ${currency}`} value={addFundsAmount} onChange={(event) => setAddFundsAmount(event.target.value)} />
            <button className="mt-1 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Add to cash to invest</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function StepperButton({ label, hoverColor, onClick }: { label: string; hoverColor: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md border border-[#2a2a31] bg-[#0e0e10] text-[15px] leading-none text-[#8c8c95] hover:text-[#ececee]"
      onMouseEnter={(event) => (event.currentTarget.style.borderColor = hoverColor)}
      onMouseLeave={(event) => (event.currentTarget.style.borderColor = "")}
    >
      {label}
    </button>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md rounded-xl border border-[#34343c] bg-[#161619] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-[#8c8c95]">×</button></div>{children}</div></div>; }
function DashboardSkeleton() { return <div className="grid gap-4"><div className="grid grid-cols-4 gap-3">{[1,2,3,4].map((item) => <div key={item} className="skeleton-block h-24" />)}</div><div className="skeleton-block h-96" /></div>; }
