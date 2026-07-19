import { AgentActionButton } from "../../components/agents/AgentActionButton";
import { ArrowUpIcon } from "../../components/ui/icons";
import { RetryPanel, TickerEmptyPanel } from "../../components/ui/panels";
import { PaywallGate } from "../../components/ui/PaywallGate";
import { realTimeframes, timeframes, type N100Timeframe } from "./lib";
import { Next100Result } from "./Next100Result";
import { agentLoadingTitle, agentName, PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function Next100Tab({ hunt }: { hunt: HuntAi }) {
  const n100 = hunt.next100;
  if (!n100.ticker) return <TickerEmptyPanel body="Add or select an asset in the Hunt watchlist above to open Next 10." />;

  if (!hunt.premium) {
    return (
      <PaywallGate
        icon={<><ArrowUpIcon size={20} /><span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#c77dff]/50 bg-[#0a0c0f] text-[10px] text-[#c77dff]">L</span></>}
        title="Next 10 ↑"
        description="Premium AI forecast for the next 10 technical moves. No mock prediction is shown until the feature is unlocked and the API returns real data."
        ctaLabel="Unlock Next 10 ↑"
        onUnlock={hunt.unlockPremium}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`${panel} flex items-center gap-1.5 rounded-[8px] px-3 py-1.5`}>
          <span className="text-[11px] text-[#5a5a62]">Stock</span>
          <span className="font-mono text-[13px] font-bold">{n100.ticker}</span>
          <span className="text-[10px] text-[#5a5a62]">- pick from watchlist above</span>
        </div>
        <div className="flex gap-[3px] rounded-[8px] border border-[#2a2a31] bg-[#161619] p-[3px]">
          {timeframes.map((tf) => {
            const enabled = realTimeframes.has(tf);
            const active = n100.timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                disabled={!enabled}
                title={enabled ? undefined : "Only 1D and 1W are backed by the current API"}
                onClick={() => { if (enabled) n100.setTimeframe(tf as N100Timeframe); }}
                className={`rounded-[6px] px-[10px] py-1.5 font-mono text-[11.5px] ${!enabled ? "cursor-not-allowed text-[#3a3a40]" : active ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95] hover:text-[#ececee]"}`}
              >
                {tf}
              </button>
            );
          })}
        </div>
        <QuotaPill used={n100.quotaUsed} limit={n100.quotaLimit} />
      </div>

      {!n100.report?.data && !n100.fetching ? (
        <div className="flex flex-col items-center gap-3.5 rounded-[10px] border border-[#2a2a31] bg-gradient-to-b from-[#0f1116] to-[#0d0f12] px-5 py-6 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-[11px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/10"><ArrowUpIcon size={21} /></div>
          <div>
            <div className="mb-1.5 text-[16px] font-bold">Ready · <span className="font-mono text-[#3ecf8e]">{n100.ticker}</span> · <span className="font-mono text-[#74a4ff]">{n100.timeframe}</span></div>
            <div className="mx-auto max-w-[460px] text-[12.5px] leading-[1.6] text-[#8c8c95]">AI scans momentum, recent history and technical context, then maps the next 10 moves for this ticker/timeframe.</div>
          </div>
          <AgentActionButton
            fallbackName={agentName(hunt.activeAgentId)}
            label={n100.quotaLeft <= 0 ? "AI tokens used up" : "Forecast Next 10 ↑"}
            sublabel="Forecast path"
            disabled={n100.quotaLeft <= 0}
            onClick={n100.run}
          />
        </div>
      ) : null}
      {n100.fetching ? <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "forecast", n100.ticker)} subject={n100.ticker} agentId={hunt.activeAgentId} task="forecast" /> : null}
      {n100.error ? <RetryPanel label={n100.error} onRetry={n100.rerun} /> : null}
      {!n100.fetching && n100.report?.data ? (
        <Next100Result
          report={n100.report.data}
          timeframe={n100.timeframe}
          onRerun={n100.rerun}
          canRerun={n100.quotaLeft > 0 && !n100.fetching}
          analyzedAt={n100.report.analyzedAt}
        />
      ) : null}
    </div>
  );
}

function QuotaPill({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return (
    <div className="ml-auto flex items-center gap-2 rounded-[8px] border border-[#2a2a31] bg-[#161619] px-3 py-1.5 text-[11px] text-[#8c8c95]">
      <span className="font-mono font-semibold" style={{ color: pct > 80 ? "#f2575c" : "#3ecf8e" }}>{used}</span>
      <span>/ {limit} tokens acquired</span>
      <div className="h-1 w-[54px] overflow-hidden rounded-full bg-[#0e0e10]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 80 ? "#f2575c" : "#3ecf8e" }} />
      </div>
    </div>
  );
}
