import { AgentCall } from "../../components/agents/AgentCall";
import { useQuery } from "@tanstack/react-query";
import { PaywallGate } from "../../components/ui/PaywallGate";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { formatCurrency } from "../../lib/format";
import { formatAnalyzedAt, signalLevel } from "./lib";
import { agentLoadingTitle, PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";
import { loadAiDecisionHistory } from "../../lib/api";
import { formatLocalDateTime } from "../../lib/locale";
import { TickerEmptyPanel } from "../../components/ui/panels";

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
  const verdict = analysis ? signalLevel(analysis.confidence, analysis.signal) : null;
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
      <div className={`${panel} flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5`}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="font-mono text-[17px] font-extrabold text-[#ececee]">{selectedTicker || "—"}</span>
          {detail ? <span className="max-w-[240px] truncate text-[11px] text-[#8c8c95]">{detail.stock.name}</span> : null}
          {detail?.stock.price != null ? <span className="font-mono text-[13px] text-[#bcbcc2]">{formatCurrency(detail.stock.price, detail.stock.currency)}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {analysis && analyst.analyzedAt ? <span className="font-mono text-[10px] uppercase text-[#8c8c95]">{formatAnalyzedAt(analyst.analyzedAt)}</span> : null}
          <PremiumAiButton label={analyst.loading ? "Analyzing" : analysis ? "Refresh" : "Analyze"} sublabel="Analyst" disabled={!selectedTicker} loading={analyst.loading} onClick={() => void analyst.run(undefined, Boolean(analysis))} size="xs" />
        </div>
      </div>

      {analyst.loading ? <>
        <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "analyst", selectedTicker || "this stock")} subject={selectedTicker || "AI"} agentId={hunt.activeAgentId} task="analyst" />
        <div className="-mt-1 text-center text-[11px] text-[#8c8c95]">{analyst.stage === "market_data" ? "Reading stored market evidence…" : "Generating one concise Agent decision…"}</div>
      </> : null}

      {!analyst.loading && analysis && verdict ? (
        <AgentCall
          agent={analysis.agent}
          label="Analyst decision"
          score={analysis.confidence}
          scoreLabel="Decision conviction"
          signal={analysis.signal}
          headline={analysis.headline}
          summary={<span className="whitespace-pre-line">{analysis.recap || analysis.summary}</span>}
          accent={analysis.agent?.color ?? verdict.color}
          meta={`${analysis.agentFitReason} · not financial advice`}
          onRerun={() => void analyst.run(undefined, true)}
          dataTrust={detail?.dataTrust}
        >
          <div className="grid gap-3 text-[12px] leading-[1.6] min-[900px]:grid-cols-2">
            <div className="rounded-[10px] border border-white/[0.07] bg-black/20 p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Persona thesis</div>
              <p className="mt-1.5 text-[#c8c8d0]">{analysis.thesis}</p>
            </div>
            <div className="rounded-[10px] border border-white/[0.07] bg-black/20 p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Action now</div>
              <p className="mt-1.5 text-[#c8c8d0]">{analysis.actionPlan}</p>
            </div>
            <div className="rounded-[10px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.035] p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#3ecf8e]">Why this Agent sees it this way</div>
              <ul className="mt-2 grid gap-1.5 text-[#bcbcc2]">{analysis.evidence.map((item, index) => <li key={index}>• {item}</li>)}</ul>
            </div>
            <div className="rounded-[10px] border border-[#f2575c]/20 bg-[#f2575c]/[0.035] p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#f2575c]">Risks</div>
              <ul className="mt-2 grid gap-1.5 text-[#bcbcc2]">{analysis.risks.map((item, index) => <li key={index}>• {item}</li>)}</ul>
            </div>
          </div>
          <div className="mt-3 rounded-[9px] border border-[#f5c451]/25 bg-[#f5c451]/[0.04] px-3.5 py-3 text-[11.5px] leading-[1.55] text-[#d5c28c]"><span className="mr-2 font-bold uppercase tracking-[0.06em] text-[#f5c451]">What changes the call</span>{analysis.changeTrigger}</div>
          {history.data?.length ? (
            <details className="mt-3 rounded-[9px] border border-white/[0.08] bg-black/20 px-3.5 py-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Decision history · why the AI changed its mind</summary>
              <ol className="mt-3 grid gap-3">
                {history.data.slice(0, 8).map((item) => (
                  <li key={item.runId} className="border-l-2 border-white/10 pl-3 text-[11px] leading-[1.5] text-[#bcbcc2]">
                    <div className="font-mono text-[10px] text-[#8c8c95]">{formatLocalDateTime(item.createdAt)} · {item.feature} · {item.decision.action}</div>
                    <div className="mt-1">{item.whyChanged}</div>
                    <div className="mt-1 font-mono text-[9px] text-[#5a5a62]">{item.model} · prompt {item.promptVersion}</div>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </AgentCall>
      ) : null}
    </div>
  );
}
