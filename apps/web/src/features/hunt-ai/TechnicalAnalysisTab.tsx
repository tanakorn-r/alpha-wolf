import { useLayoutEffect, useRef, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentCall } from "../../components/agents/AgentCall";
import { AgentActionButton } from "../../components/agents/AgentActionButton";
import { LoadingPanel, RetryPanel, TickerEmptyPanel } from "../../components/ui/panels";
import { formatCurrency } from "../../lib/format";
import type { StockDetailResponse, TechnicalAnalysisResponse } from "../../lib/api";
import { actionPositionFromSignal } from "../../lib/actionPosition";
import { agentLoadingTitle, agentName, PremiumLoading } from "./ui";
import type { HuntAi } from "./useHuntAi";
import { AiVisualSummary } from "../../components/ai/AiVisualSummary";

const COLORS = { price: "#dbe5f5", up: "#26a69a", down: "#ef5350", fib: "#d6b36a", dow: "#38c793", phase: "#4d8dff", elliott: "#9a7cff", ma20: "#f5c451", ma50: "#4d8dff" };
type Overlay = "candles" | "movingAverages" | "volume" | "rsi" | "dow" | "wyckoff" | "elliott" | "fibonacci" | "levels" | "timeframes";

export function TechnicalAnalysisTab({ hunt }: { hunt: HuntAi }) {
  const technical = hunt.technical;
  if (!technical.ticker) return <TickerEmptyPanel body="Add or select an asset in the Hunt watchlist above to open Technical Analysis." />;
  if (technical.pending) return <LoadingPanel title={`Loading ${technical.ticker} chart...`} body="Reading cached price history and market structure." />;
  if (technical.failed || !technical.detail) return <RetryPanel label="Technical chart data is unavailable." onRetry={technical.retry} />;

  return (
    <div className="aw-result-product aw-result-technical flex min-w-0 flex-col gap-3.5">
      <TickerHeader detail={technical.detail} analysis={technical.analysis} agentId={hunt.activeAgentId} loading={technical.aiLoading} onRun={() => void technical.run(Boolean(technical.analysis))} hasAnalysis={Boolean(technical.analysis)} />
      <StructureChart detail={technical.detail} analysis={technical.analysis} />
      {technical.aiLoading ? <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "intraday", technical.ticker)} subject={technical.ticker} agentId={hunt.activeAgentId} task="intraday" /> : null}
      {!technical.aiLoading && technical.analysis ? <AgentRead analysis={technical.analysis} setupScore={technical.detail.verdict?.score} onRerun={() => void technical.run(true)} /> : null}
    </div>
  );
}

function TickerHeader({ detail, analysis, agentId, loading, onRun, hasAnalysis }: { detail: StockDetailResponse; analysis: TechnicalAnalysisResponse | null; agentId: string; loading: boolean; onRun: () => void; hasAnalysis: boolean }) {
  const stock = detail.stock;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-[20px] font-bold">{stock.symbol}</span>
        <span className="truncate text-[12px] text-[#8c8c95]">{stock.name}</span>
        <span className="rounded-[var(--aw-radius-chip)] border border-[#ff65c7]/35 bg-[#ff65c7]/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.07em] text-[#ff65c7]">{humanize(detail.technicals?.signal || "structure pending")}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right"><div className="font-mono text-[17px] font-bold">{formatCurrency(stock.price, stock.currency || "USD")}</div><div className={stock.changePct >= 0 ? "text-[12px] text-[#3ecf8e]" : "text-[12px] text-[#ff5f68]"}>{stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(2)}%</div></div>
        <AgentActionButton agent={analysis?.agent} fallbackName={agentName(agentId)} label={loading ? "Analyzing" : hasAnalysis ? "Refresh" : "Chart read"} sublabel="Ask your Agent" disabled={loading} loading={loading} onClick={onRun} />
      </div>
    </section>
  );
}

function AgentRead({ analysis, setupScore, onRerun }: { analysis: TechnicalAnalysisResponse; setupScore?: number | null; onRerun: () => void }) {
  const color = analysis.tone === "good" ? "#3ecf8e" : analysis.tone === "bad" ? "#ff5f68" : "#f5c451";
  return (
    <AgentCall agent={analysis.agent} label="Chart read" score={actionPositionFromSignal(analysis.signal, analysis.confidence, { tone: analysis.tone, actionScore: setupScore })} scoreLabel="Action position" scoreMode="action" scoreNote={`Confidence ${analysis.confidence}/100`} signal={analysis.signal} headline={<span className="line-clamp-2">{analysis.headline}</span>} summary={<span className="line-clamp-4">{analysis.summary}</span>} accent={color} onRerun={onRerun} meta="Agent-weighted technical read · heuristic, not financial advice" dataTrust={analysis.dataTrust}>
      <div className="mt-4 grid gap-2 @min-[500px]:grid-cols-2 @min-[840px]:grid-cols-3 @min-[1240px]:grid-cols-5">
        {analysis.frameworks.map((item) => <FrameworkCard key={item.framework} item={item} color={color} />)}
      </div>
      <div className="mt-3"><FrameworkAlignment analysis={analysis} /></div>
      <div className="mt-3 grid gap-2 @min-[620px]:grid-cols-2"><TextBox label="Agent action" text={analysis.action} color={color} /><TextBox label="Structure / business context" text={analysis.structureContext} color="#d6b36a" /></div>
      <div className="mt-3 text-[10px] font-bold uppercase tracking-[.08em] text-[#ff5f68]">What invalidates this view</div>
      <div className="mt-2 grid gap-2 @min-[620px]:grid-cols-2">{analysis.invalidations.map((item, index) => <TextBox key={item} label={`${index + 1}`} text={item} color="#ff5f68" />)}</div>
    </AgentCall>
  );
}

function FrameworkAlignment({ analysis }: { analysis: TechnicalAnalysisResponse }) {
  const count = (stance: "GOOD" | "MIXED" | "BAD") => analysis.frameworks.filter((item) => item.stance === stance).length;
  return <AiVisualSummary title="Framework alignment" subtitle="Agreement across Dow, Wyckoff, Elliott, Fibonacci, and timeframes" segments={[{ label: "Bullish", value: count("GOOD"), color: "#3ecf8e", icon: "↑" }, { label: "Mixed", value: count("MIXED"), color: "#f5c451", icon: "↔" }, { label: "Bearish", value: count("BAD"), color: "#ff5f68", icon: "↓" }]} />;
}

function FrameworkCard({ item, color }: { item: TechnicalAnalysisResponse["frameworks"][number]; color: string }) {
  const weightColor = item.weight === "PRIMARY" ? color : item.weight === "CONFIRMATION" ? "#74a4ff" : "#6f6f78";
  return (
    <div className="rounded-[var(--aw-radius-control)] border border-[#29292f] bg-[#0e0e10] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold text-[#ececee]">{humanize(item.framework)}</span>
        <div className="flex flex-none items-center gap-1.5"><FrameworkStance stance={item.stance} /><span className="text-[8px] font-bold" style={{ color: weightColor }}>{item.weight}</span></div>
      </div>
      <div className="mt-2 line-clamp-3 text-[11px] font-semibold leading-[1.4]">{item.verdict}</div>
      <details className="group mt-2 border-t border-[#242429] pt-2">
        <summary className="cursor-pointer list-none text-[9px] font-bold text-[#777780] hover:text-[#bcbcc2]">Evidence <span className="group-open:hidden">＋</span><span className="hidden group-open:inline">−</span></summary>
        <div className="mt-1.5 text-[9.5px] leading-[1.45] text-[#777780]">{item.evidence}</div>
      </details>
    </div>
  );
}

function StructureChart({ detail, analysis }: { detail: StockDetailResponse; analysis: TechnicalAnalysisResponse | null }) {
  const [visible, setVisible] = useState<Set<Overlay>>(() => new Set(["candles", "movingAverages", "volume", "levels", "timeframes"]));
  const chartSurface = useChartSurfaceSize();
  const points = normalizeHistory(detail.history).slice(-126);
  const technicals = detail.technicals || {};
  const fib = technicals.fibonacci;
  const pivots = findPivots(points);
  const pivotDates = new Set(pivots.map((point) => point.date));
  const lastDate = points.at(-1)?.date;
  const chartPoints = addTechnicalSeries(points).map((point) => ({ ...point, candleAnchor: point.close, dowPivot: pivotDates.has(point.date) ? point.close : null, elliottMarker: point.date === lastDate ? point.close : null }));
  const hasCandles = points.filter((point) => [point.open, point.high, point.low].every((value) => typeof value === "number" && Number.isFinite(value))).length >= points.length * 0.7;
  const phaseStart = points[Math.max(0, points.length - 60)]?.date;
  const phaseEnd = points.at(-1)?.date;
  const retracements = fib ? Object.entries(fib.retracements || {}).map(([label, value]) => [`${label}%`, value] as [string, number]).filter((entry) => Number.isFinite(entry[1])) : [];
  const extensions = fib ? Object.entries(fib.extensions || {}).map(([label, value]) => [`${label}% ext`, value] as [string, number]).filter((entry) => Number.isFinite(entry[1])) : [];
  const visibleValues = [...points.flatMap((point) => [point.low, point.high, point.close]), technicals.support, technicals.resistance].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const visibleMin = Math.min(...visibleValues);
  const visibleMax = Math.max(...visibleValues);
  const padding = Math.max((visibleMax - visibleMin) * 0.08, Math.abs(visibleMax) * 0.01, 0.01);
  const yDomain: [number, number] = [visibleMin - padding, visibleMax + padding];
  const chartFibLevels = retracements.filter(([, value]) => value >= yDomain[0] && value <= yDomain[1]);
  const maxVolume = Math.max(...chartPoints.map((point) => Number(point.volume || 0)), 1);
  const lastPoint = chartPoints.at(-1);
  const currency = detail.stock.currency || "USD";
  function toggle(overlay: Overlay) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(overlay)) next.delete(overlay); else next.add(overlay);
      return next;
    });
  }
  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--aw-radius-card)] border border-[#2a2d35] bg-[#0f1115]">
      <div className="border-b border-[#252832] bg-[#14171d] px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-[16px] font-bold">Technical workstation</h2><span className="rounded-[4px] bg-[#26a69a]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-[#4fc9ba]">6M · Daily</span></div><p className="mt-1 text-[10.5px] text-[#777d89]">Candles, structure, momentum, participation, and measured levels.</p></div><OverlayControls visible={visible} onToggle={toggle} /></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><IndicatorStrip detail={detail} /><span className="font-mono text-[8.5px] text-[#555b67]">OHLC · adjusted market history</span></div>
      </div>
      <div className="min-w-0 px-3 pb-4 pt-2 min-[760px]:px-4">
      {visible.has("timeframes") ? <div className="mb-2 flex justify-end"><TimeframeBadges detail={detail} /></div> : null}
      <div ref={chartSurface.ref} className="h-[330px] min-w-0 w-full overflow-hidden min-[1100px]:h-[360px]">
        {chartSurface.width > 0 && chartSurface.height > 0 ? (
          <ComposedChart width={chartSurface.width} height={chartSurface.height} data={chartPoints} margin={{ top: 8, right: 4, bottom: 2, left: 0 }}>
            <CartesianGrid stroke="#20242c" strokeOpacity={0.72} strokeDasharray="3 5" vertical />
            <XAxis dataKey="date" tick={{ fill: "#646b78", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#2a2e38" }} minTickGap={45} />
            <YAxis domain={yDomain} orientation="right" width={42} tick={{ fill: "#7c8492", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#2a2e38" }} tickFormatter={(value) => formatShort(value)} />
            <YAxis yAxisId="volume" width={0} domain={[0, maxVolume * 4]} hide />
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TechnicalTooltip label={String(label || "")} payload={payload} currency={currency} /> : null} />
            {visible.has("wyckoff") && phaseStart && phaseEnd ? <ReferenceArea x1={phaseStart} x2={phaseEnd} fill={COLORS.phase} fillOpacity={0.055} stroke={COLORS.phase} strokeOpacity={0.22} label={{ value: humanize(technicals.wyckoff?.phase || "Wyckoff window"), fill: COLORS.phase, fontSize: 9, position: "insideTopLeft" }} /> : null}
            {visible.has("fibonacci") ? chartFibLevels.map(([label, value]) => <ReferenceLine key={label} y={value} stroke={COLORS.fib} strokeOpacity={0.38} strokeDasharray="5 5" />) : null}
            {visible.has("levels") && technicals.support ? <ReferenceArea y1={technicals.support * 0.9985} y2={technicals.support * 1.0015} fill={COLORS.up} fillOpacity={0.12} stroke={COLORS.up} strokeOpacity={0.5} label={{ value: `SUPPORT ${formatShort(technicals.support)}`, position: "insideLeft", fill: COLORS.up, fontSize: 8 }} /> : null}
            {visible.has("levels") && technicals.resistance ? <ReferenceArea y1={technicals.resistance * 0.9985} y2={technicals.resistance * 1.0015} fill={COLORS.down} fillOpacity={0.1} stroke={COLORS.down} strokeOpacity={0.5} label={{ value: `RESISTANCE ${formatShort(technicals.resistance)}`, position: "insideLeft", fill: COLORS.down, fontSize: 8 }} /> : null}
            {lastPoint ? <ReferenceLine y={lastPoint.close} stroke={lastPoint.close >= (lastPoint.open ?? lastPoint.close) ? COLORS.up : COLORS.down} strokeOpacity={0.72} strokeDasharray="2 3" label={{ value: formatShort(lastPoint.close), position: "right", fill: lastPoint.close >= (lastPoint.open ?? lastPoint.close) ? COLORS.up : COLORS.down, fontSize: 9 }} /> : null}
            {visible.has("volume") ? <Bar yAxisId="volume" dataKey="volume" isAnimationActive={false}>{chartPoints.map((point) => <Cell key={point.date} fill={point.close >= (point.open ?? point.close) ? COLORS.up : COLORS.down} fillOpacity={0.24} />)}</Bar> : null}
            {visible.has("movingAverages") ? <Line type="monotone" dataKey="sma20" stroke={COLORS.ma20} strokeWidth={1.35} dot={false} connectNulls isAnimationActive={false} /> : null}
            {visible.has("movingAverages") ? <Line type="monotone" dataKey="sma50" stroke={COLORS.ma50} strokeWidth={1.35} dot={false} connectNulls isAnimationActive={false} /> : null}
            {visible.has("candles") && hasCandles ? <Line type="linear" dataKey="candleAnchor" stroke="transparent" strokeWidth={0} dot={(props) => renderCandle(props, yDomain)} activeDot={false} isAnimationActive={false} /> : <Line type="monotone" dataKey="close" stroke={COLORS.price} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {visible.has("dow") ? <Line dataKey="dowPivot" stroke="transparent" strokeWidth={0} connectNulls={false} dot={{ r: 4, fill: COLORS.dow, stroke: "#0e0e10", strokeWidth: 2 }} activeDot={false} isAnimationActive={false} /> : null}
            {visible.has("elliott") ? <Line dataKey="elliottMarker" stroke="transparent" strokeWidth={0} connectNulls={false} dot={{ r: 5, fill: COLORS.elliott, stroke: "#0e0e10", strokeWidth: 2 }} activeDot={false} isAnimationActive={false} /> : null}
          </ComposedChart>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#252832] px-1 py-2 font-mono text-[8.5px] text-[#626a77]"><span className="font-bold text-[#aab2bf]">{lastPoint ? formatCurrency(lastPoint.close, currency) : "—"}</span><span style={{ color: COLORS.ma20 }}>SMA20 {lastPoint?.sma20 ? formatShort(lastPoint.sma20) : "—"}</span><span style={{ color: COLORS.ma50 }}>SMA50 {lastPoint?.sma50 ? formatShort(lastPoint.sma50) : "—"}</span>{visible.has("volume") ? <span>VOL {formatShort(lastPoint?.volume ?? 0)}</span> : null}<span className="ml-auto text-[#484f5a]">Hover for OHLC</span></div>
      {visible.has("rsi") ? <RsiPanel points={chartPoints} /> : null}
      {visible.has("fibonacci") && (retracements.length || extensions.length) ? <FibonacciDeck retracements={retracements} extensions={extensions} currency={currency} /> : null}
      <div className="mt-3 grid gap-1.5 border-t border-[#252832] pt-3 text-[10.5px] text-[#a0a0a8]">
        {visible.has("dow") ? <ReadLine label="Dow" color={COLORS.dow} text={`${humanize(technicals.dowTheory?.trend || "Unavailable")} · ${technicals.dowTheory?.confirmation || "no confirmation"}`} /> : null}
        {visible.has("wyckoff") ? <ReadLine label="Wyckoff" color={COLORS.phase} text={`${humanize(technicals.wyckoff?.phase || "Unavailable")} · ${technicals.wyckoff?.note || "No phase read"}`} /> : null}
        {visible.has("elliott") ? <ReadLine label="Elliott" color={COLORS.elliott} text={`${humanize(technicals.elliottWave?.bias || "Unavailable")} · ${technicals.elliottWave?.note || "No wave read"}`} /> : null}
        {visible.has("fibonacci") ? <ReadLine label="Fibonacci" color={COLORS.fib} text={fib?.note || "No usable swing range"} /> : null}
        {visible.has("timeframes") ? <ReadLine label="Multiple timeframe" color="#3ecf8e" text={`${technicals.multiTimeframe?.alignment || "Unavailable"} · ${technicals.multiTimeframe?.note || ""}`} /> : null}
        {analysis ? <ReadLine label="Agent structure" color={analysis.agent?.color || "#ececee"} text={analysis.structureContext} /> : null}
      </div>
      </div>
    </section>
  );
}

function useChartSurfaceSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = Math.floor(element.clientWidth);
      const height = Math.floor(element.clientHeight);
      setSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}

function OverlayControls({ visible, onToggle }: { visible: Set<Overlay>; onToggle: (overlay: Overlay) => void }) {
  const options: Array<{ key: Overlay; label: string; color: string }> = [
    { key: "candles", label: "Candles", color: COLORS.up },
    { key: "movingAverages", label: "SMA 20 / 50", color: COLORS.ma20 },
    { key: "volume", label: "Volume", color: "#6c8ebf" },
    { key: "rsi", label: "RSI 14", color: COLORS.elliott },
    { key: "dow", label: "Dow pivots", color: COLORS.dow },
    { key: "wyckoff", label: "Wyckoff", color: COLORS.phase },
    { key: "elliott", label: "Elliott bias", color: COLORS.elliott },
    { key: "fibonacci", label: "Fibonacci", color: COLORS.fib },
    { key: "levels", label: "Support / resistance", color: "#ff5f68" },
    { key: "timeframes", label: "Timeframes", color: "#8aa4c8" },
  ];
  return <div className="flex max-w-[820px] flex-wrap justify-end gap-1.5">{options.map((option) => { const active = visible.has(option.key); return <button key={option.key} type="button" aria-pressed={active} onClick={() => onToggle(option.key)} className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-1.5 text-[8.5px] font-semibold transition ${active ? "border-[#3b414d] bg-[#20242c] text-[#d7dce5]" : "border-[#252a33] bg-[#11141a] text-[#59606d]"}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: option.color, opacity: active ? 1 : 0.28 }} />{option.label}</button>; })}</div>;
}

type TechnicalPoint = StockDetailResponse["history"][number] & {
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  candleAnchor?: number;
  dowPivot?: number | null;
  elliottMarker?: number | null;
};

function addTechnicalSeries(points: StockDetailResponse["history"]): TechnicalPoint[] {
  return points.map((point, index) => ({
    ...point,
    sma20: movingAverage(points, index, 20),
    sma50: movingAverage(points, index, 50),
    rsi14: rollingRsi(points, index, 14),
  }));
}

function movingAverage(points: StockDetailResponse["history"], index: number, period: number) {
  if (index + 1 < period) return null;
  const window = points.slice(index + 1 - period, index + 1);
  return window.reduce((sum, point) => sum + point.close, 0) / period;
}

function rollingRsi(points: StockDetailResponse["history"], index: number, period: number) {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const move = points[cursor].close - points[cursor - 1].close;
    if (move >= 0) gains += move; else losses -= move;
  }
  if (losses === 0) return 100;
  const strength = gains / losses;
  return 100 - (100 / (1 + strength));
}

function renderCandle(rawProps: unknown, domain: [number, number]) {
  const props = rawProps as { cx?: number; cy?: number; payload?: TechnicalPoint };
  const point = props.payload;
  if (!point || props.cx == null || props.cy == null || point.open == null || point.high == null || point.low == null) return <g />;
  const pixelsPerUnit = 300 / Math.max(domain[1] - domain[0], 0.0001);
  const openY = props.cy - (point.open - point.close) * pixelsPerUnit;
  const highY = props.cy - (point.high - point.close) * pixelsPerUnit;
  const lowY = props.cy - (point.low - point.close) * pixelsPerUnit;
  const color = point.close >= point.open ? COLORS.up : COLORS.down;
  const bodyY = Math.min(openY, props.cy);
  const bodyHeight = Math.max(1.5, Math.abs(openY - props.cy));
  return <g><line x1={props.cx} x2={props.cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1} /><rect x={props.cx - 2.5} y={bodyY} width={5} height={bodyHeight} rx={0.6} fill={color} /></g>;
}

function TechnicalTooltip({ label, payload, currency }: { label: string; payload: readonly { payload?: TechnicalPoint }[]; currency: string }) {
  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;
  return <div className="min-w-[165px] rounded-[7px] border border-[#343a46] bg-[#0a0c10]/95 px-3 py-2 text-[9px] shadow-xl"><div className="font-mono text-[#7d8796]">{label}</div><div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono"><span className="text-[#666f7d]">O</span><b className="text-right text-[#d8dee8]">{formatCurrency(point.open ?? point.close, currency)}</b><span className="text-[#666f7d]">H / L</span><b className="text-right text-[#d8dee8]">{formatShort(point.high ?? point.close)} / {formatShort(point.low ?? point.close)}</b><span className="text-[#666f7d]">Close</span><b className="text-right" style={{ color: (point.close >= (point.open ?? point.close)) ? COLORS.up : COLORS.down }}>{formatCurrency(point.close, currency)}</b><span className="text-[#666f7d]">Volume</span><b className="text-right text-[#8ea1bb]">{formatShort(point.volume ?? 0)}</b></div></div>;
}

function IndicatorStrip({ detail }: { detail: StockDetailResponse }) {
  const technicals = detail.technicals || {};
  const items = [
    { label: "RSI 14", value: technicals.rsi14 == null ? "—" : technicals.rsi14.toFixed(1), color: technicals.rsi14 != null && technicals.rsi14 >= 70 ? COLORS.down : technicals.rsi14 != null && technicals.rsi14 <= 30 ? COLORS.up : "#d8dee8" },
    { label: "MACD", value: technicals.macdHistogram == null ? "—" : `${technicals.macdHistogram >= 0 ? "+" : ""}${technicals.macdHistogram.toFixed(2)}`, color: (technicals.macdHistogram ?? 0) >= 0 ? COLORS.up : COLORS.down },
    { label: "Volume", value: technicals.volumeRatio == null ? "—" : `${technicals.volumeRatio.toFixed(2)}×`, color: (technicals.volumeRatio ?? 0) >= 1 ? COLORS.up : "#a7afbc" },
    { label: "Volatility", value: technicals.volatility == null ? "—" : `${technicals.volatility.toFixed(1)}%`, color: "#d6b36a" },
  ];
  return <div className="flex flex-wrap gap-x-4 gap-y-1">{items.map((item) => <span key={item.label} className="font-mono text-[8.5px] text-[#646b78]"><b className="mr-1 font-medium">{item.label}</b><strong style={{ color: item.color }}>{item.value}</strong></span>)}</div>;
}

function RsiPanel({ points }: { points: TechnicalPoint[] }) {
  return <section className="mt-1 border-t border-[#252832] pt-2"><div className="mb-1 flex items-center justify-between font-mono text-[8.5px]"><span className="font-bold uppercase tracking-[0.08em] text-[#646b78]">RSI 14</span><span style={{ color: COLORS.elliott }}>{points.at(-1)?.rsi14?.toFixed(1) ?? "—"}</span></div><div className="h-[105px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 2, right: 72, bottom: 0, left: 2 }}><CartesianGrid stroke="#20242c" vertical={false} /><XAxis dataKey="date" hide /><YAxis domain={[0, 100]} ticks={[30, 50, 70]} orientation="right" tick={{ fill: "#59606d", fontSize: 8 }} tickLine={false} axisLine={false} /><ReferenceArea y1={30} y2={70} fill={COLORS.elliott} fillOpacity={0.045} /><ReferenceLine y={70} stroke={COLORS.down} strokeOpacity={0.45} strokeDasharray="4 4" /><ReferenceLine y={30} stroke={COLORS.up} strokeOpacity={0.45} strokeDasharray="4 4" /><Line type="monotone" dataKey="rsi14" stroke={COLORS.elliott} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></section>;
}

function FibonacciDeck({ retracements, extensions, currency }: { retracements: Array<[string, number]>; extensions: Array<[string, number]>; currency: string }) {
  return <section className="mt-2 border-t border-[#252832] pt-3"><div className="flex items-center justify-between gap-2"><div className="text-[8.5px] font-black uppercase tracking-[0.09em] text-[#d6b36a]">Fibonacci map</div><span className="text-[8px] text-[#59606d]">Retracement zones + extension targets</span></div><div className="mt-2 grid grid-cols-2 gap-1.5 min-[700px]:grid-cols-4">{[...retracements.slice(-4), ...extensions.slice(0, 2)].map(([label, value]) => <div key={label} className="rounded-[6px] border border-[#d6b36a]/20 bg-[#d6b36a]/[0.045] px-2.5 py-2"><div className="text-[8px] font-bold text-[#9f8754]">{label}</div><div className="mt-0.5 font-mono text-[10px] font-bold text-[#d6b36a]">{formatCurrency(value, currency)}</div></div>)}</div></section>;
}

function FrameworkStance({ stance }: { stance: TechnicalAnalysisResponse["frameworks"][number]["stance"] }) {
  const config = stance === "GOOD"
    ? { icon: "👍", label: "Good", color: "#3ecf8e" }
    : stance === "BAD" ? { icon: "👎", label: "Bad", color: "#ff5f68" }
      : { icon: "—", label: "Mixed", color: "#f5c451" };
  return <span title={`Agent view: ${config.label}`} aria-label={`Agent view: ${config.label}`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 text-[10px]" style={{ color: config.color, borderColor: `${config.color}55`, background: `${config.color}0d` }}>{config.icon}</span>;
}

function TimeframeBadges({ detail }: { detail: StockDetailResponse }) {
  const returns = detail.technicals?.multiTimeframe?.returns || {};
  return <div className="flex flex-wrap gap-2">{Object.entries(returns).slice(0, 4).map(([frame, value]) => <span key={frame} className="rounded-[var(--aw-radius-chip)] border border-[#29292f] bg-[#0e0e10] px-2.5 py-1 font-mono text-[9px]" style={{ color: value == null ? "#777780" : value >= 0 ? "#3ecf8e" : "#ff5f68" }}>{frame} {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}</span>)}</div>;
}

function findPivots(points: StockDetailResponse["history"]) {
  const candidates = points.map((point, index) => ({ point, index })).filter(({ point, index }) => {
    if (index < 4 || index >= points.length - 4) return false;
    const neighbors = points.slice(index - 4, index + 5).filter((_, offset) => offset !== 4).map((item) => item.close);
    return point.close > Math.max(...neighbors) || point.close < Math.min(...neighbors);
  });
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    const previous = selected.at(-1);
    if (!previous || (candidate.index - previous.index >= 8 && Math.abs(candidate.point.close - previous.point.close) / Math.max(Math.abs(previous.point.close), 0.01) >= 0.015)) selected.push(candidate);
  }
  return selected.slice(-12).map(({ point }) => point);
}

function normalizeHistory(history: StockDetailResponse["history"]) {
  const byDate = new Map<string, StockDetailResponse["history"][number]>();
  for (const point of history) {
    if (!point.date || !Number.isFinite(point.close) || point.close <= 0) continue;
    byDate.set(point.date.slice(0, 10), { ...point, date: point.date.slice(0, 10) });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function TextBox({ label, text, color }: { label: string; text: string; color: string }) { return <div className="rounded-[var(--aw-radius-control)] border border-[#29292f] bg-[#0e0e10] p-3"><div className="text-[9px] font-bold uppercase tracking-[.08em]" style={{ color }}>{label}</div><div className="mt-1.5 text-[11px] leading-[1.5] text-[#bcbcc2]">{text}</div></div>; }
function ReadLine({ label, text, color }: { label: string; text: string; color: string }) { return <div><span className="font-bold" style={{ color }}>{label}</span><span> — {text}</span></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function formatShort(value: number) { return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(value >= 100 ? 0 : 2); }
