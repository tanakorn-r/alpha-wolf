import { useState } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentCall } from "../../components/agents/AgentCall";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { EmptyPanel, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { formatCurrency } from "../../lib/format";
import type { StockDetailResponse, TechnicalAnalysisResponse } from "../../lib/api";
import { agentLoadingTitle, PremiumLoading } from "./ui";
import type { HuntAi } from "./useHuntAi";

const COLORS = { price: "#ff65c7", fib: "#d6b36a", dow: "#3ecf8e", phase: "#74a4ff" };
type Overlay = "dow" | "wyckoff" | "elliott" | "fibonacci" | "levels" | "timeframes";

export function TechnicalAnalysisTab({ hunt }: { hunt: HuntAi }) {
  const technical = hunt.technical;
  if (!technical.ticker) return <EmptyPanel title="No ticker selected" body="Add or select a ticker to open Technical Analysis." />;
  if (technical.pending) return <LoadingPanel title={`Loading ${technical.ticker} chart...`} body="Reading cached price history and market structure." />;
  if (technical.failed || !technical.detail) return <RetryPanel label="Technical chart data is unavailable." onRetry={technical.retry} />;

  return (
    <div className="flex flex-col gap-3.5">
      <TickerHeader detail={technical.detail} loading={technical.aiLoading} onRun={() => void technical.run(Boolean(technical.analysis))} hasAnalysis={Boolean(technical.analysis)} />
      {technical.aiLoading ? <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "intraday", technical.ticker)} subject={technical.ticker} agentId={hunt.activeAgentId} task="intraday" /> : null}
      {!technical.aiLoading && technical.analysis ? <AgentRead analysis={technical.analysis} onRerun={() => void technical.run(true)} /> : null}
      <StructureChart detail={technical.detail} analysis={technical.analysis} />
    </div>
  );
}

function TickerHeader({ detail, loading, onRun, hasAnalysis }: { detail: StockDetailResponse; loading: boolean; onRun: () => void; hasAnalysis: boolean }) {
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
        <PremiumAiButton label={loading ? "Analyzing" : hasAnalysis ? "Refresh" : "AI Technical"} sublabel="Chart" disabled={loading} loading={loading} onClick={onRun} size="xs" />
      </div>
    </section>
  );
}

function AgentRead({ analysis, onRerun }: { analysis: TechnicalAnalysisResponse; onRerun: () => void }) {
  const color = analysis.tone === "good" ? "#3ecf8e" : analysis.tone === "bad" ? "#ff5f68" : "#f5c451";
  return (
    <AgentCall agent={analysis.agent} label="Chart read" score={analysis.confidence} scoreLabel="technical fit" signal={analysis.signal} headline={analysis.headline} summary={analysis.summary} accent={color} onRerun={onRerun} meta="Agent-weighted technical read · heuristic, not financial advice">
      <div className="mt-4 grid gap-2 min-[760px]:grid-cols-5">
        {analysis.frameworks.map((item) => <div key={item.framework} className="rounded-[var(--aw-radius-control)] border border-[#29292f] bg-[#0e0e10] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-[#ececee]">{humanize(item.framework)}</span><div className="flex items-center gap-1.5"><FrameworkStance stance={item.stance} /><span className="text-[8px] font-bold" style={{ color: item.weight === "PRIMARY" ? color : item.weight === "CONFIRMATION" ? "#74a4ff" : "#6f6f78" }}>{item.weight}</span></div></div><div className="mt-2 text-[11px] font-semibold leading-[1.4]">{item.verdict}</div><div className="mt-1 text-[9.5px] leading-[1.45] text-[#777780]">{item.evidence}</div></div>)}
      </div>
      <div className="mt-3 grid gap-2 min-[720px]:grid-cols-2"><TextBox label="Agent action" text={analysis.action} color={color} /><TextBox label="Structure / business context" text={analysis.structureContext} color="#d6b36a" /></div>
      <div className="mt-3 text-[10px] font-bold uppercase tracking-[.08em] text-[#ff5f68]">What invalidates this view</div>
      <div className="mt-2 grid gap-2 min-[720px]:grid-cols-2">{analysis.invalidations.map((item, index) => <TextBox key={item} label={`${index + 1}`} text={item} color="#ff5f68" />)}</div>
    </AgentCall>
  );
}

function StructureChart({ detail, analysis }: { detail: StockDetailResponse; analysis: TechnicalAnalysisResponse | null }) {
  const [visible, setVisible] = useState<Set<Overlay>>(() => new Set(["dow", "wyckoff", "elliott", "fibonacci", "levels", "timeframes"]));
  const points = normalizeHistory(detail.history).slice(-126);
  const technicals = detail.technicals || {};
  const fib = technicals.fibonacci;
  const pivots = findPivots(points);
  const pivotDates = new Set(pivots.map((point) => point.date));
  const lastDate = points.at(-1)?.date;
  const chartPoints = points.map((point) => ({ ...point, dowPivot: pivotDates.has(point.date) ? point.close : null, elliottMarker: point.date === lastDate ? point.close : null }));
  const phaseStart = points[Math.max(0, points.length - 60)]?.date;
  const phaseEnd = points.at(-1)?.date;
  const levels = fib ? [
    ["61.8% retrace", fib.retracements?.["61.8"]],
    ["127.2% extension", fib.extensions?.["127.2"]],
    ["161.8% extension", fib.extensions?.["161.8"]],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])) : [];
  const visibleValues = [...points.map((point) => point.close), ...levels.map(([, value]) => value), technicals.support, technicals.resistance].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const visibleMin = Math.min(...visibleValues);
  const visibleMax = Math.max(...visibleValues);
  const padding = Math.max((visibleMax - visibleMin) * 0.1, Math.abs(visibleMax) * 0.015, 0.01);
  const yDomain: [number, number] = [visibleMin - padding, visibleMax + padding];
  const currency = detail.stock.currency || "USD";
  function toggle(overlay: Overlay) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(overlay)) next.delete(overlay); else next.add(overlay);
      return next;
    });
  }
  return (
    <section className="rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[17px] font-bold">Structure chart · 6 months</h2><p className="mt-1 text-[11.5px] text-[#8c8c95]">Click a colored indicator to show or hide it.</p></div><OverlayControls visible={visible} onToggle={toggle} /></div>
      {visible.has("timeframes") ? <div className="mt-3 flex justify-end"><TimeframeBadges detail={detail} /></div> : null}
      <div className="mt-4 h-[390px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartPoints} margin={{ top: 12, right: 68, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="#222228" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#666670", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={45} />
            <YAxis domain={yDomain} orientation="right" tick={{ fill: "#777780", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => formatShort(value)} />
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-[8px] border border-[#33333a] bg-[#0b0b0d] px-3 py-2 text-[10px]"><div className="text-[#777780]">{label}</div><div className="mt-1 font-mono text-[#ff65c7]">{formatCurrency(Number(payload[0]?.value || 0), currency)}</div></div> : null} />
            {visible.has("wyckoff") && phaseStart && phaseEnd ? <ReferenceArea x1={phaseStart} x2={phaseEnd} fill={COLORS.phase} fillOpacity={0.055} stroke={COLORS.phase} strokeOpacity={0.22} label={{ value: humanize(technicals.wyckoff?.phase || "Wyckoff window"), fill: COLORS.phase, fontSize: 9, position: "insideTopLeft" }} /> : null}
            {visible.has("fibonacci") ? levels.map(([label, value]) => <ReferenceLine key={label} y={value} stroke={COLORS.fib} strokeOpacity={0.5} strokeDasharray="5 5" />) : null}
            {visible.has("levels") && technicals.support ? <ReferenceLine y={technicals.support} stroke="#3ecf8e" strokeOpacity={0.5} strokeDasharray="3 4" /> : null}
            {visible.has("levels") && technicals.resistance ? <ReferenceLine y={technicals.resistance} stroke="#ff5f68" strokeOpacity={0.5} strokeDasharray="3 4" /> : null}
            <Line type="monotone" dataKey="close" stroke={COLORS.price} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {visible.has("dow") ? <Line dataKey="dowPivot" stroke="transparent" strokeWidth={0} connectNulls={false} dot={{ r: 4, fill: COLORS.dow, stroke: "#0e0e10", strokeWidth: 2 }} activeDot={false} isAnimationActive={false} /> : null}
            {visible.has("elliott") ? <Line dataKey="elliottMarker" stroke="transparent" strokeWidth={0} connectNulls={false} dot={{ r: 5, fill: "#c77dff", stroke: "#0e0e10", strokeWidth: 2 }} activeDot={false} isAnimationActive={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {visible.has("fibonacci") && levels.length ? <div className="mt-1 flex flex-wrap justify-end gap-3">{levels.map(([label, value]) => <span key={label} className="font-mono text-[9px] text-[#d6b36a]">{label} · {formatCurrency(value, currency)}</span>)}</div> : null}
      <div className="mt-3 grid gap-1.5 border-t border-[#25252b] pt-3 text-[11px] text-[#a0a0a8]">
        {visible.has("dow") ? <ReadLine label="Dow" color={COLORS.dow} text={`${humanize(technicals.dowTheory?.trend || "Unavailable")} · ${technicals.dowTheory?.confirmation || "no confirmation"}`} /> : null}
        {visible.has("wyckoff") ? <ReadLine label="Wyckoff" color={COLORS.phase} text={`${humanize(technicals.wyckoff?.phase || "Unavailable")} · ${technicals.wyckoff?.note || "No phase read"}`} /> : null}
        {visible.has("elliott") ? <ReadLine label="Elliott" color="#c77dff" text={`${humanize(technicals.elliottWave?.bias || "Unavailable")} · ${technicals.elliottWave?.note || "No wave read"}`} /> : null}
        {visible.has("fibonacci") ? <ReadLine label="Fibonacci" color={COLORS.fib} text={fib?.note || "No usable swing range"} /> : null}
        {visible.has("timeframes") ? <ReadLine label="Multiple timeframe" color="#3ecf8e" text={`${technicals.multiTimeframe?.alignment || "Unavailable"} · ${technicals.multiTimeframe?.note || ""}`} /> : null}
        {analysis ? <ReadLine label="Agent structure" color={analysis.agent?.color || "#ececee"} text={analysis.structureContext} /> : null}
      </div>
    </section>
  );
}

function OverlayControls({ visible, onToggle }: { visible: Set<Overlay>; onToggle: (overlay: Overlay) => void }) {
  const options: Array<{ key: Overlay; label: string; color: string }> = [
    { key: "dow", label: "Dow pivots", color: COLORS.dow },
    { key: "wyckoff", label: "Wyckoff", color: COLORS.phase },
    { key: "elliott", label: "Elliott bias", color: "#c77dff" },
    { key: "fibonacci", label: "Fibonacci", color: COLORS.fib },
    { key: "levels", label: "Support / resistance", color: "#ff5f68" },
    { key: "timeframes", label: "Timeframes", color: "#c77dff" },
  ];
  return <div className="flex max-w-[720px] flex-wrap justify-end gap-1.5">{options.map((option) => { const active = visible.has(option.key); return <button key={option.key} type="button" aria-pressed={active} onClick={() => onToggle(option.key)} className={`inline-flex items-center gap-1.5 rounded-[var(--aw-radius-chip)] border px-2.5 py-1.5 text-[9.5px] font-semibold transition ${active ? "border-[#34343c] bg-[#1c1c20] text-[#d7d7dc]" : "border-[#242429] bg-[#101012] text-[#5f5f67]"}`}><span className="h-2 w-2 rounded-full" style={{ background: option.color, opacity: active ? 1 : 0.28 }} />{option.label}</button>; })}</div>;
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
