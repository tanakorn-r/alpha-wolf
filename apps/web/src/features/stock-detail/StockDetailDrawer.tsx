import { useEffect, useMemo, useRef, useState } from "react";
import { buildChartPath } from "../../lib/chart";
import { formatMoney, formatMultiple, formatNumber, formatPercent } from "../../lib/format";
import { loadMarketSnapshot, loadStockDetail, loadStockResearch, summarizeStock, type MarketSnapshot, type StockAnalysisResponse, type StockDetailResponse, type StockResearchResponse } from "../../lib/api";
import { negative, panel, positive } from "../../lib/ui";
import { useWolfStore } from "../../store/useWolfStore";

const returnWindows = ["ytd", "1y", "2y", "3y", "4y"] as const;
type ResearchTab = "overview" | "analyst" | "financials" | "calendar" | "market";

export function StockDetailDrawer() {
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const detailOpen = useWolfStore((state) => state.detailOpen);
  const closeDetail = useWolfStore((state) => state.closeDetail);
  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ResearchTab>("overview");
  const [research, setResearch] = useState<StockResearchResponse | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    const controller = new AbortController();
    drawerRef.current?.scrollTo({ top: 0 });
    setDetail(null);
    setLoading(true);
    setError("");
    setAnalysis(null);
    setResearch(null);
    setTab("overview");
    setMarket(null);
    loadStockDetail(selectedSymbol)
      .then(setDetail)
      .catch(() => !controller.signal.aborted && setError("Unable to load live stock detail."))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [detailOpen, selectedSymbol]);

  const pricePath = useMemo(() => buildChartPath(detail?.history.map((point) => point.close) ?? []), [detail]);
  const performancePath = useMemo(() => buildChartPath(detail?.performance?.line ?? []), [detail]);

  async function analyze() {
    if (!selectedSymbol) return;
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
    if (nextTab === "overview" || !selectedSymbol) return;
    setResearchLoading(true);
    try {
      if (nextTab === "market") {
        if (!market) setMarket(await loadMarketSnapshot(selectedSymbol.endsWith(".BK") ? "TH" : "US"));
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
            {error ? <div className={`${panel} text-sm text-rose-600`}>{error}</div> : null}
            {detail && !loading ? <><AiGate symbol={detail.stock.symbol} analysis={analysis} analyzing={analyzing} onAnalyze={analyze} /><div className="flex items-center justify-between gap-3 text-[12.5px] text-[#8c8c95]"><span>The full picture <strong className="font-normal text-[#ececee]">— yfinance data below.</strong></span><span className="font-mono text-[11px] text-[#5a5a62]">.stock · .analysis · .financials · .calendars · .market</span></div><ResearchTabs active={tab} onSelect={selectTab} />{tab === "overview" ? <DetailContent detail={detail} pricePath={pricePath} performancePath={performancePath} /> : researchLoading ? <DetailSkeleton symbol={selectedSymbol} /> : tab === "market" ? <MarketResearch market={market} /> : <ResearchContent tab={tab} research={research} />}</> : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function ResearchTabs({ active, onSelect }: { active: ResearchTab; onSelect: (tab: ResearchTab) => void }) {
  return <div className="sticky top-0 z-10 flex gap-6 border-b border-[#2a2a31] bg-[#0e0e10]/95 backdrop-blur">{(["overview", "analyst", "financials", "calendar", "market"] as const).map((tab) => <button key={tab} type="button" onClick={() => onSelect(tab)} className={`-mb-px border-b-2 px-0 py-2.5 text-[13px] font-medium capitalize ${active === tab ? "border-[#3ecf8e] text-[#ececee]" : "border-transparent text-[#8c8c95]"}`}>{tab === "analyst" ? "Analysis" : tab}</button>)}</div>;
}

function MarketResearch({ market }: { market: MarketSnapshot | null }) { return <>{market ? <><ResearchObject title={`${market.market} market status`} value={market.status} /><ResearchObject title="Market summary" value={market.summary} /></> : <div className={panel}>No market snapshot was reported.</div>}</>; }

function ResearchContent({ tab, research }: { tab: ResearchTab; research: StockResearchResponse | null }) {
  if (!research) return <div className={panel}>No research data was reported.</div>;
  if (tab === "analyst") return <><ResearchObject title="Analyst price targets" value={research.analystPriceTargets} /><ResearchTable title="Recommendation consensus" rows={research.recommendationsSummary} /><ResearchTable title="Earnings estimates" rows={research.earningsEstimate} /><ResearchTable title="Revenue estimates" rows={research.revenueEstimate} /><ResearchTable title="Growth vs industry / sector / index" rows={research.growthEstimates} /><ResearchTable title="EPS revisions" rows={research.epsRevisions} /></>;
  if (tab === "financials") return <><FinancialBlock title="Income statement" value={research.incomeStatement} /><FinancialBlock title="Balance sheet" value={research.balanceSheet} /><FinancialBlock title="Cash flow" value={research.cashFlow} /></>;
  return <><ResearchObject title="Company calendar" value={research.calendar} /><ResearchTable title="Corporate actions" rows={research.actions} /><ResearchTable title="Dividend history" rows={research.dividends?.slice(-12)} /><ResearchTable title="Earnings history" rows={research.earningsHistory} /></>;
}

function ResearchObject({ title, value }: { title: string; value?: Record<string, unknown> }) { const entries=Object.entries(value ?? {}); return <div className={panel}><PanelHeader title={title} /><div className="grid grid-cols-2 gap-2">{entries.map(([key,item]) => <Metric key={key} label={key} value={formatResearchValue(item)} />)}</div>{!entries.length ? <div className="text-sm text-[#5a5a62]">Not reported by yfinance.</div> : null}</div>; }
function ResearchTable({ title, rows }: { title: string; rows?: Array<Record<string, unknown>> }) { const visible=(rows ?? []).slice(0,10); return <div className={panel}><PanelHeader title={title} /><div className="space-y-2">{visible.map((row,index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-lg bg-[#0e0e10] p-3">{Object.entries(row).slice(0,6).map(([key,value]) => <div key={key}><div className="text-[9px] uppercase text-[#5a5a62]">{key}</div><div className="truncate font-mono text-xs text-[#ececee]">{formatResearchValue(value)}</div></div>)}</div>)}</div>{!visible.length ? <div className="text-sm text-[#5a5a62]">Not reported by yfinance.</div> : null}</div>; }
function FinancialBlock({ title, value }: { title: string; value?: { latest?: Record<string, number>; history?: Array<Record<string, number | string | null>> } }) { return <div className={panel}><PanelHeader title={title} /><div className="grid grid-cols-2 gap-2">{Object.entries(value?.latest ?? {}).map(([key,item]) => <Metric key={key} label={key} value={formatMoney(item)} />)}</div>{value?.history?.length ? <ResearchTable title="Four-year history" rows={value.history as Array<Record<string, unknown>>} /> : null}</div>; }
function formatResearchValue(value: unknown) { if (typeof value === "number") return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(value); if (value instanceof Date) return value.toLocaleDateString(); return value == null ? "—" : String(value); }

function DrawerHeader({ detail, symbol, onClose }: { detail: StockDetailResponse | null; symbol: string | null; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2a2a31] bg-[#141417] px-[22px] py-[18px]">
      <div><div className="flex items-center gap-[11px]"><strong className="font-mono text-xl">{detail?.stock.symbol ?? symbol ?? "Live data"}</strong><span className="text-sm text-[#8c8c95]">{detail?.stock.name ?? "Live data panel"}</span><span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{detail?.stock.symbol.endsWith(".BK") ? "Thai SET" : "US"}</span></div>{detail ? <div className="mt-[3px] flex items-baseline gap-[9px]"><span className="font-mono text-lg font-semibold">{formatMoney(detail.stock.price)}</span><span className={`font-mono text-[13px] ${detail.stock.changePct >= 0 ? positive : negative}`}>{formatPercent(detail.stock.changePct)}</span></div> : null}</div>
      <button type="button" onClick={onClose} aria-label="Close detail panel" className="px-2 py-1 text-[22px] leading-none text-[#8c8c95] hover:text-[#ececee]">×</button>
    </div>
  );
}

function AiGate({ symbol, analysis, analyzing, onAnalyze }: { symbol: string; analysis: StockAnalysisResponse | null; analyzing: boolean; onAnalyze: () => void }) {
  if (analysis) return <div className="rounded-[14px] border border-[#285f48] bg-[#13251d] px-[22px] py-5"><div className="grid grid-cols-[96px_1fr_auto] items-center gap-5"><div className="text-center"><div className="font-mono text-[30px] font-semibold text-[#3ecf8e]">{analysis.score}</div><div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#8c8c95]">AI score</div></div><div><div className="text-[17px] font-bold text-[#ececee]">{analysis.recommendation}</div><p className="mt-1 text-[13px] leading-[1.55] text-[#8c8c95]">{analysis.summary}</p></div><button type="button" onClick={onAnalyze} className="rounded-[8px] border border-[#285f48] px-3 py-2 text-xs font-semibold text-[#3ecf8e]">Refresh</button></div>{analysis.dcaTiming ? <div className="mt-4 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3 text-[13px] leading-[1.5] text-[#bcbcc2]"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-[#f5c451]">DCA timing</span><p className="mt-1">{analysis.dcaTiming}</p></div> : null}</div>;
  return <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-[#2a2a31] bg-[linear-gradient(160deg,#15171a,#101012)] px-[26px] py-[30px] text-center"><div className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-[#3ecf8e]/10"><svg viewBox="0 0 16 16" className="h-[26px] w-[26px] fill-[#3ecf8e]"><path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z"/></svg></div><div className="max-w-[440px]"><h3 className="text-lg font-bold tracking-[-.3px]">Get your AI buy / wait verdict</h3><p className="mt-[7px] text-[13.5px] leading-[1.6] text-[#8c8c95]">Cadence will score {symbol} on value, dividend safety, growth and timing — then tell you plainly whether to buy now, wait for the dip, or hold. Nothing is computed until you tap.</p></div><button type="button" onClick={onAnalyze} disabled={analyzing} className="rounded-[10px] bg-[#3ecf8e] px-[22px] py-3 text-sm font-bold text-[#06120c]">{analyzing ? "Scoring…" : `Analyze ${symbol}`}</button></div>;
}

function DetailContent({ detail, pricePath, performancePath }: { detail: StockDetailResponse; pricePath: string; performancePath: string }) {
  const score = detail.verdict?.score ?? 0;
  const returns = detail.performance?.returns ?? {};
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

  return (
    <>
      <div className="grid grid-cols-[1.35fr_0.75fr] gap-4">
        <ChartPanel title="Price path" path={pricePath} value={formatPercent(detail.stock.changePct)} positiveValue={detail.stock.changePct >= 0} />
        <div className={panel}><PanelHeader title="Decision" /><div className="text-2xl font-extrabold text-[#ececee]">{detail.verdict?.action ?? "WAIT"}</div><div className="mt-1 text-sm text-[#8c8c95]">{detail.verdict?.headline}</div><div className="mt-5 text-3xl font-extrabold text-[#3ecf8e]">{score}/100</div></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}><PanelHeader title="Business snapshot" description={detail.business?.sector ?? detail.stock.sector} /><div className="grid grid-cols-4 gap-2">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>
        <div className={panel}><PanelHeader title="Performance" description="Returns by time window" /><svg viewBox="0 0 100 100" className="h-20 w-full"><path d={`${performancePath} L 100 90 L 0 90 Z`} fill="rgba(62,207,142,.09)"/><path d={performancePath} fill="none" stroke="#3ecf8e" strokeWidth="2"/></svg><div className="mt-2 grid grid-cols-5 gap-1">{returnWindows.map((window) => <Metric key={window} label={window.toUpperCase()} value={formatPercent(returns[window])} />)}</div></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}><PanelHeader title="Technical analysis" description={detail.technicals?.signal ?? "Neutral"} /><div className="grid grid-cols-3 gap-2">{technicals.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>
        <div className={panel}><PanelHeader title="Industry rank" /><div className="text-3xl font-extrabold text-[#ececee]">{detail.peerRank?.rank ?? "N/A"} <span className="text-base text-[#5a5a62]">/ {detail.peerRank?.count ?? "N/A"}</span></div><div className="mt-2 text-sm text-[#8c8c95]">{detail.peerRank?.sector ?? detail.stock.sector}</div></div>
      </div>

      <div className={panel}><PanelHeader title="Business outlook" /><p className="text-sm leading-relaxed text-[#bcbcc2]">{detail.outlook?.summary ?? detail.business?.companySummary ?? "No outlook available."}</p></div>
    </>
  );
}

function ChartPanel({ title, path, value, positiveValue }: { title: string; path: string; value: string; positiveValue: boolean }) {
  return <div className={panel}><PanelHeader title={title} /><svg viewBox="0 0 100 100" className="h-36 w-full"><path d={`${path} L 100 90 L 0 90 Z`} fill="rgba(62,207,142,.1)"/><path d={path} fill="none" stroke="#3ecf8e" strokeWidth="2"/></svg><div className={`text-right font-mono text-sm font-semibold ${positiveValue ? positive : negative}`}>{value}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-[#242429] bg-[#121214] px-2 py-2 text-center"><div className="font-mono text-[9px] uppercase tracking-[.08em] text-[#5a5a62]">{label}</div><div className="mt-0.5 truncate font-mono text-xs font-semibold text-[#ececee]">{value}</div></div>;
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return <div className="mb-4"><div className="text-sm font-bold text-[#ececee]">{title}</div>{description ? <div className="mt-1 text-xs text-[#8c8c95]">{description}</div> : null}</div>;
}

function DetailSkeleton({ symbol }: { symbol: string | null }) {
  return <div className="flex flex-col gap-4" aria-label={`Loading live detail for ${symbol ?? "stock"}`} aria-busy="true"><div className="rounded-2xl border border-[#285f48] bg-[#173528] px-4 py-3 text-sm font-semibold text-[#3ecf8e]">Loading live price history, fundamentals, and technical signals…</div><div className={panel}><div className="skeleton-block h-56"/><div className="mt-4 grid grid-cols-2 gap-4"><div className="skeleton-block h-32"/><div className="skeleton-block h-32"/></div></div></div>;
}
