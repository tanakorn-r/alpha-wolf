import { useEffect, useMemo, useRef, useState } from "react";
import { buildChartPath } from "../../lib/chart";
import { formatMoney, formatMultiple, formatNumber, formatPercent } from "../../lib/format";
import { loadStockDetail, summarizeStock, type StockAnalysisResponse, type StockDetailResponse } from "../../lib/api";
import { negative, panel, positive } from "../../lib/ui";
import { useWolfStore } from "../../store/useWolfStore";

const returnWindows = ["ytd", "1y", "2y", "3y", "4y"] as const;

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
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    const controller = new AbortController();
    drawerRef.current?.scrollTo({ top: 0 });
    setDetail(null);
    setLoading(true);
    setError("");
    setAnalysis(null);
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

  return (
    <>
      <button type="button" aria-label="Close stock detail" onClick={closeDetail} className={`aw-overlay fixed inset-0 z-30 bg-slate-900/30 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside ref={drawerRef} className={`aw-drawer fixed right-0 top-0 z-40 h-screen w-full max-w-[560px] overscroll-contain overflow-y-auto bg-slate-50 shadow-2xl transition-transform ${detailOpen ? "translate-x-0" : "translate-x-full"}`} aria-label="Stock detail panel">
        <div className="flex flex-col gap-4 p-5">
          <DrawerHeader detail={detail} symbol={selectedSymbol} onClose={closeDetail} />
          {loading ? <DetailSkeleton symbol={selectedSymbol} /> : null}
          {error ? <div className={`${panel} text-sm text-rose-600`}>{error}</div> : null}
          {detail && !loading ? <DetailContent detail={detail} pricePath={pricePath} performancePath={performancePath} analysis={analysis} analyzing={analyzing} onAnalyze={analyze} /> : null}
        </div>
      </aside>
    </>
  );
}

function DrawerHeader({ detail, symbol, onClose }: { detail: StockDetailResponse | null; symbol: string | null; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
      <div><div className="text-xs font-bold uppercase tracking-wider text-violet-500">Stock detail</div><div className="text-2xl font-extrabold text-slate-900">{detail?.stock.symbol ?? symbol ?? "Live data"}</div><div className="text-sm text-slate-400">{detail?.stock.name ?? "Live data panel"}</div></div>
      <button type="button" onClick={onClose} aria-label="Close detail panel" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500">×</button>
    </div>
  );
}

function DetailContent({ detail, pricePath, performancePath, analysis, analyzing, onAnalyze }: { detail: StockDetailResponse; pricePath: string; performancePath: string; analysis: StockAnalysisResponse | null; analyzing: boolean; onAnalyze: () => void }) {
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
        <div className={panel}><PanelHeader title="Decision" /><div className="text-2xl font-extrabold text-slate-900">{detail.verdict?.action ?? "WAIT"}</div><div className="mt-1 text-sm text-slate-500">{detail.verdict?.headline}</div><div className="mt-5 text-3xl font-extrabold text-violet-600">{score}/100</div></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}><PanelHeader title="Business snapshot" description={detail.business?.sector ?? detail.stock.sector} /><div className="grid grid-cols-4 gap-2">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>
        <div className={panel}><PanelHeader title="Performance" description="Returns by time window" /><svg viewBox="0 0 100 100" className="h-20 w-full"><path d={`${performancePath} L 100 90 L 0 90 Z`} fill="rgba(124,92,252,.1)"/><path d={performancePath} fill="none" stroke="#7c5cfc" strokeWidth="2"/></svg><div className="mt-2 grid grid-cols-5 gap-1">{returnWindows.map((window) => <Metric key={window} label={window.toUpperCase()} value={formatPercent(returns[window])} />)}</div></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}><PanelHeader title="Technical analysis" description={detail.technicals?.signal ?? "Neutral"} /><div className="grid grid-cols-3 gap-2">{technicals.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></div>
        <div className={panel}><PanelHeader title="Industry rank" /><div className="text-3xl font-extrabold text-slate-900">{detail.peerRank?.rank ?? "N/A"} <span className="text-base text-slate-400">/ {detail.peerRank?.count ?? "N/A"}</span></div><div className="mt-2 text-sm text-slate-500">{detail.peerRank?.sector ?? detail.stock.sector}</div></div>
      </div>

      <div className={panel}><PanelHeader title="Business outlook" /><p className="text-sm leading-relaxed text-slate-600">{detail.outlook?.summary ?? detail.business?.companySummary ?? "No outlook available."}</p></div>
      <AiPanel analysis={analysis} analyzing={analyzing} onAnalyze={onAnalyze} />
    </>
  );
}

function ChartPanel({ title, path, value, positiveValue }: { title: string; path: string; value: string; positiveValue: boolean }) {
  return <div className={panel}><PanelHeader title={title} /><svg viewBox="0 0 100 100" className="h-36 w-full"><path d={`${path} L 100 90 L 0 90 Z`} fill="rgba(124,92,252,.12)"/><path d={path} fill="none" stroke="#7c5cfc" strokeWidth="2"/></svg><div className={`text-right text-sm font-semibold ${positiveValue ? positive : negative}`}>{value}</div></div>;
}

function AiPanel({ analysis, analyzing, onAnalyze }: { analysis: StockAnalysisResponse | null; analyzing: boolean; onAnalyze: () => void }) {
  return <div className={panel}><PanelHeader title="AI recap" description="Thesis, score, and evidence" /><button type="button" onClick={onAnalyze} disabled={analyzing} className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{analyzing ? "Summarizing..." : "Ask GPT-5.4-mini"}</button>{analysis ? <div className="mt-4 space-y-2"><div className="text-2xl font-extrabold text-violet-600">{analysis.score}/100</div><div className="font-semibold text-slate-900">{analysis.recommendation}</div><p className="text-sm text-slate-600">{analysis.summary}</p></div> : null}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-2 py-2 text-center"><div className="text-[10px] uppercase text-slate-400">{label}</div><div className="truncate text-xs font-bold text-slate-900">{value}</div></div>;
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return <div className="mb-4"><div className="text-base font-bold text-slate-900">{title}</div>{description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}</div>;
}

function DetailSkeleton({ symbol }: { symbol: string | null }) {
  return <div className="flex flex-col gap-4" aria-label={`Loading live detail for ${symbol ?? "stock"}`} aria-busy="true"><div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-violet-700">Loading live price history, fundamentals, and technical signals…</div><div className={panel}><div className="skeleton-block h-56"/><div className="mt-4 grid grid-cols-2 gap-4"><div className="skeleton-block h-32"/><div className="skeleton-block h-32"/></div></div></div>;
}
