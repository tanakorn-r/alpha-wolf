import { AgentActionButton } from "../../components/agents/AgentActionButton";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StrategyIcon } from "../../components/ui/icons";
import type { AgentBadge, StrategyPick } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { STRAT_CARDS, colorForTone, type StratMode } from "./lib";
import type { HuntAi } from "./useHuntAi";

const AGENT_RECOMMENDED_STYLE: Record<string, StratMode> = {
  vera: "value",
  rex: "day",
  nadia: "swing",
  sam: "long",
  kai: "fomo",
  ben: "long",
  alphawolf: "swing",
};

export function TopFivePortal({ hunt, agent, onExplore }: { hunt: HuntAi; agent?: AgentBadge | null; onExplore: () => void }) {
  const strategy = hunt.strategy;
  const analysis = strategy.analysis;
  const selected = STRAT_CARDS.find((card) => card.key === strategy.mode) ?? STRAT_CARDS[2];
  const hasFive = strategy.candidateCount >= 5;
  const tokensAvailable = hunt.aiUsage.remaining > 0;
  const agentColor = agent?.color ?? "#3ecf8e";
  const recommendedMode = AGENT_RECOMMENDED_STYLE[agent?.id ?? ""] ?? "long";
  const savedOrder = strategy.picks.length === 5 && strategy.picks.every((pick, index) => strategy.shortlist[index] === pick.ticker);

  return (
    <section className="overflow-hidden rounded-[var(--aw-radius-card)] border shadow-[0_20px_60px_rgba(0,0,0,.2)]" style={{ borderColor: `${agentColor}55`, background: `radial-gradient(circle at 88% 0%,${agentColor}18,transparent 38%),linear-gradient(145deg,#171a1b,#111214)` }}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-[8px] border bg-black/20 font-mono text-[10px] font-black" style={{ borderColor: `${agentColor}66`, color: agentColor }}>{agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent?.mono ?? "AI"}</span>
          <div className="min-w-0"><h2 className="text-[19px] font-black tracking-[-0.35px]">Find my Top 5</h2><p className="mt-0.5 truncate text-[10.5px]" style={{ color: agentColor }}>{agent?.name ?? "Your Agent"}&apos;s ranked shortlist</p></div>
        </div>
      </div>

      <div className="p-4 min-[720px]:p-5">
        <div className="grid grid-cols-2 gap-2 min-[1450px]:grid-cols-3">
          {STRAT_CARDS.map((card) => {
            const active = strategy.mode === card.key;
            const recommended = recommendedMode === card.key;
            return (
              <button key={card.key} type="button" disabled={strategy.loading} onClick={() => strategy.selectMode(card.key)} className="flex items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left transition disabled:opacity-50" style={{ borderColor: active ? card.color : recommended ? `${agentColor}55` : "#2a2a31", background: active ? `${card.color}12` : recommended ? `${agentColor}09` : "#0e0e10" }}>
                <span className="grid h-6 w-6 flex-none place-items-center rounded-[6px]" style={{ background: `${card.color}18`, color: card.color }}><StrategyIcon kind={card.key} color={card.color} /></span>
                <span className="truncate text-[10px] font-bold text-[#ececee]">{card.label}</span>
                {recommended ? <span className="ml-auto flex-none text-[7px] font-extrabold uppercase tracking-[0.07em]" style={{ color: agentColor }}>Recommended</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[8px] border border-[#25252b] bg-[#0e0e10]/70 px-3 py-2 text-[9.5px] text-[#777780]">
          <span className="truncate">{marketLabels(strategy.preferredMarkets)} · {strategy.candidatesLoading ? "Loading stocks…" : `${strategy.candidateCount} stocks`}</span>
          <button type="button" onClick={onExplore} className="flex-none font-bold hover:brightness-125" style={{ color: agentColor }}>Explore →</button>
        </div>

        {strategy.loading ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-[9px] border bg-[#0e0e10] px-4 py-6 text-[11px] text-[#8c8c95]" style={{ borderColor: `${agentColor}44` }}><span style={{ color: agentColor }}><LoadingSpinner size={14} /></span>{agent?.name ?? "Your Agent"} is ranking {strategy.candidateCount} stocks…</div>
        ) : strategy.picks.length ? (
          <div className="mt-4">
            <div className="mb-3 border-l-2 pl-3" style={{ borderColor: agentColor }}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.09em]" style={{ color: agentColor }}>{agent?.name ?? "Agent"}&apos;s {selected.label} Top 5</div>
                <button type="button" onClick={savedOrder ? strategy.remove : strategy.save} disabled={strategy.saving || strategy.removing || strategy.picks.length !== 5} title={savedOrder ? "Remove this saved Top Five. Holdings and watchlist stocks stay unchanged." : "Save this Agent-ranked Top Five"} className="inline-flex h-7 flex-none items-center gap-1.5 rounded-[7px] border px-2.5 text-[9px] font-extrabold hover:brightness-125 disabled:opacity-55" style={{ borderColor: `${agentColor}66`, background: `${agentColor}12`, color: agentColor }}>{strategy.saving || strategy.removing ? <LoadingSpinner size={10} /> : null}{strategy.saving ? "Saving…" : strategy.removing ? "Removing…" : savedOrder ? "Remove saved" : "Save Top 5"}</button>
              </div>
              {analysis?.headline ? <div className="mt-1 line-clamp-2 text-[12px] font-bold leading-[1.45] text-[#d8d8dc]">{analysis.headline}</div> : null}
            </div>
            <div className="grid gap-2">
              {strategy.picks.map((pick, index) => (
                <RankedPick key={pick.ticker} pick={pick} index={index} agentColor={agentColor} onOpen={() => strategy.open(pick.ticker)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-[#2a2a31] bg-[#0e0e10]/80 px-3.5 py-3">
            <div className="text-[11px] font-bold text-[#bcbcc2]">{selected.label} · {strategy.candidatesLoading ? "loading" : `${strategy.candidateCount} candidates`}</div>
            <AgentActionButton agent={agent} fallbackName="Agent" label={!hunt.signedIn ? "Sign in to rank" : !tokensAvailable ? "No tokens" : "Rank Top 5"} sublabel="Agent ranking" disabled={hunt.signedIn && (!hasFive || !tokensAvailable || strategy.candidatesLoading)} onClick={() => void strategy.run(strategy.mode, false)} />
          </div>
        )}
      </div>
    </section>
  );
}

function RankedPick({ pick, index, agentColor, onOpen }: { pick: StrategyPick; index: number; agentColor: string; onOpen: () => void }) {
  const color = colorForTone(pick.tone);
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-2 rounded-[10px] border px-3 py-3" style={{ borderColor: `${agentColor}33`, background: `linear-gradient(100deg,${agentColor}0d,#0e0e10 30%)` }}>
      <div className="grid h-8 w-8 place-items-center rounded-[7px] border font-mono text-[11px] font-black" style={{ borderColor: `${agentColor}66`, background: `${agentColor}12`, color: agentColor }}>#{index + 1}</div>
      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[13px] font-bold text-[#ececee]">{pick.ticker}</span><span className="rounded-[5px] border px-2 py-0.5 text-[8.5px] font-bold" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{pick.action}</span><span className="font-mono text-[9px] font-bold" style={{ color }}>{pick.conviction}/100</span></div>
        <div className="mt-1 line-clamp-1 text-[10px] leading-[1.45] text-[#777780]">{pick.reason}</div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[8.5px] text-[#6f6f78]">{pick.entry != null ? <span>Entry {formatCurrency(pick.entry)}</span> : null}{pick.target != null ? <span>Target {formatCurrency(pick.target)}</span> : null}{pick.stop != null ? <span>Stop {formatCurrency(pick.stop)}</span> : null}{pick.riskReward ? <span>R/R {pick.riskReward}</span> : null}</div>
      </button>
    </div>
  );
}

function marketLabels(markets: string[]) {
  const labels: Record<string, string> = { us: "US", th: "Thailand", europe: "Europe", japan: "Japan", "hong-kong-china": "Hong Kong / China" };
  return markets.map((market) => labels[market] ?? market).join(" · ");
}
