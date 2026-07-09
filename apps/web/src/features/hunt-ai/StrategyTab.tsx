import type { StrategyPlaybookResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { STRAT_CARDS, clamp, colorForTone, formatAnalyzedAt } from "./lib";
import { StrategyIcon } from "../../components/ui/icons";
import { AgentByline, AgentSignoff } from "../../components/agents/AgentByline";
import { agentLoadingTitle, PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function StrategyTab({ hunt }: { hunt: HuntAi }) {
  const strategy = hunt.strategy;

  if (!hunt.premium) {
    return (
      <div className="rounded-2xl p-[2px]" style={{ background: "linear-gradient(135deg,#3ecf8e,#4d96ff,#c77dff,#3ecf8e)", backgroundSize: "300% 300%" }}>
        <div className="flex flex-col items-center gap-5 rounded-[14px] bg-[#0a0c0f] px-10 py-12 text-center">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] border border-[#3ecf8e]/30 bg-gradient-to-br from-[#3ecf8e]/10 to-[#c77dff]/10">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.5 4L14 7l-4.5 1L8 12.5 6.5 8 2 7l4.5-1.5L8 1.5z" stroke="url(#sLkG)" strokeWidth="1.4"/><defs><linearGradient id="sLkG" x1="0" y1="0" x2="16" y2="16"><stop offset="0%" stopColor="#3ecf8e"/><stop offset="100%" stopColor="#c77dff"/></linearGradient></defs></svg>
          </div>
          <div>
            <div className="aw-rainbow-text mb-[9px] text-[22px] font-bold">Strategy AI</div>
            <div className="mx-auto max-w-[400px] text-[13px] leading-[1.7] text-[#8c8c95]">Pick your strategy and AlphaWolf builds a custom playbook from your actual holdings — swing, day trade, long-term, value or FOMO.</div>
          </div>
          <button type="button" onClick={hunt.unlockPremium} className="flex items-center gap-[9px] rounded-[11px] px-8 py-3 text-[14px] font-bold text-white hover:opacity-90" style={{ background: "linear-gradient(135deg,#3ecf8e,#4d96ff,#c77dff)" }}>
            Unlock Strategy AI — from $29/mo
          </button>
        </div>
      </div>
    );
  }

  const selected = STRAT_CARDS.find((c) => c.key === strategy.mode);

  return (
    <div className="flex flex-col gap-4">
      <div className={`${panel} p-4`}>
        <div className="mb-2 text-[13px] font-semibold">Strategy brief</div>
        <textarea
          value={strategy.prompt}
          onChange={(event) => strategy.setPrompt(event.target.value)}
          rows={3}
          placeholder="Optional: e.g. low-risk dividend stocks, aggressive AI momentum, undervalued compounders..."
          className="min-h-[84px] w-full resize-none rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 text-[13px] leading-[1.5] text-[#ececee] outline-none focus:border-[#3ecf8e]"
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 min-[560px]:grid-cols-2 min-[900px]:grid-cols-5">
        {STRAT_CARDS.map((card) => {
          const isSelected = strategy.mode === card.key;
          return (
            <button
              key={card.key}
              type="button"
              disabled={strategy.loading}
              onClick={() => void strategy.run(card.key)}
              className="grid min-h-[132px] grid-rows-[32px_auto_1fr] gap-2 rounded-[11px] border p-4 text-left transition-colors disabled:opacity-60"
              style={{ background: isSelected ? `${card.color}10` : "#0e0e10", borderColor: isSelected ? card.color : "#2a2a31", borderWidth: isSelected ? 1.5 : 1 }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ background: `${card.color}1e` }}>
                <StrategyIcon kind={card.key} color={card.color} />
              </div>
              <div className="self-end text-[12px] font-bold text-[#ececee]">{card.label}</div>
              <div className="text-[11px] leading-[1.4] text-[#8c8c95]">{card.subtitle}</div>
            </button>
          );
        })}
      </div>

      {strategy.loading ? <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "strategy", selected?.label ?? "strategy")} subject="AI" agentId={hunt.activeAgentId} task="strategy" /> : null}

      {!strategy.loading && strategy.analysis && selected ? (
        <PlaybookCard playbook={strategy.analysis} stratLabel={selected.label} stratColor={selected.color} />
      ) : null}

      {!strategy.loading && !strategy.mode ? (
        <div className={`${panel} px-8 py-8 text-center text-[13px] text-[#5a5a62]`}>
          Pick a strategy above — AlphaWolf builds the playbook for your holdings.
        </div>
      ) : null}
    </div>
  );
}

function PlaybookCard({ playbook, stratLabel, stratColor }: { playbook: StrategyPlaybookResponse; stratLabel: string; stratColor: string }) {
  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="px-[18px] py-[14px]" style={{ background: `linear-gradient(90deg,${stratColor}22,transparent)`, borderBottom: `1px solid ${stratColor}33` }}>
        <AgentByline agent={playbook.agent} label="Strategy agent" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[14px] font-bold">{stratLabel} Top 5</div>
          <span className="rounded-[5px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 px-[7px] py-[2px] text-[10px] font-bold text-[#3ecf8e]">AI-BUILT FOR YOUR HOLDINGS</span>
          {playbook.generatedAt ? (
            <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">Last sync {formatAnalyzedAt(playbook.generatedAt)}</span>
          ) : null}
        </div>
        <div className="mt-2 text-[12px] leading-[1.55] text-[#bcbcc2]">{playbook.headline}</div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-[10px] border border-[#252529] bg-[#0e0e10] px-4 py-3 text-[12.5px] leading-[1.55] text-[#8c8c95]">{playbook.marketRead}</div>
        <div className="grid gap-3">
          {playbook.picks.map((pick, index) => {
            const color = colorForTone(pick.tone);
            const aiScore = clamp(pick.conviction, 0, 100);
            return (
              <div key={pick.ticker} className="rounded-[11px] border border-[#1f1f24] bg-[#0e0e10] p-[18px]">
                <div className="mb-[11px] flex flex-wrap items-center gap-[10px]">
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-[#161619] font-mono text-[12px] font-bold" style={{ color }}>{index + 1}</div>
                  <div className="min-w-[96px]">
                    <div className="font-mono text-[16px] font-bold leading-none">{pick.ticker}</div>
                    <div className="mt-[2px] max-w-[240px] truncate text-[10px] text-[#5a5a62]">{pick.name}</div>
                  </div>
                  <span className="rounded-[5px] border px-[9px] py-[3px] text-[10px] font-bold" style={{ background: `${color}18`, color, borderColor: `${color}55` }}>{pick.action}</span>
                  {pick.upsidePct != null ? (
                    <div className="ml-auto text-right">
                      <div className="font-mono text-[19px] font-bold leading-none" style={{ color }}>{pick.upsidePct >= 0 ? "+" : ""}{pick.upsidePct.toFixed(1)}%</div>
                      <div className="mt-[2px] text-[9px] uppercase tracking-[0.3px] text-[#5a5a62]">implied upside</div>
                    </div>
                  ) : null}
                </div>

                <div className="mb-[9px] text-[12px] font-semibold text-[#ececee]">{pick.subtitle}</div>
                <p className="mb-[11px] text-[12.5px] leading-[1.6] text-[#bcbcc2]">{pick.reason}</p>

                <div className="mb-[11px] flex flex-wrap gap-[7px]">
                  {pick.entry != null ? <PlaybookMetric label="Entry" value={formatCurrency(pick.entry)} color="#f5c451" /> : null}
                  {pick.target != null ? <PlaybookMetric label="Target" value={formatCurrency(pick.target)} color="#3ecf8e" /> : null}
                  {pick.stop != null ? <PlaybookMetric label="Stop" value={formatCurrency(pick.stop)} color="#f2575c" /> : null}
                  {pick.riskReward ? <PlaybookMetric label="R/R" value={pick.riskReward} /> : null}
                </div>

                <div>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[9.5px] uppercase tracking-[0.4px] text-[#5a5a62]">AI score</span>
                    <span className="font-mono text-[13px] font-bold" style={{ color }}>{aiScore}%</span>
                  </div>
                  <div className="h-[4px] overflow-hidden rounded-[3px] bg-[#1a1a1f]">
                    <div className="h-full rounded-[3px]" style={{ width: `${aiScore}%`, background: color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <AgentSignoff agent={playbook.agent} />
      </div>
    </div>
  );
}

function PlaybookMetric({ label, value, color = "#ececee" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-[5px] rounded-[7px] border border-[#252529] bg-[#161619] px-[11px] py-[6px]">
      <span className="text-[9px] uppercase tracking-[0.3px] text-[#5a5a62]">{label}</span>
      <span className="font-mono text-[12.5px] font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}
