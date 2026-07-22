import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PaywallGate } from "../../components/ui/PaywallGate";
import { colorForTone, toneFromSignal } from "./lib";
import { actionPositionFromSignal } from "../../lib/actionPosition";
import { DataTrustBadge } from "../../components/DataTrustBadge";
import { agentName } from "./ui";
import type { HuntAi } from "./useHuntAi";
import { loadAiDecisionHistory, type AiDecisionHistoryItem, type AnalystBriefResponse, type MarketDataTrust, type NewsResearchResponse } from "../../lib/api";
import { formatLocalDateTime } from "../../lib/locale";
import { TickerEmptyPanel } from "../../components/ui/panels";
import { AiVisualSummary } from "../../components/ai/AiVisualSummary";

export function AnalystTab({ hunt }: { hunt: HuntAi }) {
  const analyst = hunt.analyst;

  if (!hunt.premium) {
    return (
      <PaywallGate
        icon={<svg width="22" height="22" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>}
        title="Stock Analyst"
        description="Pick a ticker and get one concise, Agent-specific decision from stored market evidence."
        ctaLabel="Unlock Stock Analyst — from $29/mo"
        onUnlock={hunt.unlockPremium}
      />
    );
  }

  const selectedTicker = analyst.activeTicker;
  const detail = analyst.detail;
  const analysis = analyst.analysis;
  const newsResearch = analyst.newsResearch;
  const actionColor = analysis ? toneFromSignal(analysis.signal, colorForTone(analysis.tone)) : null;
  const history = useQuery({
    queryKey: ["ai-decision-history", selectedTicker, hunt.activeAgentId, analysis?.generatedAt],
    queryFn: () => loadAiDecisionHistory(selectedTicker, hunt.activeAgentId),
    enabled: hunt.signedIn && Boolean(selectedTicker && analysis),
  });

  if (!selectedTicker) {
    return (
      <TickerEmptyPanel body="Add or select an asset in the Hunt watchlist above to run Analyst." />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {analyst.loading ? <AnalystProgress ticker={selectedTicker} agent={agentName(hunt.activeAgentId)} stage={analyst.stage} research={newsResearch} /> : null}

      {!analyst.loading && analyst.error ? <AnalystFailure phase={analyst.error.phase} message={analyst.error.message} sourceCount={newsResearch?.sources.length ?? 0} onRetry={() => void analyst.run(undefined, true)} /> : null}

      {!analyst.loading && analysis && actionColor ? (
        <AnalystReportSurface
          ticker={selectedTicker}
          fallbackName={agentName(hunt.activeAgentId)}
          analysis={analysis}
          research={newsResearch}
          actionColor={actionColor}
          actionScore={actionPositionFromSignal(analysis.signal, analysis.confidence, { tone: analysis.tone, actionScore: detail?.verdict?.score })}
          dataTrust={detail?.dataTrust}
          history={history.data ?? []}
          ranking={analyst.ranking}
          strategyLabel={analyst.strategyLabel}
          onRefresh={() => void analyst.run(undefined, true)}
        />
      ) : null}
    </div>
  );
}

function AnalystFailure({ phase, message, sourceCount, onRetry }: { phase: "news_research" | "analysis"; message: string; sourceCount: number; onRetry: () => void }) {
  const researchFailed = phase === "news_research";
  return (
    <section className="rounded-[12px] border border-[#f2575c]/30 bg-[linear-gradient(135deg,rgba(242,87,92,.09),rgba(18,18,20,.94))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[660px]">
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#f27f83]">{researchFailed ? "Step 1 stopped · web research" : "Step 2 stopped · Analyst synthesis"}</div>
          <h3 className="mt-1.5 text-[15px] font-extrabold text-[#f3f3f5]">{researchFailed ? "No new research or decision was created" : "Research finished, but the new decision did not"}</h3>
          <p className="mt-2 text-[11.5px] leading-[1.6] text-[#aaaab2]">{researchFailed ? "The previous saved Analyst card is hidden so it cannot be mistaken for this run. The failed AI call was returned to your balance." : `${sourceCount} live sources were saved. The previous decision is hidden because it does not represent this refresh; the failed synthesis call was returned to your balance.`}</p>
          <details className="mt-2 text-[10px] text-[#777780]"><summary className="cursor-pointer">Technical detail</summary><div className="mt-1">{message}</div></details>
        </div>
        <button type="button" onClick={onRetry} className="rounded-[8px] border border-[#f27f83]/35 bg-[#f2575c]/10 px-3.5 py-2 text-[10.5px] font-bold text-[#f4a4a7] transition hover:bg-[#f2575c]/[0.16]">Retry this run</button>
      </div>
    </section>
  );
}

function AnalystReportSurface({ ticker, fallbackName, analysis, research, actionColor, actionScore, dataTrust, history, ranking, strategyLabel, onRefresh }: { ticker: string; fallbackName: string; analysis: AnalystBriefResponse; research?: NewsResearchResponse | null; actionColor: string; actionScore: number; dataTrust?: MarketDataTrust | null; history: AiDecisionHistoryItem[]; ranking: { rank: number; total: number; label: string } | null; strategyLabel: string; onRefresh: () => void }) {
  const agent = analysis.agent;
  const accent = agent?.color ?? actionColor;
  const name = agent?.name ?? fallbackName;
  const confidence = analysis.confidence == null ? "—" : `${analysis.confidence}%`;
  return (
    <article className="aw-result-product aw-result-analyst @container min-w-0 overflow-hidden rounded-[14px] border border-white/[0.09] bg-[linear-gradient(150deg,#171719,#101012_58%)] shadow-[0_26px_70px_rgba(0,0,0,.28)]">
      <header className="border-b border-white/[0.07] px-4 py-4 @min-[760px]:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[9px] border bg-black/25 font-mono text-[9px] font-black" style={{ borderColor: `${accent}60`, color: accent }}>{agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent?.mono ?? name.slice(0, 1)}</span>
            <div><div className="text-[11px] font-extrabold" style={{ color: accent }}>{name}</div><div className="text-[9px] uppercase tracking-[0.08em] text-[#686871]">Deep analysis · {ticker}</div></div>
          </div>
          <button type="button" onClick={onRefresh} className="rounded-[8px] border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[9.5px] font-bold text-[#bcbcc2] transition hover:border-white/[0.2] hover:bg-white/[0.06]">Refresh research + analysis</button>
        </div>

        <div className="mt-4 grid items-start gap-4 @min-[760px]:grid-cols-[minmax(0,1fr)_210px]">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-[6px] border px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.06em]" style={{ borderColor: `${actionColor}65`, background: `${actionColor}12`, color: actionColor }}>{analysis.signal}</span><span className="text-[9.5px] text-[#777780]">{analysis.timeHorizon}</span></div>
            <h2 className="mt-2.5 max-w-[820px] text-[20px] font-black leading-[1.23] tracking-[-0.35px] text-[#f0f0f2]">{analysis.headline}</h2>
            <p className="mt-2 line-clamp-3 max-w-[860px] text-[12.5px] leading-[1.6] text-[#aaaab2]">{analysis.summary}</p>
          </div>
          <DecisionMeter score={actionScore} confidence={confidence} color={actionColor} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetaChip label="Strategy" value={strategyLabel} color="#74a4ff" />
          {ranking ? <MetaChip label="Shortlist" value={`#${ranking.rank} of ${ranking.total}`} color={accent} /> : null}
          <MetaChip label="Agent fit" value={analysis.agentFit} color={accent} />
          <MetaChip label="Confidence" value={confidence} />
          <MetaChip label="Sources" value={research ? String(research.sources.length) : "legacy"} color={research ? "#78a7ff" : "#8c8c95"} />
          <MetaChip label="Research" value={research ? "live + structural" : "not attached"} color={research ? "#3ecf8e" : "#f5c451"} />
        </div>
      </header>

      <div className="grid @min-[940px]:grid-cols-[minmax(0,1fr)_minmax(300px,.38fr)]">
        <main className="min-w-0 px-4 py-4 @min-[760px]:px-5 @min-[940px]:border-r @min-[940px]:border-white/[0.07]">
          <SectionLabel number="01" title="Decision map" color="#78a7ff" />
          <DecisionPath analysis={analysis} accent={accent} actionColor={actionColor} />

          <details className="group mt-3 rounded-[9px] border border-white/[0.07] bg-black/10 px-3.5 py-3">
            <summary className="cursor-pointer list-none text-[9.5px] font-black uppercase tracking-[0.09em] text-[#8dafff]">Read the full investment memo <span className="group-open:hidden">＋</span><span className="hidden group-open:inline">−</span></summary>
            <div className="mt-3 grid gap-4">
              <div><div className="text-[8.5px] font-black uppercase tracking-[0.09em] text-[#777780]">Research synthesis</div><p className="mt-1.5 text-[11.5px] leading-[1.65] text-[#bcbcc3]">{analysis.researchSynthesis}</p></div>
              <div><div className="text-[8.5px] font-black uppercase tracking-[0.09em]" style={{ color: accent }}>Controlling question</div><p className="mt-1.5 text-[12px] font-bold leading-[1.55] text-[#ececee]">{analysis.controllingQuestion}</p><p className="mt-1.5 text-[11.5px] leading-[1.65] text-[#a8a8b0]">{analysis.thesis}</p></div>
              <div className="border-l-2 pl-3" style={{ borderColor: actionColor }}><div className="text-[8.5px] font-black uppercase tracking-[0.09em]" style={{ color: actionColor }}>Complete action plan</div><p className="mt-1.5 text-[11.5px] font-semibold leading-[1.65] text-[#dedee3]">{analysis.actionPlan}</p><div className="mt-2 text-[10.5px] leading-[1.55] text-[#92929b]"><b className="mr-1 text-[#bcbcc2]">Decision rule:</b>{analysis.decisionRule}</div></div>
            </div>
          </details>

          <div className="mt-5 grid gap-5 @min-[1100px]:grid-cols-2">
            <EvidenceList title="Evidence supporting the call" items={analysis.evidence} color="#3ecf8e" />
            <EvidenceList title="Risks against the call" items={analysis.risks} color="#f2575c" />
          </div>
          <div className="mt-4"><AiVisualSummary title="Thesis balance" subtitle="Evidence the Agent explicitly weighed" segments={[{ label: "Supporting", value: analysis.evidence.length, color: "#3ecf8e", icon: "+" }, { label: "Risks", value: analysis.risks.length, color: "#f2575c", icon: "−" }]} /></div>

          <section className="mt-4 rounded-[9px] border border-[#f5c451]/20 bg-[#f5c451]/[0.035] px-3.5 py-3">
            <div className="text-[9px] font-black uppercase tracking-[0.09em] text-[#f5c451]">What changes the decision</div>
            <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-[1.6] text-[#cec29d]">{analysis.changeTrigger}</p>
          </section>

          <section className="mt-4 flex gap-3 rounded-[9px] bg-white/[0.025] px-3.5 py-3">
            <span className="mt-1 h-2 w-2 flex-none rounded-full" style={{ background: actionColor }} />
            <div><div className="text-[8.5px] font-black uppercase tracking-[0.09em] text-[#777780]">Bottom line</div><p className="mt-1 text-[11.5px] font-medium leading-[1.55] text-[#d2d2d7]">{analysis.recap}</p></div>
          </section>
        </main>

        <aside className="min-w-0 bg-black/[0.13] px-4 py-4">
          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#78a7ff]">Live research brief</div>
          {research?.researchFocus ? <div className="mt-2 rounded-[8px] border border-[#78a7ff]/20 bg-[#78a7ff]/[0.06] px-3 py-2 text-[9.5px] leading-[1.5] text-[#9ebcff]"><span className="font-bold text-[#c6d7ff]">What {name} investigated:</span> {research.researchFocus}</div> : null}
          <p className="mt-2 line-clamp-3 text-[11px] leading-[1.55] text-[#aaaab2]">{research?.summary ?? "This saved decision predates live research. Refresh to create a source-backed report."}</p>
          {research?.keyEvents.length ? <div className="mt-3 grid gap-2">{research.keyEvents.slice(0, 3).map((event, index) => <div key={index} className="flex gap-2 text-[10.5px] leading-[1.45] text-[#bcbcc2]"><span className="font-mono text-[#5f8fe8]">{String(index + 1).padStart(2, "0")}</span><span className="line-clamp-2">{event}</span></div>)}</div> : null}

          {research?.horizons.length ? <div className="mt-4 border-t border-white/[0.07] pt-3"><div className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#686871]">Outlook by horizon</div><div className="mt-2 grid gap-2">{research.horizons.map((horizon) => <HorizonRow key={horizon.label} horizon={horizon} />)}</div></div> : null}

          {research?.sources.length ? <details className="mt-4 border-t border-white/[0.07] pt-3"><summary className="cursor-pointer text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#78a7ff]">Open {research.sources.length} ranked sources</summary><div className="mt-3 grid gap-2">{research.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="group grid grid-cols-[18px_1fr] gap-1.5 text-[10px]"><span className="font-mono text-[#5f5f68]">{index + 1}</span><span><span className="line-clamp-2 leading-[1.35] text-[#bcbcc2] group-hover:text-[#8db3ff]">{source.title}</span><span className="mt-0.5 block text-[8.5px] text-[#5f5f68]">{source.publisher} · relevance {source.relevance}</span></span></a>)}</div></details> : null}
        </aside>
      </div>

      <footer className="border-t border-white/[0.07] px-4 py-3 @min-[760px]:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2 text-[10px] leading-[1.5] text-[#777780]"><span>{analysis.agentFitReason} · AI-generated research, not financial advice.</span>{analysis.generatedAt ? <span className="whitespace-nowrap font-mono text-[8.5px] text-[#56565e]">Updated {formatLocalDateTime(analysis.generatedAt)}</span> : null}</div>
        <DataTrustBadge trust={dataTrust} className="mt-3" />
        {history.length ? <DecisionHistory history={history} /> : null}
      </footer>
    </article>
  );
}

function DecisionMeter({ score, confidence, color }: { score: number; confidence: string; color: string }) {
  const safe = Math.max(0, Math.min(100, score));
  return <div className="rounded-[10px] border border-white/[0.08] bg-black/25 px-3 py-2.5"><div className="flex items-center justify-between text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#777780]"><span>Action position</span><span style={{ color }}>{confidence}</span></div><div className="relative mt-3 h-1.5 rounded-full bg-[linear-gradient(90deg,#f2575c,#f5c451_50%,#3ecf8e)]"><span className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#ececee] shadow-[0_0_0_3px_rgba(14,14,16,.85)]" style={{ left: `${safe}%` }} /></div><div className="mt-1.5 flex justify-between text-[7.5px] font-bold uppercase text-[#56565e]"><span>Sell</span><span>Hold</span><span>Buy</span></div></div>;
}

function MetaChip({ label, value, color = "#bcbcc2" }: { label: string; value: string; color?: string }) {
  return <span className="rounded-full border border-white/[0.07] bg-black/15 px-2.5 py-1 text-[8.5px] text-[#666670]"><b className="mr-1 font-semibold">{label}</b><span className="font-bold uppercase" style={{ color }}>{value}</span></span>;
}

function SectionLabel({ number, title, color }: { number: string; title: string; color: string }) {
  return <div className="flex items-center gap-2"><span className="font-mono text-[8.5px] font-black" style={{ color }}>{number}</span><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#777780]">{title}</span></div>;
}

function DecisionPath({ analysis, accent, actionColor }: { analysis: AnalystBriefResponse; accent: string; actionColor: string }) {
  const steps = [
    { icon: "⌕", label: "Research found", text: compactMemo(analysis.researchSynthesis), color: "#78a7ff" },
    { icon: "?", label: "Question that matters", text: compactMemo(analysis.controllingQuestion, 115), color: accent },
    { icon: "→", label: "What to do", text: compactMemo(analysis.actionPlan, 125), color: actionColor },
  ];
  return <div className="relative mt-3 grid gap-2 @min-[720px]:grid-cols-3 before:absolute before:left-[16%] before:right-[16%] before:top-[21px] before:hidden before:h-px before:bg-white/[0.09] @min-[720px]:before:block">{steps.map((step) => <div key={step.label} className="relative rounded-[10px] border border-white/[0.07] bg-[#121315] p-3"><span className="grid h-7 w-7 place-items-center rounded-full border bg-[#121315] text-[12px] font-black" style={{ color: step.color, borderColor: `${step.color}55` }}>{step.icon}</span><div className="mt-2 text-[8.5px] font-black uppercase tracking-[0.09em]" style={{ color: step.color }}>{step.label}</div><p className="mt-1.5 line-clamp-3 text-[10.5px] font-medium leading-[1.5] text-[#c5c5cb]">{step.text}</p></div>)}</div>;
}

function compactMemo(value: string, maxLength = 140) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const end = text.slice(0, maxLength).lastIndexOf(" ");
  return `${text.slice(0, end > 80 ? end : maxLength).trim()}…`;
}

function EvidenceList({ title, items, color }: { title: string; items: string[]; color: string }) {
  const visible = items.slice(0, 3);
  const hidden = items.slice(3);
  return <section><div className="text-[9px] font-black uppercase tracking-[0.09em]" style={{ color }}>{title}</div><div className="mt-2 grid gap-2">{visible.map((item, index) => <div key={index} className="grid grid-cols-[16px_1fr] gap-2 text-[11px] leading-[1.55] text-[#b8b8bf]"><span className="font-mono text-[9px]" style={{ color }}>{String(index + 1).padStart(2, "0")}</span><span className="line-clamp-2">{item}</span></div>)}</div>{hidden.length ? <details className="mt-2"><summary className="cursor-pointer text-[9px] font-bold" style={{ color }}>+{hidden.length} more</summary><div className="mt-2 grid gap-2">{hidden.map((item, index) => <div key={index} className="text-[10.5px] leading-[1.5] text-[#9999a2]">• {item}</div>)}</div></details> : null}</section>;
}

function HorizonRow({ horizon }: { horizon: NewsResearchResponse["horizons"][number] }) {
  const color = horizon.direction === "BULLISH" ? "#3ecf8e" : horizon.direction === "BEARISH" ? "#f2575c" : horizon.direction === "MIXED" ? "#f5c451" : "#8c8c95";
  return <details className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-2"><div><div className="text-[9.5px] font-bold text-[#cfcfd4]">{horizon.label}</div><div className="mt-0.5 text-[8.5px] text-[#5f5f68]">{horizon.window}</div></div><div className="text-right"><div className="text-[8.5px] font-black" style={{ color }}>{horizon.direction}</div><div className="font-mono text-[8px] text-[#686871]">{horizon.confidence}%</div></div></div></summary><p className="mt-2 text-[9.5px] leading-[1.45] text-[#8c8c95]">{horizon.thesis}</p><div className="mt-1.5 text-[8.5px] text-[#686871]">Invalidation: {horizon.invalidation}</div></details>;
}

function DecisionHistory({ history }: { history: AiDecisionHistoryItem[] }) {
  return <details className="mt-3 border-t border-white/[0.06] pt-3"><summary className="cursor-pointer text-[9px] font-bold uppercase tracking-[0.08em] text-[#686871]">Decision history · {history.length} saved changes</summary><ol className="mt-3 grid gap-2.5">{history.slice(0, 8).map((item) => <li key={item.runId} className="border-l border-white/[0.1] pl-3 text-[10px] leading-[1.5] text-[#9a9aa3]"><div className="font-mono text-[8.5px] text-[#5f5f68]">{formatLocalDateTime(item.createdAt)} · {item.decision.action}</div><div className="mt-0.5">{item.whyChanged}</div></li>)}</ol></details>;
}

function AnalystProgress({ ticker, agent, stage, research }: { ticker: string; agent: string; stage: "news_research" | "market_data" | "analysis"; research?: NewsResearchResponse | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const researchDone = stage !== "news_research";
  const researchActivities = ["Scanning primary and company sources", "Checking country and industry evidence", "Ranking the most decision-relevant sources", "Testing whether events affect the long-term thesis"];
  const synthesisActivities = stage === "market_data"
    ? ["Loading company and market evidence", "Connecting research to business fundamentals", "Checking conflicts across the evidence"]
    : ["Weighing the strongest evidence and dissent", "Writing the action and risk condition", "Checking the final decision for consistency"];
  const activeActivity = (researchDone ? synthesisActivities : researchActivities)[Math.floor(elapsed / 3) % (researchDone ? synthesisActivities.length : researchActivities.length)];
  return (
    <section className="relative overflow-hidden rounded-[13px] border border-white/[0.09] bg-[#111114] p-4 shadow-[0_18px_55px_rgba(0,0,0,.24)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px analyst-loading-beam" />
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-[13px] font-extrabold text-[#ececee]">{agent} is building one linked decision for {ticker}</div><div className="mt-1 text-[10.5px] text-[#777780]">Two independent AI calls · each step is capped at 3 minutes</div></div>
        <div className="flex items-center gap-2 rounded-full border border-[#4d8dff]/20 bg-[#4d8dff]/[0.05] py-1 pl-1.5 pr-2.5">
          <span className="relative grid h-5 w-5 place-items-center"><span className="absolute inset-0 animate-spin rounded-full border border-transparent border-r-[#3ecf8e] border-t-[#4d8dff]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#78a7ff]" /></span>
          <span className="font-mono text-[10px] text-[#a4a4ad]">LIVE · {elapsed}s</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2.5 @min-[620px]:grid-cols-2">
        <ProgressStep number="01" title="Agent web research" detail={researchDone ? `${research?.headline ?? "Research saved"} · ${research?.sources.length ?? 0} sources` : activeActivity} state={researchDone ? "done" : "active"} visual="research" />
        <ProgressStep number="02" title="Deep Analyst synthesis" detail={researchDone ? activeActivity : "Starts automatically after research"} state={researchDone ? "active" : "waiting"} visual="synthesis" />
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#4d8dff] to-[#3ecf8e] transition-all duration-700" style={{ width: researchDone ? "58%" : "8%" }} />
        <div className="absolute inset-y-0 w-1/3 analyst-progress-sweep bg-gradient-to-r from-transparent via-[#78a7ff] to-transparent" />
      </div>
      <div key={activeActivity} className="mt-2 flex items-center justify-center gap-1.5 text-[9.5px] text-[#777780] analyst-activity-in"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ecf8e]" />Still working · {activeActivity}</div>
    </section>
  );
}

function ProgressStep({ number, title, detail, state, visual }: { number: string; title: string; detail: string; state: "active" | "done" | "waiting"; visual: "research" | "synthesis" }) {
  const active = state === "active";
  return (
    <div className={`relative overflow-hidden rounded-[10px] border p-3.5 transition-colors ${active ? "analyst-active-step border-[#4d8dff]/40 bg-[#4d8dff]/[0.06]" : state === "done" ? "border-[#3ecf8e]/25 bg-[#3ecf8e]/[0.04]" : "border-white/[0.06] bg-black/15"}`}>
      {active ? <div className="pointer-events-none absolute inset-y-0 w-1/2 analyst-card-shimmer bg-gradient-to-r from-transparent via-white/[0.035] to-transparent" /> : null}
      <div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[9px] font-black ${active ? "animate-pulse bg-[#4d8dff]/20 text-[#78a7ff]" : state === "done" ? "bg-[#3ecf8e]/15 text-[#3ecf8e]" : "bg-white/[0.05] text-[#5f5f68]"}`}>{state === "done" ? "✓" : number}</span><span className="text-[11px] font-bold text-[#d9d9de]">{title}</span></div>
      <div key={detail} className={`mt-2 min-h-4 text-[10.5px] leading-[1.45] ${active ? "text-[#aebbd2] analyst-activity-in" : "text-[#85858e]"}`}>{detail}{active ? <LoadingDots /> : null}</div>
      {active ? visual === "research" ? <ResearchPulse /> : <SynthesisPulse /> : null}
    </div>
  );
}

function LoadingDots() {
  return <span className="ml-1 inline-flex gap-0.5 align-middle"><i className="h-1 w-1 animate-bounce rounded-full bg-[#78a7ff] [animation-delay:-.3s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-[#78a7ff] [animation-delay:-.15s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-[#78a7ff]" /></span>;
}

function ResearchPulse() {
  return (
    <div className="mt-3 grid gap-1.5" aria-hidden="true">
      {["w-[78%]", "w-[61%]", "w-[88%]"].map((width, index) => <div key={width} className="flex items-center gap-2"><span className="relative h-2 w-2 flex-none"><span className="absolute inset-0 animate-ping rounded-full bg-[#4d8dff]/45" style={{ animationDelay: `${index * 220}ms` }} /><span className="absolute inset-[2px] rounded-full bg-[#78a7ff]" /></span><span className={`h-1.5 overflow-hidden rounded-full bg-white/[0.07] ${width}`}><span className="block h-full w-1/3 analyst-source-scan rounded-full bg-gradient-to-r from-transparent via-[#78a7ff]/70 to-transparent" style={{ animationDelay: `${index * 280}ms` }} /></span></div>)}
    </div>
  );
}

function SynthesisPulse() {
  return (
    <div className="mt-4 flex items-center" aria-hidden="true">
      {["NEWS", "DATA", "CALL"].map((label, index) => <div key={label} className="contents"><span className={`grid h-7 min-w-11 place-items-center rounded-md border text-[8px] font-black tracking-[0.08em] ${index === 2 ? "border-[#3ecf8e]/30 text-[#65d9a2]" : "border-[#4d8dff]/25 text-[#78a7ff]"}`}>{label}</span>{index < 2 ? <span className="relative mx-1.5 h-px flex-1 overflow-visible bg-white/[0.09]"><i className="absolute -top-1 h-2 w-2 analyst-link-dot rounded-full bg-[#78a7ff]" style={{ animationDelay: `${index * 600}ms` }} /></span> : null}</div>)}
    </div>
  );
}
