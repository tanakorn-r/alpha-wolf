import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentByline, AgentSignoff } from "../../components/agents/AgentByline";
import { AgentRecap } from "../../components/agents/AgentRecap";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import type { StockAnalysisResponse, StockDetailResponse } from "../../lib/api";
import { paddedDomain } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { AnalystPanels } from "./AnalystPanels";
import { formatAnalyzedAt, signalLevel } from "./lib";
import { agentLoadingTitle, PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function AnalystTab({ hunt }: { hunt: HuntAi }) {
  const analyst = hunt.analyst;

  if (!hunt.premium) {
    return (
      <div className="rounded-[14px] p-[2px]" style={{ background: "linear-gradient(135deg,#74a4ff,#3ecf8e,#c77dff,#74a4ff)", backgroundSize: "300% 300%" }}>
        <div className="flex flex-col items-center gap-4 rounded-[12px] bg-[#0a0c0f] px-6 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#74a4ff]/30 bg-gradient-to-br from-[#74a4ff]/10 to-[#3ecf8e]/10">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="url(#aLkG)" strokeWidth="1.4"/><path d="M4 6h8M4 9h5" stroke="url(#aLkG)" strokeWidth="1.3" strokeLinecap="round"/><defs><linearGradient id="aLkG" x1="0" y1="0" x2="16" y2="16"><stop offset="0%" stopColor="#74a4ff"/><stop offset="100%" stopColor="#3ecf8e"/></linearGradient></defs></svg>
          </div>
          <div>
            <div className="mb-2 text-[20px] font-bold" style={{ background: "linear-gradient(90deg,#74a4ff,#3ecf8e,#c77dff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Stock Analyst</div>
            <div className="mx-auto max-w-[400px] text-[12.5px] leading-[1.6] text-[#8c8c95]">Pick a ticker from the Hunt watchlist and AlphaWolf pulls price action, news, revenue, cost structure, and fundamentals.</div>
          </div>
          <button type="button" onClick={hunt.unlockPremium} className="flex items-center gap-[9px] rounded-[11px] px-8 py-3 text-[14px] font-bold text-white hover:opacity-90" style={{ background: "linear-gradient(135deg,#74a4ff,#3ecf8e,#c77dff)" }}>
            Unlock Stock Analyst — from $29/mo
          </button>
        </div>
      </div>
    );
  }

  const hasResult = !analyst.loading && analyst.detail != null && analyst.analysis != null;
  const selectedTicker = analyst.activeTicker;
  const currency = analyst.detail?.stock.currency ?? "USD";
  const price = analyst.detail?.stock.price;
  const change = analyst.detail?.stock.changePct ?? 0;
  const inPortfolio = analyst.holdingSymbols.includes(analyst.ticker);

  return (
    <div className="flex flex-col gap-3">
      <div className={`${panel} flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5`}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div>
            <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-[#5a5a62]">Analyst target</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[17px] font-extrabold text-[#ececee]">{selectedTicker || "—"}</span>
              {analyst.detail ? <span className="max-w-[220px] truncate text-[11px] text-[#8c8c95]">{analyst.detail.stock.name}</span> : null}
              {inPortfolio ? <span className="rounded-[5px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/10 px-2 py-[2px] text-[9px] font-semibold text-[#3ecf8e]">IN PORTFOLIO</span> : null}
            </div>
          </div>
          {analyst.detail ? (
            <div className="flex items-baseline gap-1.5 border-l border-[#252529] pl-3">
              <span className="font-mono text-[17px] font-bold">{price != null ? formatCurrency(price, currency) : "—"}</span>
              <span className={`font-mono text-[11px] ${change >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {analyst.analysis && analyst.analyzedAt ? (
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">Last sync {formatAnalyzedAt(analyst.analyzedAt)}</span>
          ) : null}
          <PremiumAiButton label={analyst.loading ? "Analyzing" : analyst.analysis ? "Refresh" : "Analyze"} sublabel="Analyst" disabled={!selectedTicker} loading={analyst.loading} onClick={() => void analyst.run()} size="xs" />
        </div>
      </div>

      {analyst.loading ? <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "analyst", selectedTicker || "this stock")} subject={selectedTicker || "AI"} agentId={hunt.activeAgentId} task="analyst" /> : null}

      {hasResult && analyst.detail && analyst.analysis ? (
        <div className="flex flex-col gap-3">
          <AgentRecap agent={analyst.analysis.agent} recap={analyst.analysis.recap} fit={analyst.analysis.agentFit} reason={analyst.analysis.agentFitReason} className="" />
          <AnalystNoteCard analysis={analyst.analysis} />
          <LongTermStructureView analysis={analyst.analysis} />
          <AnalystPanels detail={analyst.detail} analysis={analyst.analysis} />
          <AnalystReasons analysis={analyst.analysis} />
          <AnalystPriceChart detail={analyst.detail} analysis={analyst.analysis} />
          <AgentSignoff agent={analyst.analysis.agent} />
        </div>
      ) : null}

      {!analyst.loading && !selectedTicker ? (
        <div className={`${panel} px-6 py-6 text-center`}>
          <div className="text-[14px] font-semibold">The analyst is waiting for a ticker</div>
          <div className="mx-auto mt-2 max-w-[360px] text-[12.5px] leading-[1.7] text-[#8c8c95]">Add or select a stock in the Hunt watchlist above. The Analyst tab will use that same ticker.</div>
        </div>
      ) : null}
    </div>
  );
}

function LongTermStructureView({ analysis }: { analysis: StockAnalysisResponse }) {
  const view = analysis.longTermView;
  const allocation = view.allocationPlan;
  const tone = view.outlookRating === "STRONG" ? "#3ecf8e" : view.outlookRating === "FAVORABLE" ? "#74a4ff" : view.outlookRating === "NO_EDGE" ? "#f5c451" : "#f2575c";
  const sectionTone = (rating: StockAnalysisResponse["longTermView"]["perspectiveSections"][number]["rating"]) =>
    rating === "STRENGTH" ? "#3ecf8e" : rating === "POSITIVE" ? "#74a4ff" : rating === "WATCH" || rating === "UNPROVEN" ? "#f5c451" : "#f2575c";

  return (
    <section className={`${panel} overflow-hidden p-3.5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252529] pb-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c8c95]">Company structure + Agent outlook</div>
          <div className="mt-1 text-[16px] font-bold text-[#ececee]">Same company data, different decision method</div>
          {analysis.agent?.analystFocus ? <div className="mt-1 text-[10.5px] text-[#8c8c95]">{analysis.agent.name} lens · {analysis.agent.analystFocus}</div> : null}
        </div>
        <span className="rounded-[6px] border px-2 py-[3px] font-mono text-[9.5px] font-bold" style={{ color: tone, borderColor: `${tone}55`, background: `${tone}10` }}>Structure {view.structureScore}/100</span>
      </div>

      <div className="mt-3 grid gap-2.5 min-[820px]:grid-cols-2">
        {view.perspectiveSections.map((section, index) => {
          const color = sectionTone(section.rating);
          return (
            <div key={`${section.title}-${index}`} className="rounded-[10px] border border-[#252529] bg-[#0e0e10] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color }}>{section.title}</div>
                <span className="rounded-[5px] border px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ color, borderColor: `${color}45`, background: `${color}0d` }}>{section.rating}</span>
              </div>
              <div className="mt-1.5 text-[12px] leading-[1.6] text-[#c8c8d0]">{section.body}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {section.evidence.map((item, evidenceIndex) => <span key={evidenceIndex} className="rounded-[5px] border border-[#252529] bg-white/[0.025] px-1.5 py-1 text-[9.5px] text-[#8c8c95]">{item}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 rounded-[10px] border px-3.5 py-3" style={{ borderColor: `${tone}45`, background: `${tone}09` }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: tone }}>{view.outlookTitle}</div>
          <span className="rounded-[5px] border border-[#2a2a31] bg-[#0e0e10] px-2 py-1 font-mono text-[9.5px] text-[#8c8c95]">Horizon · {view.outlookHorizon}</span>
        </div>
        <div className="mt-2 text-[12.5px] leading-[1.65] text-[#d8d8dd]">{view.agentOutlook}</div>
        <div className="mt-2.5 rounded-[8px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">Agent action</div>
          <div className="mt-1 text-[12px] font-semibold leading-[1.55]" style={{ color: tone }}>{view.actionPlan}</div>
        </div>
        <div className="mt-2.5 rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">Position tier · {allocation.tier}</div>
              <div className="mt-1 text-[13px] font-bold text-[#ececee]">{allocation.label}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[22px] font-extrabold leading-none" style={{ color: tone }}>{allocation.plannedPositionPct}%</div>
              <div className="mt-1 text-[8.5px] text-[#5a5a62]">of planned position</div>
            </div>
          </div>
          <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-[#1a1a1f]"><div className="h-full rounded-full" style={{ width: `${allocation.plannedPositionPct}%`, background: tone }} /></div>
          <div className="mt-2 text-[11px] leading-[1.55] text-[#bcbcc2]">{allocation.rationale}</div>
          <div className="mt-2 grid gap-2 min-[760px]:grid-cols-2">
            <div className="rounded-[7px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.04] px-2.5 py-2"><span className="text-[8.5px] font-bold uppercase text-[#3ecf8e]">Scale up</span><div className="mt-1 text-[10.5px] leading-[1.45] text-[#bcbcc2]">{allocation.scaleUpTrigger}</div></div>
            <div className="rounded-[7px] border border-[#f2575c]/20 bg-[#f2575c]/[0.04] px-2.5 py-2"><span className="text-[8.5px] font-bold uppercase text-[#f2575c]">Cut down</span><div className="mt-1 text-[10.5px] leading-[1.45] text-[#bcbcc2]">{allocation.cutTrigger}</div></div>
          </div>
          <div className="mt-2 text-[8.5px] text-[#5a5a62]">FULL means the full pre-planned position—not all portfolio cash.</div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {view.keySignals.map((signal, index) => <span key={index} className="rounded-[6px] border border-[#2a2a31] bg-white/[0.03] px-2 py-1 text-[10px] text-[#bcbcc2]">{signal}</span>)}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#f2575c]">What invalidates this Agent view</div>
        <div className="mt-2 grid gap-2 min-[760px]:grid-cols-2">
          {view.thesisBreakers.map((item, index) => (
            <div key={index} className="flex gap-2 rounded-[8px] border border-[#f2575c]/20 bg-[#f2575c]/[0.04] px-3 py-2 text-[11.5px] leading-[1.5] text-[#bcbcc2]">
              <span className="font-mono font-bold text-[#f2575c]">{index + 1}</span><span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AnalystNoteCard({ analysis }: { analysis: StockAnalysisResponse }) {
  const verdict = signalLevel(analysis.confidence, analysis.signal);
  const color = analysis.agent?.color ?? verdict.color;
  const perspectiveScore = analysis.confidence;
  return (
    <div
      className="relative overflow-hidden rounded-[10px] border px-3.5 py-3.5 shadow-[0_18px_54px_rgba(0,0,0,0.28)]"
      style={{
        borderColor: `${color}58`,
        background: `radial-gradient(circle at 4% 0%, ${color}24, transparent 33%), radial-gradient(circle at 92% 8%, ${color}1a, transparent 30%), linear-gradient(135deg, ${color}10, rgba(19,19,23,0.88) 58%, rgba(14,14,16,0.98))`,
        boxShadow: `0 0 0 1px ${color}16 inset, 0 18px 54px rgba(0,0,0,0.32), 0 0 46px ${color}12`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <AgentByline agent={analysis.agent} label="Analyst note" className="mb-0" />
        <div className="flex items-center gap-2">
          <span className="rounded-[7px] border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color, borderColor: `${color}66`, background: `${color}12` }}>
            {analysis.longTermView.outlookRating}
          </span>
          <span className="font-mono text-[18px] font-extrabold leading-none" style={{ color }}>{perspectiveScore ?? "N/A"}</span>
          {perspectiveScore != null ? <span className="font-mono text-[10px] text-[#5a5a62]">/100 Agent fit</span> : null}
        </div>
      </div>
      <div className="h-[4px] overflow-hidden rounded-full bg-[#1a1a1f]">
        <div className="h-full rounded-full" style={{ width: `${perspectiveScore ?? 0}%`, background: color }} />
      </div>
      <p className="mt-3 max-w-[1120px] whitespace-pre-line text-[13px] leading-[1.65] text-[#d8d8dd]">{analysis.summary}</p>
    </div>
  );
}

function AnalystPriceChart({ detail, analysis }: { detail: StockDetailResponse; analysis: StockAnalysisResponse }) {
  const currency = detail.stock.currency ?? "USD";
  const data = detail.history.slice(-80).map((point) => ({ date: point.date, close: point.close }));
  const domain = paddedDomain([
    ...data.map((point) => point.close),
    analysis.entryPrice?.entryPrice,
    analysis.targetPrice?.targetPrice,
  ], 0.12);

  return (
    <div className={`${panel} px-4 py-3.5`}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Price Context · Secondary</div>
          <div className="mt-1 text-[12px] text-[#8c8c95]">Recent closes shown after the Agent-specific investigation.</div>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-[#8c8c95]">
          <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[#3ecf8e]" />Price</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#f5c451]" />Entry</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#74a4ff]" />Target</span>
        </div>
      </div>
      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="analystPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis hide dataKey="date" />
            <YAxis hide domain={domain} />
            <Tooltip
              cursor={{ stroke: "#74a4ff", strokeWidth: 1, strokeDasharray: "3 4", strokeOpacity: 0.55 }}
              content={({ active, payload, label }) => active && payload?.length ? (
                <div className="rounded-lg border border-[#2a2a31] bg-[#101113] px-3 py-2 text-[11px] shadow-xl">
                  <div className="mb-1 font-mono text-[#8c8c95]">{label}</div>
                  <div className="font-mono font-semibold text-[#3ecf8e]">{formatCurrency(Number(payload[0].value), currency)}</div>
                </div>
              ) : null}
            />
            {analysis.entryPrice?.entryPrice != null ? <ReferenceLine y={analysis.entryPrice.entryPrice} stroke="#f5c451" strokeDasharray="4 4" strokeOpacity={0.8} /> : null}
            {analysis.targetPrice?.targetPrice != null ? <ReferenceLine y={analysis.targetPrice.targetPrice} stroke="#74a4ff" strokeDasharray="4 4" strokeOpacity={0.8} /> : null}
            <Area type="monotone" dataKey="close" stroke="#3ecf8e" strokeWidth={2} fill="url(#analystPriceFill)" dot={false} activeDot={{ r: 4, fill: "#3ecf8e", stroke: "#0d0f11", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnalystReasons({ analysis }: { analysis: StockAnalysisResponse }) {
  const color = signalLevel(analysis.confidence, analysis.signal).color;
  const reasons = [
    ...analysis.bullets,
    analysis.targetPrice?.basis,
    analysis.entryPrice?.why,
  ].filter(Boolean).slice(0, 4);

  if (!reasons.length) return null;
  return (
    <div className="rounded-[10px] border border-[#3ecf8e]/20 bg-[linear-gradient(135deg,rgba(62,207,142,0.04),rgba(77,150,255,0.03))] px-3.5 py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.8 4.5 4.7 1.5-4.7 1.2L8 14 6.2 8.7 1.5 7.5 6.2 6z" stroke="#3ecf8e" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#3ecf8e]">Evidence behind the structure view</span>
      </div>
      <div className="grid grid-cols-2 gap-2 max-[820px]:grid-cols-1">
        {reasons.map((reason, index) => (
          <div key={index} className="flex items-start gap-2.5 rounded-[9px] border border-[#252529] bg-white/[0.02] px-3 py-2.5">
            <span className="grid h-5 w-5 flex-none place-items-center rounded-[5px] border text-[9px] font-bold" style={{ color, borderColor: `${color}40`, background: `${color}18` }}>{index + 1}</span>
            <span className="text-[11.5px] leading-[1.5] text-[#c8c8d0]">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

