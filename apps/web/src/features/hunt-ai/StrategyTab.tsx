import type { StrategyPlaybookResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { STRAT_CARDS, clamp, colorForTone, formatAnalyzedAt } from "./lib";
import { StrategyIcon } from "../../components/ui/icons";
import { AgentCall } from "../../components/agents/AgentCall";
import { PaywallGate } from "../../components/ui/PaywallGate";
import { agentLoadingTitle, PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function StrategyTab({ hunt }: { hunt: HuntAi }) {
  const strategy = hunt.strategy;

  if (!hunt.premium) {
    return (
      <PaywallGate
        icon={<svg width="22" height="22" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.5 4L14 7l-4.5 1L8 12.5 6.5 8 2 7l4.5-1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" /></svg>}
        title="Strategy AI"
        description="Pick your strategy and AlphaWolf builds a custom playbook from your actual holdings — swing, day trade, long-term, value or FOMO."
        ctaLabel="Unlock Strategy AI — from $29/mo"
        onUnlock={hunt.unlockPremium}
      />
    );
  }

  const selected = STRAT_CARDS.find((c) => c.key === strategy.mode);

  return (
    <div className="flex flex-col gap-3">
      <div className={`${panel} p-3.5`}>
        <div className="mb-1.5 text-[12.5px] font-semibold">Strategy brief</div>
        <textarea
          value={strategy.prompt}
          onChange={(event) => strategy.setPrompt(event.target.value)}
          rows={2}
          placeholder="Optional: e.g. low-risk dividend stocks, aggressive AI momentum, undervalued compounders..."
          className="min-h-[58px] w-full resize-none rounded-[8px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2 text-[12.5px] leading-[1.45] text-[#ececee] outline-none focus:border-[#3ecf8e]"
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
              onClick={() => void strategy.run(card.key, Boolean(strategy.analysis && strategy.mode === card.key))}
              className="grid min-h-[108px] grid-rows-[28px_auto_1fr] gap-1.5 rounded-[10px] border p-3 text-left transition-colors disabled:opacity-60"
              style={{ background: isSelected ? `${card.color}10` : "#0e0e10", borderColor: isSelected ? card.color : "#2a2a31", borderWidth: isSelected ? 1.5 : 1 }}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px]" style={{ background: `${card.color}1e` }}>
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
        <div className={`${panel} px-4 py-4 text-center text-[12.5px] text-[#5a5a62]`}>
          Pick a strategy above — AlphaWolf builds the playbook for your holdings.
        </div>
      ) : null}
    </div>
  );
}

function PlaybookCard({ playbook, stratLabel, stratColor }: { playbook: StrategyPlaybookResponse; stratLabel: string; stratColor: string }) {
  const score = playbook.picks.length ? Math.round(playbook.picks.reduce((sum, pick) => sum + pick.conviction, 0) / playbook.picks.length) : null;
  return (
    <AgentCall agent={playbook.agent} label="Strategy agent" score={score} scoreLabel="average conviction" signal={stratLabel} headline={playbook.headline} summary={playbook.marketRead} accent={stratColor} meta={playbook.generatedAt ? `Generated ${formatAnalyzedAt(playbook.generatedAt)} · built for your holdings` : "Built for your holdings"} dataTrust={playbook.dataTrust}>
      <div className="mt-5 flex flex-col gap-2.5">
        <div className="grid gap-2.5">
          {playbook.picks.map((pick, index) => {
            const color = colorForTone(pick.tone);
            const aiScore = clamp(pick.conviction, 0, 100);
            return (
              <div key={pick.ticker} className="rounded-[10px] border border-[#1f1f24] bg-[#0e0e10] p-3">
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
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

                <div className="mb-2 text-[12px] font-semibold text-[#ececee]">{pick.subtitle}</div>
                <p className="mb-2.5 text-[12px] leading-[1.5] text-[#bcbcc2]">{pick.reason}</p>

                <div className="mb-2.5 flex flex-wrap gap-1.5">
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
      </div>
    </AgentCall>
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
