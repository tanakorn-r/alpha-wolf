import { AgentCall } from "../../components/agents/AgentCall";
import { useQuery } from "@tanstack/react-query";
import { PaywallGate } from "../../components/ui/PaywallGate";
import { colorForTone, toneFromSignal } from "./lib";
import { actionPositionFromSignal } from "../../lib/actionPosition";
import { agentLoadingTitle, agentName, PremiumLoading } from "./ui";
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
  const actionColor = analysis ? toneFromSignal(analysis.signal, colorForTone(analysis.tone)) : null;
  const actionTextColor = analysis?.tone === "good" ? "#9be7c5" : analysis?.tone === "bad" ? "#f2a4a7" : "#ececee";
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
      {analyst.loading ? <>
        <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "analyst", selectedTicker || "this stock")} subject={selectedTicker || "AI"} agentId={hunt.activeAgentId} task="analyst" />
        <div className="-mt-1 text-center text-[11px] text-[#8c8c95]">{analyst.stage === "market_data" ? "Reading stored market evidence…" : "Generating one concise Agent decision…"}</div>
      </> : null}

      {!analyst.loading && analysis && actionColor ? (
        <AgentCall
          agent={analysis.agent}
          label="Analyst decision"
          score={actionPositionFromSignal(analysis.signal, analysis.confidence, { tone: analysis.tone, actionScore: detail?.verdict?.score })}
          scoreLabel="Action position"
          scoreMode="action"
          scoreNote={analysis.confidence == null ? undefined : `Confidence ${analysis.confidence}/100`}
          signal={analysis.signal}
          headline={analysis.headline}
          summary={<span className="whitespace-pre-line">{analysis.recap || analysis.summary}</span>}
          accent={analysis.agent?.color ?? actionColor}
          meta={`${analysis.agentFitReason} · not financial advice`}
          onRerun={() => void analyst.run(undefined, true)}
          dataTrust={detail?.dataTrust}
        >
          <AgentVoiceCard agent={analysis.agent} fallbackName={agentName(hunt.activeAgentId)} thesis={analysis.thesis} actionPlan={analysis.actionPlan} accent={analysis.agent?.color ?? actionColor} actionColor={actionColor} actionTextColor={actionTextColor} />
          <div className="mt-3 grid gap-3 text-[12px] leading-[1.6] @min-[700px]:grid-cols-2">
            <div className="rounded-[10px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.035] p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#3ecf8e]">What I like</div>
              <div className="mt-2 grid gap-1.5">{analysis.evidence.map((item, index) => <ToneLine key={index} text={item} tone="good" />)}</div>
            </div>
            <div className="rounded-[10px] border border-[#f2575c]/20 bg-[#f2575c]/[0.035] p-3.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#f2575c]">What would worry me</div>
              <div className="mt-2 grid gap-1.5">{analysis.risks.map((item, index) => <ToneLine key={index} text={item} tone="bad" />)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-[9px] border border-[#f5c451]/25 bg-[#f5c451]/[0.04] px-3.5 py-3 text-[11.5px] leading-[1.55] text-[#d5c28c]"><span className="mr-2 font-bold uppercase tracking-[0.06em] text-[#f5c451]">What would change my mind</span>{analysis.changeTrigger}</div>
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

type SemanticTone = "good" | "bad" | "neutral";

const semanticTone = {
  good: { color: "#9be7c5", dot: "#3ecf8e" },
  bad: { color: "#f2a4a7", dot: "#f2575c" },
  neutral: { color: "#d7d7dc", dot: "#ececee" },
} as const;

function AgentVoiceCard({ agent, fallbackName, thesis, actionPlan, accent, actionColor, actionTextColor }: { agent?: { name: string; title: string; mono: string; avatarUrl?: string | null } | null; fallbackName: string; thesis: string; actionPlan: string; accent: string; actionColor: string; actionTextColor: string }) {
  const name = agent?.name ?? fallbackName;
  return (
    <section className="relative mt-4 overflow-hidden rounded-[11px] border p-4" style={{ borderColor: `${accent}45`, background: `linear-gradient(115deg,${accent}0c,rgba(10,10,12,.42) 45%)` }}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-[9px] border bg-black/20 font-mono text-[9px] font-black" style={{ borderColor: `${accent}66`, color: accent }}>{agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent?.mono ?? name.slice(0, 1)}</span>
        <div><div className="text-[11px] font-extrabold" style={{ color: accent }}>{name}</div><div className="text-[9px] text-[#777780]">{agent?.title ?? "Your Agent"} · my read</div></div>
      </div>
      <blockquote className="relative mt-3 pl-4 text-[13px] leading-[1.7] text-[#d7d7dc]">
        <span className="absolute -left-0.5 -top-2 font-serif text-[26px] leading-none opacity-45" style={{ color: accent }}>“</span>
        {thesis}
      </blockquote>
      <div className="mt-3 border-t pt-3" style={{ borderColor: `${accent}28` }}>
        <div className="text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: actionColor }}>Here&apos;s what I&apos;d do</div>
        <p className="mt-1 text-[12.5px] leading-[1.65]" style={{ color: actionTextColor }}>{actionPlan}</p>
      </div>
    </section>
  );
}

function ToneLine({ text, tone }: { text: string; tone: SemanticTone }) {
  const colors = semanticTone[tone];
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: colors.dot }} />
      <span style={{ color: colors.color }}>{text}</span>
    </div>
  );
}
