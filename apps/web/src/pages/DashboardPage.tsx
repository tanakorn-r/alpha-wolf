import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { AllocationChart, DcaPerformanceChart, PortfolioPerformanceChart } from "../components/charts/PortfolioCharts";
import { formatMoney, formatPercent } from "../lib/format";
import {
  deleteDcaOrder,
  loadDiscoveries,
  loadPortfolio,
  saveDcaOrder,
  saveHolding,
  summarizeStock,
  updateDcaOrderAmount,
  type DcaOrder,
  type PortfolioDashboard,
  type StockAnalysisResponse,
} from "../lib/api";
import { useWolfStore } from "../store/useWolfStore";

const card = "rounded-xl border border-[#2a2a31] bg-[#161619]";
const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function DashboardPage() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const [actionError, setActionError] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);

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

  if (portfolioQuery.isPending && !portfolio) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-5 text-[#ececee]">
      {portfolioQuery.isError || actionError ? <div className="flex items-center justify-between rounded-lg border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]"><span>{actionError || "Portfolio service is unavailable."}</span><button type="button" onClick={refresh} className="rounded border border-[#f2575c] px-2 py-1 text-xs">Retry</button></div> : null}

      <section className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        <Stat label="Total value" value={formatMoney(summary?.totalValue)} />
        <Stat label="Invested (cost)" value={formatMoney(summary?.invested)} />
        <Stat label="Total gain / loss" value={formatMoney(summary?.gainLoss)} sub={formatPercent(summary?.gainLossPct)} tone={(summary?.gainLoss ?? 0) >= 0 ? "good" : "bad"} />
        <Stat label="Dividends YTD" value={formatMoney(summary?.dividendsYtd)} sub={`${summary?.forwardYield ?? 0}% forward yield`} />
      </section>

      {!portfolio?.holdings.length ? <EmptyPortfolio onAdd={() => setShowHoldingForm(true)} /> : (
        <section className="grid gap-[14px] xl:grid-cols-[1fr_320px]">
          <div className={`${card} px-[18px] pb-[14px] pt-[18px]`}>
            <div className="flex items-start justify-between">
              <div><h2 className="font-semibold">Portfolio value</h2><div className="mt-2 flex gap-4 text-[11px] text-[#8c8c95]"><Legend color="#3ecf8e" label="Value" /><Legend color="#5a5a62" label="Cost basis" dashed /><Legend color="#f5c451" label="DCA buy" dot /></div></div>
              <button type="button" onClick={() => setShowHoldingForm(true)} className="rounded-lg border border-[#34343c] px-3 py-2 text-xs hover:border-[#3ecf8e]">Edit holdings</button>
            </div>
            <div className="relative mt-1 h-[300px]"><PortfolioPerformanceChart data={portfolio} loading={portfolioQuery.isPending} error={portfolioQuery.isError} onRetry={refresh} /></div>
          </div>

          <PlanCard portfolio={portfolio} onChanged={refresh} onAskAi={askAi} onOpenDetail={openDetail} />
        </section>
      )}

      {portfolio?.holdings.length ? <section className="grid gap-[14px] lg:grid-cols-2"><div className={`${card} p-[18px]`}><h2 className="font-semibold">DCA performance</h2><p className="mt-1 text-xs text-[#8c8c95]">Portfolio path with actual contribution dates</p><div className="mt-3 h-52"><DcaPerformanceChart data={portfolio}/></div></div><div className={`${card} p-[18px]`}><h2 className="font-semibold">Allocation</h2><p className="mt-1 text-xs text-[#8c8c95]">Live position value by sector</p><div className="mt-3 h-52"><AllocationChart data={portfolio}/></div></div></section> : null}

      <section className="grid gap-[14px] xl:grid-cols-[1fr_320px]">
        <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#2a2a31] px-5 py-4"><h2 className="font-semibold">Holdings</h2><span className="font-mono text-xs text-[#8c8c95]">{portfolio?.holdings.length ?? 0} positions</span></div>
          <div className="divide-y divide-[#23232a]">{portfolio?.holdings.map((holding) => <button key={holding.symbol} type="button" onClick={() => openDetail(holding.symbol)} className="grid w-full grid-cols-[1fr_repeat(4,minmax(80px,120px))] items-center gap-3 px-5 py-3 text-left hover:bg-[#1c1c20]"><div><strong>{holding.symbol}</strong><div className="text-xs text-[#8c8c95]">{holding.name}</div></div><Cell label="Value" value={formatMoney(holding.value)} /><Cell label="Gain" value={formatPercent(holding.gainLossPct)} good={holding.gainLoss >= 0} /><Cell label="Yield" value={holding.story?.match(/[\d.]+% yield/)?.[0] ?? "—"} /><Cell label="Monthly DCA" value={holding.monthlyDca ? formatMoney(holding.monthlyDca) : "—"} /></button>)}</div>
          {!portfolio?.holdings.length ? <div className="px-5 py-10 text-center text-sm text-[#5a5a62]">Add a holding to begin tracking real performance.</div> : null}
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Upcoming income</h2><span className="text-xs text-[#8c8c95]">Live calendar</span></div>
          <div className="mt-4 space-y-3">{portfolio?.incomeEvents.map((event) => <div key={`${event.date}-${event.symbol}-${event.kind}`} className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${event.kind === "payment" ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`} /><div className="flex-1"><div className="text-sm font-semibold">{event.symbol} · {event.kind}</div><div className="text-xs text-[#8c8c95]">{event.date}</div></div><span className="font-mono text-xs text-[#3ecf8e]">{event.amount ? `+${formatMoney(event.amount)}` : "—"}</span></div>)}</div>
          {!portfolio?.incomeEvents.length ? <p className="mt-8 text-center text-sm text-[#5a5a62]">No upcoming dividend events reported.</p> : null}
        </div>
      </section>

      <section className={`${card} flex items-center justify-between gap-5 border-[#285f48] p-5`}><div><div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">AI · on demand</div><h2 className="mt-1 text-lg font-semibold">Need a second opinion on this month?</h2><p className="mt-1 text-sm text-[#8c8c95]">AI runs only after you ask and uses live technicals and fundamentals.</p></div><button type="button" disabled={!portfolio?.holdings.length || analyzing} onClick={askAi} className="rounded-lg bg-[#3ecf8e] px-5 py-3 text-sm font-bold text-[#06120c] disabled:opacity-40">{analyzing ? "Analyzing…" : "Suggest my next move"}</button></section>
      {analyzing ? <div className="flex items-center justify-center gap-3.5 rounded-xl border border-[#2a2a31] bg-[#141417] p-[34px] text-[#8c8c95]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Analyzing your portfolio…</div> : null}
      {analysis ? <AiVerdictCard value={analysis} onRerun={askAi} size="modal" /> : null}

      {showHoldingForm ? <HoldingForm onClose={() => setShowHoldingForm(false)} onSaved={() => { setShowHoldingForm(false); refresh(); }} /> : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) { return <div className={`${card} px-[18px] py-4`}><div className="text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">{label}</div><div className={`mt-[7px] font-mono text-[25px] font-semibold tracking-[-0.5px] ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : ""}`}>{value}</div>{sub ? <div className="mt-px font-mono text-xs text-[#8c8c95]">{sub}</div> : null}</div>; }
function Cell({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div><div className="text-[10px] uppercase text-[#5a5a62]">{label}</div><div className={`mt-1 font-mono text-sm ${good === true ? "text-[#3ecf8e]" : good === false ? "text-[#f2575c]" : ""}`}>{value}</div></div>; }
function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) { return <span className="flex items-center gap-1.5"><span className={dot ? "h-2 w-2 rounded-full" : "h-0 w-3 border-t-2"} style={{ background: dot ? color : undefined, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />{label}</span>; }
function EmptyPortfolio({ onAdd }: { onAdd: () => void }) { return <section className={`${card} flex min-h-72 flex-col items-center justify-center p-8 text-center`}><div className="grid h-12 w-12 place-items-center rounded-full border border-[#285f48] bg-[#173528] text-[#3ecf8e]">+</div><h2 className="mt-4 text-lg font-semibold">Connect your real portfolio</h2><p className="mt-2 max-w-md text-sm text-[#8c8c95]">Add shares and average cost. Cadence will calculate live value, DCA timing, income dates, and performance without seeded data.</p><button type="button" onClick={onAdd} className="mt-5 rounded-lg bg-[#3ecf8e] px-5 py-2.5 text-sm font-bold text-[#06120c]">Add first holding</button></section>; }

function HoldingForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ symbol: "", shares: "", averageCost: "", monthlyDca: "" });
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await saveHolding({ symbol: value.symbol, shares: Number(value.shares), averageCost: Number(value.averageCost), monthlyDca: Number(value.monthlyDca || 0), strategy: "stable_dca" }); onSaved(); };
  return <Modal title="Add or update holding" onClose={onClose}><form onSubmit={submit} className="grid gap-3"><input required className={input} placeholder="Ticker, e.g. KO" value={value.symbol} onChange={(e) => setValue({ ...value, symbol: e.target.value.toUpperCase() })}/><input required type="number" step="any" className={input} placeholder="Shares" value={value.shares} onChange={(e) => setValue({ ...value, shares: e.target.value })}/><input required type="number" step="any" className={input} placeholder="Average cost" value={value.averageCost} onChange={(e) => setValue({ ...value, averageCost: e.target.value })}/><input type="number" step="any" className={input} placeholder="Monthly DCA amount" value={value.monthlyDca} onChange={(e) => setValue({ ...value, monthlyDca: e.target.value })}/><button className="mt-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Save holding</button></form></Modal>;
}
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

  const budget = portfolio.holdings.reduce((sum, holding) => sum + (holding.monthlyDca || 0), 0);
  const items = portfolio.dcaOrders.filter((order) => order.scheduledFor.startsWith(month));
  const committed = items.reduce((sum, order) => sum + order.amount, 0);
  const free = budget - committed;

  useEffect(() => {
    if (!addOpen) return;
    const handle = setTimeout(() => {
      loadDiscoveries({ q: addQuery || undefined, kind: "stock", limit: 6 })
        .then((payload) => setAddResults((payload.live ?? []).filter((item) => !items.some((order) => order.symbol === item.symbol)).map((item) => ({ symbol: item.symbol, name: item.name, market: item.symbol.endsWith(".BK") ? "Thai SET" : "US" }))))
        .catch(() => setAddResults([]));
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, addQuery, month]);

  async function addStock(symbol: string) {
    await saveDcaOrder({ symbol, amount: 200, scheduledFor: `${month}-01`, strategy: "stable_dca" });
    setAddOpen(false);
    setAddQuery("");
    onChanged();
  }

  async function bump(order: DcaOrder, delta: number) {
    await updateDcaOrderAmount(order.id, Math.max(0, order.amount + delta));
    onChanged();
  }

  async function remove(order: DcaOrder) {
    await deleteDcaOrder(order.id);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] px-[18px] py-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">This month’s DCA plan</h2>
        <span className="font-mono text-xs text-[#8c8c95]">{formatMoney(budget)}/mo</span>
      </div>

      <div className="mt-[11px] flex gap-[3px] rounded-lg border border-[#2a2a31] bg-[#0e0e10] p-[3px]">
        {months.map((option) => (
          <button key={option.key} type="button" onClick={() => setMonth(option.key)} className={`flex-1 rounded-md py-1.5 text-center text-xs font-medium ${month === option.key ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}>
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-[13px] flex flex-col gap-[11px]">
        {items.map((order) => {
          const pct = budget ? Math.min(100, (order.amount / budget) * 100) : 0;
          return (
            <div key={order.id} className="flex items-center gap-[9px]">
              <button type="button" onClick={() => onOpenDetail(order.symbol)} className="min-w-0 flex-1 text-left">
                <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{order.symbol}</span><span className="font-mono text-[#8c8c95]">{formatMoney(order.amount)}</span></div>
                <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#0e0e10]"><div className="h-full rounded-[3px] bg-[#3ecf8e]" style={{ width: `${pct}%` }} /></div>
              </button>
              <div className="flex flex-none items-center gap-1">
                <StepperButton label="−" hoverColor="#3ecf8e" onClick={() => bump(order, -50)} />
                <StepperButton label="+" hoverColor="#3ecf8e" onClick={() => bump(order, 50)} />
                <StepperButton label="×" hoverColor="#f2575c" onClick={() => remove(order)} />
              </div>
            </div>
          );
        })}
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
                <span className="flex-none font-mono text-[11.5px] text-[#3ecf8e]">+$200</span>
              </button>
            ))}
            {!addResults.length ? <div className="p-3.5 text-center text-xs text-[#8c8c95]">Everything matching is already in the plan.</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-[14px] flex items-center justify-between border-t border-[#2a2a31] pt-[13px]">
        <div><div className={`text-xs font-semibold ${free >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{free >= 0 ? "Unallocated" : "Over budget"}</div><div className="text-[11px] text-[#8c8c95]">{formatMoney(committed)} committed</div></div>
        <span className={`font-mono text-lg font-semibold ${free >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatMoney(Math.abs(free))}</span>
      </div>
      <button type="button" onClick={onAskAi} className="mt-[13px] flex w-full items-center justify-center gap-[7px] rounded-lg border border-[#f5c451]/35 bg-[#f5c451]/[.07] py-2.5 text-[13px] font-medium text-[#f5c451] hover:bg-[#f5c451]/[.13]">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.6 4.3L14 7l-4.4 1.2L8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5z" fill="#f5c451" /></svg>
        Ask AI where to place it
      </button>
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
function linePath(values: number[]) { if (!values.length) return "M0 100"; const min=Math.min(...values), range=Math.max(Math.max(...values)-min,1); return values.map((value,index)=>`${index?"L":"M"}${(index/(values.length-1)*100).toFixed(2)} ${(92-(value-min)/range*82).toFixed(2)}`).join(" "); }
function markerPosition(date: string, chart: Array<{ date: string }>) { if (!chart.length) return "0%"; const start=Date.parse(chart[0].date), end=Date.parse(chart.at(-1)?.date ?? chart[0].date), current=Date.parse(date); return `${Math.max(0,Math.min(100,(current-start)/Math.max(end-start,1)*100))}%`; }
