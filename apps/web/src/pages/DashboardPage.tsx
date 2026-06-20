import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatPercent } from "../lib/format";
import { loadPortfolio, saveDcaOrder, saveHolding, summarizeStock, type PortfolioDashboard, type StockAnalysisResponse } from "../lib/api";
import { useWolfStore } from "../store/useWolfStore";

const card = "rounded-xl border border-[#2a2a31] bg-[#161619]";
const input = "h-10 rounded-lg border border-[#34343c] bg-[#0e0e10] px-3 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function DashboardPage() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const setPortfolioSummary = useWolfStore((state) => state.setPortfolioSummary);
  const [portfolio, setPortfolio] = useState<PortfolioDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);

  const refresh = () => {
    setLoading(true);
    loadPortfolio().then((data) => {
      setPortfolio(data);
      setPortfolioSummary(data.summary.totalValue, data.summary.gainLossPct);
      setError("");
    }).catch(() => setError("Portfolio service is unavailable.")).finally(() => setLoading(false));
  };

  useEffect(refresh, [setPortfolioSummary]);
  const chartPath = useMemo(() => linePath(portfolio?.chart.map((point) => point.value) ?? []), [portfolio]);
  const costPath = useMemo(() => linePath(portfolio?.chart.map((point) => point.cost) ?? []), [portfolio]);
  const summary = portfolio?.summary;

  async function askAi() {
    const symbol = portfolio?.holdings[0]?.symbol;
    if (!symbol) return;
    setAnalyzing(true);
    try { setAnalysis(await summarizeStock(symbol, "stable_dca")); } catch { setError("AI analysis could not be generated."); } finally { setAnalyzing(false); }
  }

  if (loading && !portfolio) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-5 text-[#ececee]">
      {error ? <div className="rounded-lg border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">{error}</div> : null}

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
            <div className="relative mt-1 h-[300px]">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                <defs><linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ecf8e" stopOpacity=".28"/><stop offset="1" stopColor="#3ecf8e" stopOpacity="0"/></linearGradient></defs>
                <path d={`${chartPath} L100 100 L0 100Z`} fill="url(#portfolioFill)"/><path d={costPath} fill="none" stroke="#5a5a62" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/><path d={chartPath} fill="none" stroke="#3ecf8e" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
              </svg>
              {portfolio.markers.map((marker) => <span key={`${marker.date}-${marker.symbol}`} title={`${marker.symbol} DCA ${formatMoney(marker.amount)}`} className="absolute bottom-[12%] h-2.5 w-2.5 rounded-full border-2 border-[#0e0e10] bg-[#f5c451]" style={{ left: markerPosition(marker.date, portfolio.chart) }} />)}
            </div>
          </div>

          <div className={`${card} px-[18px] py-4`}>
            <div className="flex items-center justify-between"><h2 className="font-semibold">This month’s DCA plan</h2><button type="button" onClick={() => setShowPlanForm(true)} className="text-xs font-semibold text-[#3ecf8e]">Add</button></div>
            <div className="mt-4 space-y-3">{portfolio.dcaOrders.map((order) => <button key={order.id} type="button" onClick={() => openDetail(order.symbol)} className="w-full rounded-lg border border-[#2a2a31] bg-[#0e0e10] p-3 text-left"><div className="flex justify-between"><strong>{order.symbol}</strong><span className="font-mono text-[#3ecf8e]">{formatMoney(order.amount)}</span></div><div className="mt-1 text-xs text-[#8c8c95]">{order.scheduledFor} · {order.status}</div></button>)}</div>
            {!portfolio.dcaOrders.length ? <p className="mt-8 text-center text-sm text-[#5a5a62]">No DCA placements scheduled.</p> : null}
          </div>
        </section>
      )}

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
      {analysis ? <section className={`${card} border-[#285f48] p-5`}><div className="font-mono text-2xl font-semibold text-[#3ecf8e]">{analysis.score}/100</div><h3 className="mt-2 font-semibold">{analysis.recommendation}</h3><p className="mt-2 text-sm leading-relaxed text-[#a7a7af]">{analysis.summary}</p>{analysis.dcaTiming ? <div className="mt-3 rounded-lg border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3 text-sm leading-relaxed text-[#bcbcc2]"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-[#f5c451]">DCA timing</span><p className="mt-1">{analysis.dcaTiming}</p></div> : null}</section> : null}

      {showHoldingForm ? <HoldingForm onClose={() => setShowHoldingForm(false)} onSaved={() => { setShowHoldingForm(false); refresh(); }} /> : null}
      {showPlanForm ? <PlanForm onClose={() => setShowPlanForm(false)} onSaved={() => { setShowPlanForm(false); refresh(); }} /> : null}
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
function PlanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ symbol: "", amount: "", scheduledFor: new Date().toISOString().slice(0, 10) });
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await saveDcaOrder({ symbol: value.symbol, amount: Number(value.amount), scheduledFor: value.scheduledFor, strategy: "stable_dca" }); onSaved(); };
  return <Modal title="Schedule DCA placement" onClose={onClose}><form onSubmit={submit} className="grid gap-3"><input required className={input} placeholder="Ticker" value={value.symbol} onChange={(e) => setValue({ ...value, symbol: e.target.value.toUpperCase() })}/><input required type="number" step="any" className={input} placeholder="Amount" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })}/><input required type="date" className={input} value={value.scheduledFor} onChange={(e) => setValue({ ...value, scheduledFor: e.target.value })}/><button className="mt-2 rounded-lg bg-[#3ecf8e] py-3 text-sm font-bold text-[#06120c]">Schedule placement</button></form></Modal>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md rounded-xl border border-[#34343c] bg-[#161619] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-[#8c8c95]">×</button></div>{children}</div></div>; }
function DashboardSkeleton() { return <div className="grid gap-4"><div className="grid grid-cols-4 gap-3">{[1,2,3,4].map((item) => <div key={item} className="skeleton-block h-24" />)}</div><div className="skeleton-block h-96" /></div>; }
function linePath(values: number[]) { if (!values.length) return "M0 100"; const min=Math.min(...values), range=Math.max(Math.max(...values)-min,1); return values.map((value,index)=>`${index?"L":"M"}${(index/(values.length-1)*100).toFixed(2)} ${(92-(value-min)/range*82).toFixed(2)}`).join(" "); }
function markerPosition(date: string, chart: Array<{ date: string }>) { if (!chart.length) return "0%"; const start=Date.parse(chart[0].date), end=Date.parse(chart.at(-1)?.date ?? chart[0].date), current=Date.parse(date); return `${Math.max(0,Math.min(100,(current-start)/Math.max(end-start,1)*100))}%`; }
