import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AiVerdictCard } from "../../components/AiVerdictCard";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { TickerPerformanceChart } from "../../components/charts/TickerPerformanceChart";
import { buildChartPath } from "../../lib/chart";
import { formatBig, formatCurrency, formatMoney, formatMultiple, formatNumber, formatPercent, formatShortDate } from "../../lib/format";
import { deleteDcaOrder, loadMarketComparison, loadPortfolio, loadStockDetail, loadStockResearch, saveDcaOrder, summarizeStock, type MarketComparisonResponse, type StockAnalysisResponse, type StockDetailResponse, type StockResearchResponse } from "../../lib/api";
import { negative, panel, positive } from "../../lib/ui";
import { useWolfStore } from "../../store/useWolfStore";

const returnWindows = ["ytd", "1y", "2y", "3y", "4y"] as const;
type ResearchTab = "overview" | "consensus" | "financials" | "calendar" | "market";
type ReturnWindow = (typeof returnWindows)[number];

export function StockDetailDrawer() {
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const detailOpen = useWolfStore((state) => state.detailOpen);
  const closeDetail = useWolfStore((state) => state.closeDetail);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ResearchTab>("overview");
  const [research, setResearch] = useState<StockResearchResponse | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [market, setMarket] = useState<MarketComparisonResponse | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["stock-detail", selectedSymbol, selectedStrategy],
    queryFn: () => loadStockDetail(selectedSymbol, selectedStrategy),
    enabled: detailOpen && Boolean(selectedSymbol)
  });
  const detail = detailQuery.data ?? null;
  const loading = detailQuery.isPending && detailOpen;
  const planQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio, enabled: detailOpen });
  const planItem = planQuery.data?.dcaOrders.find((item) => item.symbol === selectedSymbol && item.status === "planned");
  const planMutation = useMutation({
    mutationFn: async () => {
      if (planItem) return deleteDcaOrder(planItem.id);
      const now = new Date();
      return saveDcaOrder({ symbol: selectedSymbol, amount: 200, scheduledFor: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, strategy: selectedStrategy });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio"] })
  });

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    drawerRef.current?.scrollTo({ top: 0 });
    setError("");
    setAnalysis(null);
    setResearch(null);
    setTab("overview");
    setMarket(null);
  }, [detailOpen, selectedSymbol]);

  const performancePath = useMemo(() => buildChartPath(detail?.performance?.line ?? []), [detail]);

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDetail(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [detailOpen, closeDetail]);

  async function analyze() {
    if (!selectedSymbol) return;
    setError("");
    setAnalyzing(true);
    try {
      setAnalysis(await summarizeStock(selectedSymbol, selectedStrategy));
    } catch {
      setError("AI analysis is unavailable. Check the API configuration.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function selectTab(nextTab: ResearchTab) {
    setTab(nextTab);
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    if (nextTab === "overview" || !selectedSymbol) return;
    setResearchLoading(true);
    try {
      if (nextTab === "market") {
        if (!market) setMarket(await loadMarketComparison(selectedSymbol));
      } else if (!research) {
        setResearch(await loadStockResearch(selectedSymbol));
      }
    } catch { setError("The extended yfinance research feed is unavailable."); } finally { setResearchLoading(false); }
  }

  return (
    <>
      <button type="button" aria-label="Close stock detail" onClick={closeDetail} className={`aw-overlay fixed inset-0 z-30 bg-slate-900/30 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside ref={drawerRef} onClick={closeDetail} className={`aw-drawer fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-6 py-8 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-label="Stock detail panel">
        <div onClick={(event) => event.stopPropagation()} className="relative w-[940px] max-w-full overflow-hidden rounded-2xl border border-[#2a2a31] bg-[#0e0e10] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <DrawerHeader detail={detail} symbol={selectedSymbol} onClose={closeDetail} />
          <div className="flex max-h-[calc(100vh-180px)] flex-col gap-4 overflow-y-auto p-[22px]">
            {loading ? <DetailSkeleton symbol={selectedSymbol} /> : null}
            {detailQuery.isError ? <div className={`${panel} flex items-center justify-between text-sm text-[#f2575c]`}>Unable to load live stock detail.<button type="button" disabled={detailQuery.isFetching} onClick={() => detailQuery.refetch()} className="flex items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">{detailQuery.isFetching ? <LoadingSpinner size={12} /> : null}Retry</button></div> : null}
            {error ? <div className={`${panel} text-sm text-rose-600`}>{error}</div> : null}
            {detail && !loading ? <>
              <AiGate symbol={detail.stock.symbol} analysis={analysis} analyzing={analyzing} onAnalyze={analyze} />
              <div className="flex items-center justify-between gap-3"><div className="text-[12.5px] text-[#8c8c95]">The full picture <strong className="font-normal text-[#ececee]">— live yfinance research with AI only on request.</strong></div><button type="button" disabled={planMutation.isPending} onClick={() => planMutation.mutate()} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${planItem ? "border border-[#663438] text-[#f2575c]" : "bg-[#3ecf8e] text-[#06120c]"}`}>{planMutation.isPending ? <LoadingSpinner size={12} /> : null}{planMutation.isPending ? "Saving…" : planItem ? "Remove from Plan" : "Add to Plan"}</button></div>
              <ResearchTabs ref={tabsRef} active={tab} onSelect={selectTab} />
              {tab === "overview" ? <DetailContent detail={detail} performancePath={performancePath} /> : researchLoading ? <DetailSkeleton symbol={selectedSymbol} /> : tab === "market" ? <MarketResearch market={market} analyzing={analyzing} onAnalyze={analyze} /> : <ResearchContent tab={tab} research={research} detail={detail} />}
            </> : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function ResearchTabs({ ref, active, onSelect }: { ref: React.Ref<HTMLDivElement>; active: ResearchTab; onSelect: (tab: ResearchTab) => void }) {
  return <div ref={ref} className="sticky top-0 z-10 flex scroll-mt-0 gap-6 border-b border-[#2a2a31] bg-[#0e0e10]/95 backdrop-blur">{(["overview", "consensus", "financials", "calendar", "market"] as const).map((tab) => <button key={tab} type="button" onClick={() => onSelect(tab)} className={`-mb-px border-b-2 px-0 py-2.5 text-[13px] font-medium capitalize ${active === tab ? "border-[#3ecf8e] text-[#ececee]" : "border-transparent text-[#8c8c95]"}`}>{tab === "consensus" ? "Wall St." : tab}</button>)}</div>;
}

const REC_SEGMENTS: Array<{ key: string; label: string; color: string }> = [
  { key: "strongBuy", label: "Strong buy", color: "#3ecf8e" },
  { key: "buy", label: "Buy", color: "#74a4ff" },
  { key: "hold", label: "Hold", color: "#f5c451" },
  { key: "sell", label: "Sell", color: "#f2575c" },
  { key: "strongSell", label: "Strong sell", color: "#b03038" },
];

function MarketResearch({ market, analyzing, onAnalyze }: { market: MarketComparisonResponse | null; analyzing: boolean; onAnalyze: () => void }) {
  if (!market) return <div className={panel}>No market comparison was reported.</div>;
  const gap = market.stock.returnPct - market.benchmark.returnPct;
  const beating = gap >= 0;
  return <div className="flex flex-col gap-[14px]">
    <div className={`${panel} p-[18px]`}>
      <div className="flex items-start justify-between gap-5"><div><h3 className={`text-lg font-bold ${beating ? "text-[#3ecf8e]" : "text-[#f5c451]"}`}>{market.stock.symbol} is {beating ? "beating" : "lagging"} the market</h3><p className="mt-1 text-[13px] text-[#8c8c95]">Total return, last 12 months · every series rebased to 100</p></div><button type="button" onClick={onAnalyze} disabled={analyzing} className="flex flex-none items-center gap-2 rounded-[10px] border border-[#3ecf8e] bg-[#3ecf8e]/5 px-4 py-2.5 text-[13px] font-semibold text-[#3ecf8e]">{analyzing ? <LoadingSpinner size={12} /> : null}✦ {analyzing ? "Analyzing…" : "Ask AI: can it beat the market?"}</button></div>
      <div className="mt-4 h-[310px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={market.points} margin={{ top: 10, right: 8, bottom: 2, left: 0 }}><CartesianGrid stroke="#2a2a31" strokeDasharray="2 7" vertical={false}/><XAxis dataKey="date" hide/><YAxis domain={["auto", "auto"]} hide/><Tooltip contentStyle={{ background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee" }} formatter={(value) => `${Number(value).toFixed(1)}`}/><Line type="monotone" dataKey="stock" name={`${market.stock.symbol} · this stock`} stroke="#3ecf8e" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="peer" name={`${market.peer.symbol} · industry leader`} stroke="#f5c451" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="benchmark" name={market.benchmark.name} stroke="#676771" strokeWidth={2} strokeDasharray="6 5" dot={false}/></LineChart></ResponsiveContainer></div>
      <div className="mt-1 flex flex-wrap gap-6 text-[12px] text-[#8c8c95]"><LegendLine color="#3ecf8e" label={`${market.stock.symbol} · this stock`}/><LegendLine color="#f5c451" label={`${market.peer.symbol} · industry leader`}/><LegendLine color="#676771" label={market.benchmark.name} dashed/></div>
    </div>
    <div className="grid grid-cols-3 gap-[14px]"><ReturnCard label={`${market.stock.symbol} · this stock`} value={market.stock.returnPct} tone="stock"/><ReturnCard label={market.benchmark.name} value={market.benchmark.returnPct} badge={`${beating ? "Beating +" : "Lagging −"}${Math.abs(gap).toFixed(1)}%`} good={beating} tone="benchmark"/><ReturnCard label={`${market.peer.symbol} · industry leader`} value={market.peer.returnPct} description={market.peer.name} tone="peer"/></div>
  </div>;
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) { return <span className="flex items-center gap-2"><span className="w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}/>{label}</span>; }
function ReturnCard({ label, value, badge, good, description, tone }: { label: string; value: number; badge?: string; good?: boolean; description?: string; tone: "stock" | "benchmark" | "peer" }) { const valueColor = value < 0 ? "text-[#f2575c]" : tone === "peer" ? "text-[#f5c451]" : tone === "benchmark" ? "text-[#ececee]" : "text-[#3ecf8e]"; return <div className={`${panel} relative p-[18px]`}><div className="text-[11px] uppercase tracking-[.08em] text-[#8c8c95]">{label}</div>{badge ? <span className={`absolute right-[18px] top-[15px] rounded-md border px-2 py-1 font-mono text-[10px] font-semibold ${good ? "border-[#3ecf8e] text-[#3ecf8e]" : "border-[#f2575c] text-[#f2575c]"}`}>{badge}</span> : null}<div className={`mt-4 font-mono text-[28px] font-semibold ${valueColor}`}>{formatPercent(value)}</div><div className="mt-1 truncate text-xs text-[#8c8c95]">{description ?? "12-month total return"}</div></div>; }

function ResearchContent({ tab, research, detail }: { tab: ResearchTab; research: StockResearchResponse | null; detail: StockDetailResponse }) {
  if (!research) return <div className={panel}>No research data was reported.</div>;
  if (tab === "consensus") return <AnalystSection research={research} detail={detail} />;
  if (tab === "financials") return <FinancialsSection research={research} />;
  return <CalendarSection research={research} />;
}

function AnalystSection({ research, detail }: { research: StockResearchResponse; detail: StockDetailResponse }) {
  const summary = (research.recommendationsSummary?.[0] ?? {}) as Record<string, number>;
  const total = REC_SEGMENTS.reduce((sum, segment) => sum + (summary[segment.key] ?? 0), 0);
  const targets = research.analystPriceTargets as { current?: number; low?: number; high?: number; mean?: number } | undefined;
  const current = targets?.current ?? detail.stock.price;
  const low = targets?.low ?? current;
  const high = targets?.high ?? current;
  const mean = targets?.mean ?? current;
  const range = Math.max(high - low, 1);
  const curPct = Math.min(100, Math.max(0, ((current - low) / range) * 100));
  const meanPct = Math.min(100, Math.max(0, ((mean - low) / range) * 100));
  const upside = current ? ((mean - current) / current) * 100 : 0;
  const bullish = (summary.strongBuy ?? 0) + (summary.buy ?? 0);
  const neutral = summary.hold ?? 0;
  const bearish = (summary.sell ?? 0) + (summary.strongSell ?? 0);
  const consensusLabel = describeConsensus(detail.business?.analystScore, bullish, neutral, bearish);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className={panel}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">Analyst recommendations</div>
              <div className="mt-1 text-[12.5px] text-[#8c8c95]">{consensusLabel}</div>
            </div>
            <div className="text-right">
              <div className={`font-mono text-lg font-semibold ${analystScoreTone(detail.business?.analystScore)}`}>{detail.business?.analystRating ?? "Hold"}</div>
              <div className="mt-0.5 font-mono text-[12px] text-[#8c8c95]">{formatNumber(detail.business?.analystScore)} / 5.00</div>
            </div>
          </div>
          <div className="my-3.5 flex h-3 overflow-hidden rounded-md bg-[#0e0e10]">
            {REC_SEGMENTS.map((segment) => <div key={segment.key} style={{ width: total ? `${((summary[segment.key] ?? 0) / total) * 100}%` : 0, background: segment.color }} />)}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <ConsensusStat label="Bullish" value={bullish} tone="good" />
            <ConsensusStat label="Neutral" value={neutral} tone="neutral" />
            <ConsensusStat label="Bearish" value={bearish} tone="bad" />
          </div>
          <div className="flex flex-col gap-[7px]">{REC_SEGMENTS.map((segment) => <div key={segment.key} className="flex justify-between text-[12.5px]"><span className="text-[#bcbcc2]">{segment.label}</span><span className="font-mono text-[#8c8c95]">{summary[segment.key] ?? 0}</span></div>)}</div>
        </div>
        <div className={panel}>
          <div className="flex items-baseline justify-between"><div className="font-semibold">Price target</div><span className={`font-mono font-semibold ${upside >= 0 ? positive : negative}`}>{formatPercent(upside)}</span></div>
          <div className="relative mt-[26px] h-[54px]">
            <div className="absolute left-0 right-0 top-6 h-[5px] rounded-[3px]" style={{ background: "linear-gradient(90deg,#f2575c,#f5c451,#3ecf8e)" }} />
            <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${curPct}%`, top: "14px" }}><div className="h-6 w-[3px] rounded-sm bg-[#ececee]" /><div className="mt-[3px] whitespace-nowrap font-mono text-[11px]">now {formatMoney(current)}</div></div>
            <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${meanPct}%`, top: "-22px" }}><div className="whitespace-nowrap font-mono text-[11px] text-[#3ecf8e]">target {formatMoney(mean)}</div><div className="mt-0.5 h-[22px] w-[3px] rounded-sm bg-[#3ecf8e]" /></div>
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[#8c8c95]"><span>low {formatMoney(low)}</span><span>high {formatMoney(high)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}>
          <div className="mb-3 font-semibold">Earnings estimate <span className="font-mono text-xs font-normal text-[#5a5a62]">EPS</span></div>
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr] pb-[7px] text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]"><span>Period</span><span className="text-right">Avg</span><span className="text-right">Low</span><span className="text-right">High</span><span className="text-right">#</span></div>
          {(research.earningsEstimate ?? []).map((row, index) => <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr] border-t border-[#1f1f24] py-2 font-mono text-[12.5px]"><span className="font-sans text-[#bcbcc2]">{formatEstimatePeriod(String(row.period ?? ""))}</span><span className="text-right">{formatNumber(row.avg as number)}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.low as number)}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.high as number)}</span><span className="text-right text-[#5a5a62]">{String(row.numberOfAnalysts ?? "—")}</span></div>)}
        </div>
        <div className={panel}>
          <div className="mb-3 font-semibold">Growth estimates <span className="font-mono text-xs font-normal text-[#5a5a62]">vs. index</span></div>
          <div className="flex flex-col gap-[9px]">{(research.growthEstimates ?? []).map((row, index) => { const value = (row.stockTrend ?? row.indexTrend) as number | null; const pct = Math.min(100, Math.max(0, ((value ?? 0) + 0.3) / 0.6 * 100)); return <div key={index} className="flex items-center gap-3"><span className="w-[92px] flex-none text-[12.5px] text-[#bcbcc2]">{formatEstimatePeriod(String(row.period ?? ""))}</span><div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#0e0e10]"><div className="h-full rounded-[3px] bg-[#3ecf8e]" style={{ width: `${pct}%` }} /></div><span className="w-[72px] flex-none text-right font-mono text-[12.5px] text-[#3ecf8e]">{value != null ? formatPercent(value * 100) : "—"}</span></div>; })}</div>
        </div>
      </div>
    </>
  );
}

function FinancialsSection({ research }: { research: StockResearchResponse }) {
  const history = [...(research.incomeStatement?.history ?? [])].reverse();
  const maxRevenue = Math.max(...history.map((row) => Number(row.revenue) || 0), 1);

  return (
    <div className="flex flex-col gap-3.5">
      <div className={panel}>
        <div className="mb-1.5 flex items-center justify-between"><div className="font-semibold">Income statement</div><div className="flex gap-3.5 text-[11px] text-[#8c8c95]"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#5a5a62]" />Revenue</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#3ecf8e]" />Net income</span></div></div>
        <div className="flex h-[150px] items-end gap-3 pt-2">
          {history.map((row) => {
            const revenue = Number(row.revenue) || 0;
            const net = Number(row.netIncome) || 0;
            return (
              <div key={String(row.period)} className="flex flex-1 items-end justify-center gap-1 self-stretch">
                <div className="w-1/2 rounded-t-sm bg-[#5a5a62]" style={{ height: `${(revenue / maxRevenue) * 100}%` }} />
                <div className="w-1/2 rounded-t-sm bg-[#3ecf8e]" style={{ height: `${Math.max((net / maxRevenue) * 100, 1)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex">{history.map((row) => <div key={String(row.period)} className="flex-1 text-center font-mono text-[11px] text-[#8c8c95]">{String(row.period).slice(0, 4)}</div>)}</div>
        <div className="mt-3.5 grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-t border-[#2a2a31] pt-1.5">
          <span />
          {history.map((row) => <span key={String(row.period)} className="text-right text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]">{String(row.period).slice(0, 4)}</span>)}
        </div>
        {(["revenue", "netIncome", "operatingIncome", "freeCashFlow"] as const).map((key) => (
          <div key={key} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-t border-[#1f1f24] py-2 text-[12.5px]">
            <span className="text-[#bcbcc2]">{key === "netIncome" ? "Net income" : key === "operatingIncome" ? "Operating income" : key === "freeCashFlow" ? "Free cash flow" : "Revenue"}</span>
            {history.map((row) => <span key={String(row.period)} className="text-right font-mono">{formatBig(row[key] as number | null)}</span>)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className={panel}><div className="mb-2.5 font-semibold">Balance sheet <span className="font-normal text-[#5a5a62]">latest FY</span></div>{Object.entries(research.balanceSheet?.latest ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-t border-[#1f1f24] py-2 text-[13px]"><span className="text-[#bcbcc2]">{key}</span><span className="font-mono">{formatBig(value)}</span></div>)}</div>
        <div className={panel}><div className="mb-2.5 font-semibold">Cash flow <span className="font-normal text-[#5a5a62]">latest FY</span></div>{Object.entries(research.cashFlow?.latest ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-t border-[#1f1f24] py-2 text-[13px]"><span className="text-[#bcbcc2]">{key}</span><span className="font-mono">{formatBig(value)}</span></div>)}</div>
      </div>
    </div>
  );
}

function CalendarSection({ research }: { research: StockResearchResponse }) {
  const calendar = research.calendar as { ["Earnings Date"]?: string[]; ["Ex-Dividend Date"]?: string; ["Dividend Date"]?: string } | undefined;
  const dividends = (research.dividends ?? []).slice(-8);
  const maxDividend = Math.max(...dividends.map((row) => Number(row.amount) || 0), 0.01);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-3.5">
        <div className={panel}><div className="text-[11px] uppercase tracking-[.5px] text-[#8c8c95]">Next earnings</div><div className="mt-2 font-mono text-[17px] font-semibold">{formatShortDate(calendar?.["Earnings Date"]?.[0])}</div></div>
        <div className={panel}><div className="text-[11px] uppercase tracking-[.5px] text-[#f5c451]">Ex-dividend</div><div className="mt-2 font-mono text-[17px] font-semibold text-[#f5c451]">{formatShortDate(calendar?.["Ex-Dividend Date"])}</div></div>
        <div className={panel}><div className="text-[11px] uppercase tracking-[.5px] text-[#3ecf8e]">Dividend pay date</div><div className="mt-2 font-mono text-[17px] font-semibold text-[#3ecf8e]">{formatShortDate(calendar?.["Dividend Date"])}</div></div>
      </div>
      <div className={panel}>
        <div className="mb-3.5 font-semibold">Dividend history</div>
        <div className="flex h-[90px] items-end gap-2">{dividends.map((row, index) => <div key={index} className="flex-1 rounded-t-sm bg-[#3ecf8e]" style={{ height: `${((Number(row.amount) || 0) / maxDividend) * 100}%` }} title={formatMoney(Number(row.amount))} />)}</div>
        <div className="mt-1.5 flex">{dividends.map((row, index) => <div key={index} className="flex-1 text-center font-mono text-[10px] text-[#5a5a62]">{formatShortDate(String(row.Date)).slice(0, 6)}</div>)}</div>
      </div>
      <div className={panel}>
        <div className="mb-3 font-semibold">Earnings history <span className="font-mono text-xs font-normal text-[#5a5a62]">EPS est vs actual</span></div>
        <div className="grid grid-cols-4 pb-1.5 text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]"><span>Quarter</span><span className="text-right">Estimate</span><span className="text-right">Actual</span><span className="text-right">Surprise</span></div>
        {(research.earningsHistory ?? []).map((row, index) => { const surprise = Number(row.surprisePercent) * 100; return <div key={index} className="grid grid-cols-4 border-t border-[#1f1f24] py-2 font-mono text-[13px]"><span className="font-sans text-[#bcbcc2]">{formatShortDate(String(row.quarter))}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.epsEstimate as number)}</span><span className="text-right">{formatNumber(row.epsActual as number)}</span><span className={`text-right ${surprise >= 0 ? positive : negative}`}>{formatPercent(surprise)}</span></div>; })}
      </div>
    </div>
  );
}

function DrawerHeader({ detail, symbol, onClose }: { detail: StockDetailResponse | null; symbol: string | null; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2a2a31] bg-[#141417] px-[22px] py-[18px]">
      <div><div className="flex items-center gap-[11px]"><strong className="font-mono text-xl">{detail?.stock.symbol ?? symbol ?? "Live data"}</strong><span className="text-sm text-[#8c8c95]">{detail?.stock.name ?? "Live data panel"}</span><span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{detail?.stock.symbol.endsWith(".BK") ? "Thai SET" : "US"}</span></div>{detail ? <div className="mt-[3px] flex items-baseline gap-[9px]"><span className="font-mono text-lg font-semibold">{formatCurrency(detail.stock.price, detail.stock.currency)}</span><span className={`font-mono text-[13px] ${detail.stock.changePct >= 0 ? positive : negative}`}>{formatPercent(detail.stock.changePct)}</span></div> : null}</div>
      <div className="flex items-center gap-3">
        {detail ? <IndustryRankBadge detail={detail} /> : null}
        <button type="button" onClick={onClose} aria-label="Close detail panel" className="px-2 py-1 text-[22px] leading-none text-[#8c8c95] hover:text-[#ececee]">×</button>
      </div>
    </div>
  );
}

function IndustryRankBadge({ detail }: { detail: StockDetailResponse }) {
  const rank = detail.peerRank?.rank;
  const count = detail.peerRank?.count;
  const percentile = rank && count ? (rank / count) * 100 : null;
  const tone = percentile == null
    ? "border-[#34343c] bg-[#1c1c20] text-[#8c8c95]"
    : percentile <= 20
      ? "border-[#285f48] bg-[#173528] text-[#3ecf8e]"
      : percentile <= 70
        ? "border-[#68552d] bg-[#332b19] text-[#f5c451]"
        : "border-[#663438] bg-[#351d20] text-[#f2575c]";
  const industry = detail.peerRank?.industry ?? detail.business?.industry ?? "Industry";

  return (
    <div className={`min-w-[150px] rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.08em]">Industry rank</span>
        <strong className="font-mono text-sm">{rank && count ? `#${rank} / ${count}` : "Unavailable"}</strong>
      </div>
      <div className="mt-0.5 max-w-[190px] truncate text-[10px] opacity-80" title={industry}>
        {percentile == null ? industry : `Top ${Math.ceil(percentile)}% · ${industry}`}
      </div>
    </div>
  );
}

function AiGate({ symbol, analysis, analyzing, onAnalyze }: { symbol: string; analysis: StockAnalysisResponse | null; analyzing: boolean; onAnalyze: () => void }) {
  if (analyzing) return <div className="flex items-center justify-center gap-3.5 rounded-[14px] border border-[#2a2a31] bg-[#141417] p-[34px] text-[#8c8c95]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Scoring {symbol} across value, income, growth &amp; timing…</div>;
  if (analysis) return <AiVerdictCard value={analysis} onRerun={onAnalyze} size="modal" />;
  return <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-[#2a2a31] bg-[linear-gradient(160deg,#15171a,#101012)] px-[26px] py-[30px] text-center"><div className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-[#3ecf8e]/10"><svg viewBox="0 0 16 16" className="h-[26px] w-[26px] fill-[#3ecf8e]"><path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z"/></svg></div><div className="max-w-[500px]"><h3 className="text-lg font-bold tracking-[-.3px]">Ask AI to analyze the complete picture</h3><p className="mt-[7px] text-[13.5px] leading-[1.6] text-[#8c8c95]">OpenAI will review {symbol}'s fundamentals, statements, analyst estimates, calendar, dividends, technicals, news, industry rank, and regional market comparison. Nothing is sent until you tap.</p></div><button type="button" onClick={onAnalyze} className="flex items-center gap-2 rounded-[10px] bg-[#3ecf8e] px-[22px] py-3 text-sm font-bold text-[#06120c]">Analyze {symbol}</button></div>;
}

function DetailContent({ detail, performancePath }: { detail: StockDetailResponse; performancePath: string }) {
  const score = detail.verdict?.score ?? 0;
  const returns = detail.performance?.returns ?? {};
  const returnSeries = buildReturnSeries(returns);
  const positiveWindows = returnSeries.filter((item) => item.value > 0).length;
  const oneYearReturn = returnSeries.find((item) => item.key === "1y")?.value ?? 0;
  const longTermRead = describeReturnPattern(returnSeries);
  const metrics = [
    ["PE", formatMultiple(detail.business?.peRatio)], ["PBV", formatMultiple(detail.business?.priceToBook)],
    ["ROE", formatPercent(detail.business?.roe)], ["ROA", formatPercent(detail.business?.roa)],
    ["Margin", formatPercent(detail.business?.profitMargin)], ["Yield", formatPercent(detail.business?.dividendYield)],
    ["Growth", formatPercent(detail.business?.revenueGrowth)], ["Earnings", formatPercent(detail.business?.earningsGrowth)]
  ];
  const technicals = [
    ["RSI 14", formatNumber(detail.technicals?.rsi14)], ["MACD", formatNumber(detail.technicals?.macd)],
    ["SMA 20", formatNumber(detail.technicals?.sma20)], ["SMA 50", formatNumber(detail.technicals?.sma50)],
    ["SMA 200", formatNumber(detail.technicals?.sma200)], ["Volume", formatNumber(detail.technicals?.volumeRatio)]
  ];
  const dcaScore = detail.stock.strategyScores?.stable_dca ?? detail.verdict?.score ?? 0;
  const riskScore = Math.min(100, Math.round((detail.technicals?.volatility ?? 0) * 15));

  return (
    <>
      <div className="grid grid-cols-[1.35fr_0.75fr] gap-4">
        <div className={panel}><PanelHeader title="Price path" /><div className="h-48"><TickerPerformanceChart points={detail.history} currency={detail.stock.currency} /></div><div className={`text-right font-mono text-sm font-semibold ${detail.stock.changePct >= 0 ? positive : negative}`}>{formatPercent(detail.stock.changePct)}</div></div>
        <div className={panel}><PanelHeader title="Decision" /><div className="text-2xl font-extrabold text-[#ececee]">{detail.verdict?.action ?? "WAIT"}</div><div className="mt-1 text-sm text-[#8c8c95]">{detail.verdict?.headline}</div><div className="mt-5 text-3xl font-extrabold text-[#3ecf8e]">{score}/100</div></div>
      </div>

      <div className="grid grid-cols-2 gap-4"><div className={panel}><PanelHeader title="Strategy fit" description="Live fit for the current buy style and setup quality" /><div className="font-mono text-3xl font-semibold text-[#3ecf8e]">{dcaScore}/100</div></div><div className={panel}><PanelHeader title="Risk score" description="Observed volatility; lower is calmer" /><div className={`font-mono text-3xl font-semibold ${riskScore > 65 ? negative : riskScore > 35 ? "text-[#f5c451]" : positive}`}>{riskScore}/100</div></div></div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}><PanelHeader title="Business snapshot" description={detail.business?.sector ?? detail.stock.sector} /><div className="grid grid-cols-4 gap-2">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>
        <div className={panel}>
          <PanelHeader title="Performance" description="Return profile across your main holding windows" />
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="h-[170px] rounded-xl border border-[#23232a] bg-[#101114] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={returnSeries} margin={{ top: 12, right: 10, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="returnProfileFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#23232a" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#6d6d76", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6d6d76", fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee" }} formatter={(value) => formatPercent(Number(value))} />
                  <Area type="monotone" dataKey="value" stroke="#3ecf8e" strokeWidth={2.5} fill="url(#returnProfileFill)" activeDot={{ r: 4, fill: "#3ecf8e" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2">
              <InsightPill label="Trend read" value={longTermRead} tone={positiveWindows >= 3 ? "good" : positiveWindows >= 2 ? "neutral" : "bad"} />
              <InsightPill label="Winning windows" value={`${positiveWindows}/${returnSeries.length}`} tone={positiveWindows >= 3 ? "good" : positiveWindows >= 2 ? "neutral" : "bad"} />
              <InsightPill label="1Y return" value={formatPercent(oneYearReturn)} tone={oneYearReturn >= 0 ? "good" : "bad"} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1">{returnWindows.map((window) => <Metric key={window} label={window.toUpperCase()} value={formatPercent(returns[window])} />)}</div>
        </div>
      </div>

      <div className={panel}><PanelHeader title="Technical analysis" description={detail.technicals?.signal ?? "Neutral"} /><div className="grid grid-cols-6 gap-2">{technicals.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>

      <div className={panel}><PanelHeader title="Business outlook" /><p className="text-sm leading-relaxed text-[#bcbcc2]">{detail.outlook?.summary ?? detail.business?.companySummary ?? "No outlook available."}</p></div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-[#242429] bg-[#121214] px-2 py-2 text-center"><div className="font-mono text-[9px] uppercase tracking-[.08em] text-[#5a5a62]">{label}</div><div className="mt-0.5 truncate font-mono text-xs font-semibold text-[#ececee]">{value}</div></div>;
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return <div className="mb-4"><div className="text-sm font-bold text-[#ececee]">{title}</div>{description ? <div className="mt-1 text-xs text-[#8c8c95]">{description}</div> : null}</div>;
}

function formatEstimatePeriod(period: string) {
  const normalized = period.trim().toLowerCase();
  if (normalized === "0q") return "Current quarter";
  if (normalized === "+1q") return "Next quarter";
  if (normalized === "0y") return "Current year";
  if (normalized === "+1y") return "Next year";
  if (normalized === "ltg") return "Long-term growth";
  return period || "—";
}

function buildReturnSeries(returns: Partial<Record<ReturnWindow, number | undefined>>) {
  return returnWindows.map((key) => ({
    key,
    label: key.toUpperCase(),
    value: returns[key] ?? 0,
  }));
}

function describeReturnPattern(series: Array<{ value: number }>) {
  const positiveCount = series.filter((item) => item.value > 0).length;
  if (positiveCount >= 4) return "Broadly positive";
  if (positiveCount >= 3) return "Mostly positive";
  if (positiveCount >= 2) return "Mixed";
  return "Weak follow-through";
}

function describeConsensus(score: number | undefined, bullish: number, neutral: number, bearish: number) {
  if (!score) return "No clear analyst consensus yet.";
  const total = bullish + neutral + bearish;
  const leaning = score <= 1.8 ? "Strong bullish consensus" : score <= 2.4 ? "Bullish consensus" : score <= 3.2 ? "Mostly hold / wait" : score <= 4 ? "Bearish leaning" : "Strong bearish consensus";
  return `${leaning} · ${bullish} bullish, ${neutral} neutral, ${bearish} bearish${total ? ` across ${total} analysts` : ""}.`;
}

function analystScoreTone(score?: number) {
  if (!score) return "text-[#8c8c95]";
  if (score <= 2.4) return "text-[#3ecf8e]";
  if (score <= 3.2) return "text-[#f5c451]";
  return "text-[#f2575c]";
}

function ConsensusStat({ label, value, tone }: { label: string; value: number; tone: "good" | "neutral" | "bad" }) {
  const color = tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : "text-[#f5c451]";
  return (
    <div className="rounded-lg border border-[#23232a] bg-[#101114] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[.08em] text-[#6d6d76]">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function InsightPill({ label, value, tone }: { label: string; value: string; tone: "good" | "neutral" | "bad" }) {
  const tones = tone === "good"
    ? "border-[#285f48] bg-[#133025] text-[#3ecf8e]"
    : tone === "bad"
      ? "border-[#663438] bg-[#2a1719] text-[#f2575c]"
      : "border-[#6d5522] bg-[#251d10] text-[#f5c451]";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones}`}>
      <div className="text-[10px] uppercase tracking-[.08em] opacity-75">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function DetailSkeleton({ symbol }: { symbol: string | null }) {
  return <div className="flex flex-col gap-4" aria-label={`Loading live detail for ${symbol ?? "stock"}`} aria-busy="true"><div className="rounded-2xl border border-[#285f48] bg-[#173528] px-4 py-3 text-sm font-semibold text-[#3ecf8e]">Loading live price history, fundamentals, and technical signals…</div><div className={panel}><div className="skeleton-block h-56"/><div className="mt-4 grid grid-cols-2 gap-4"><div className="skeleton-block h-32"/><div className="skeleton-block h-32"/></div></div></div>;
}
