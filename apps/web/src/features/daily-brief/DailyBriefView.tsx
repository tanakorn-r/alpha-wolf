import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AiVerdictCard } from "../../components/AiVerdictCard";
import { AgentByline } from "../../components/agents/AgentByline";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { loadAgents, type AgentBadge, type StockAnalysisResponse } from "../../lib/api";
import { formatCurrency, formatMoneyBaht, formatPercent } from "../../lib/format";
import { useWolfStore } from "../../store/useWolfStore";
import type { BriefFilter, BriefStatus, DailyBrief, HoldingBriefRow } from "./useDailyBrief";

const statusCopy: Record<BriefStatus, { label: string; countLabel: string; color: string }> = {
  needs_you: { label: "Needs you", countLabel: "NEED YOU", color: "#ff5f68" },
  watch: { label: "Watch", countLabel: "TO WATCH", color: "#f5c451" },
  hold: { label: "Just hold", countLabel: "JUST HOLD", color: "#3ecf8e" },
};

const filters: Array<{ key: BriefFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_you", label: "Needs you" },
  { key: "watch", label: "Watch" },
  { key: "hold", label: "Just hold" },
];

export function DailyBriefView({ brief }: { brief: DailyBrief }) {
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const [analystRun, setAnalystRun] = useState<{ row: HoldingBriefRow; runId: number } | null>(null);
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];

  if (brief.loading) return <LoadingPanel title="Building your Daily Brief..." body="Reading your holdings, live detail cards, and dividend calendar." />;
  if (brief.failed) return <RetryPanel label="Daily Brief could not load your portfolio." onRetry={brief.retry} />;

  return (
    <div className="flex flex-col gap-3.5">
      <AskAgentBrief
        brief={brief}
        agent={activeAgent}
      />

      {analystRun ? <AnalystBriefPanel key={`${analystRun.row.symbol}-${analystRun.runId}`} row={analystRun.row} agent={activeAgent} onClose={() => setAnalystRun(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full gap-2 overflow-x-auto pb-1 min-[720px]:w-auto min-[720px]:overflow-visible min-[720px]:pb-0">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => brief.setFilter(item.key)}
              className={`flex-none rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold transition ${brief.filter === item.key ? "text-[#ececee]" : "border-[#2a2a31] bg-[#141416] text-[#8c8c95] hover:text-[#ececee]"}`}
              style={brief.filter === item.key ? { borderColor: activeAgent?.color ?? "#3ecf8e", background: `${activeAgent?.color ?? "#3ecf8e"}14` } : undefined}
            >
              <span>{item.label}</span>
              <span className="ml-2 font-mono text-[12px] text-[#6f6f78]">{brief.counts[item.key]}</span>
            </button>
          ))}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 min-[620px]:flex min-[620px]:w-auto min-[620px]:flex-wrap">
          <Meta label="Portfolio" value={formatMoneyBaht(brief.stats?.totalValue)} />
          <Meta label="P/L" value={`${brief.totalPl >= 0 ? "+" : "-"}${formatMoneyBaht(Math.abs(brief.totalPl))}`} color={brief.totalPl >= 0 ? "#3ecf8e" : "#ff5f68"} />
        </div>
      </div>

      <section className="grid gap-2.5">
        {brief.visibleRows.length ? brief.visibleRows.map((row) => (
          <BriefQueueRow
            key={row.symbol}
            row={row}
            agent={activeAgent}
            analystActive={analystRun?.row.symbol === row.symbol}
            onAnalyze={() => setAnalystRun((current) => ({ row, runId: current?.row.symbol === row.symbol ? current.runId + 1 : 1 }))}
          />
        )) : (
          <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-5 py-8 text-center text-[13px] text-[#8c8c95]">No holdings in this filter.</div>
        )}
      </section>
    </div>
  );
}

function AskAgentBrief({ brief, agent }: { brief: DailyBrief; agent?: AgentBadge | null }) {
  const color = agent?.color ?? "#3ecf8e";
  const lead = brief.rows[0];
  const note = guruBriefThought(brief, agent);
  return (
    <section
      className="relative overflow-hidden rounded-[10px] border px-4 py-4 shadow-[0_18px_54px_rgba(0,0,0,0.28)] min-[900px]:px-5"
      style={{
        borderColor: `${color}55`,
        background: `radial-gradient(circle at 5% 0%, ${color}20, transparent 34%), linear-gradient(135deg, ${color}10, rgba(18,18,22,0.93) 54%, rgba(14,14,16,0.98))`,
        boxShadow: `0 0 0 1px ${color}14 inset, 0 18px 54px rgba(0,0,0,0.32), 0 0 46px ${color}10`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="grid gap-4 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <AgentByline agent={agent} label="Ask the desk" className="mb-3" />
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#777780]">What do you recommend for me today?</div>
          <h2 className="mt-2 max-w-[780px] text-[24px] font-extrabold leading-tight text-[#ececee] min-[900px]:text-[30px]">
            {lead ? todayHeadline(brief, lead) : "Build the portfolio, then ask for the day."}
          </h2>
          <p className="mt-3 max-w-[880px] text-[14px] font-medium leading-[1.65] text-[#d8d8dd]">{note}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SmallStat label="Action" value={brief.counts.needs_you} color={statusCopy.needs_you.color} />
            <SmallStat label="Watch" value={brief.counts.watch} color={statusCopy.watch.color} />
            <SmallStat label="Hold" value={brief.counts.hold} color={statusCopy.hold.color} />
          </div>
        </div>
        {lead ? (
          <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10]/82 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f6f78]">Today&apos;s move</div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-[20px] font-bold text-[#ececee]">{lead.symbol}</span>
                  <span className="rounded-[7px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: statusCopy[lead.status].color, background: `${statusCopy[lead.status].color}18` }}>{lead.actionLabel}</span>
                </div>
                <p className="mt-2 text-[13px] font-semibold leading-[1.45] text-[#d8d8dd]">{primaryInstruction(lead)}</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-[30px] font-bold leading-none text-[#ececee]">{lead.rating}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f6f78]">AI rating</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8c8c95]">
              <span>{formatCurrency(lead.price, lead.currency ?? "USD")}</span>
              <span className={lead.todayPct >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{formatPercent(lead.todayPct)} today</span>
              <span>{formatMoneyBaht(lead.value)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnalystBriefPanel({ row, agent, onClose }: { row: HoldingBriefRow; agent?: AgentBadge | null; onClose: () => void }) {
  const analysis = buildBriefAnalysis(row, agent);
  return (
    <section className="relative">
      <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 rounded-[7px] border border-[#2a2a31] bg-[#0e0e10]/90 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8c8c95] hover:text-[#ececee]">
        Close
      </button>
      <AiVerdictCard value={analysis} size="panel" currency={row.currency ?? "USD"} accent="agent" bylineLabel="Daily brief analyst" showSignoff={false} />
    </section>
  );
}

function BriefQueueRow({ row, agent, analystActive, onAnalyze }: { row: HoldingBriefRow; agent?: AgentBadge | null; analystActive?: boolean; onAnalyze: () => void }) {
  const status = statusCopy[row.status];
  return (
    <article className="grid gap-3 rounded-[10px] border border-[#26262c] bg-[#151518] p-3.5 min-[820px]:grid-cols-[180px_minmax(0,1fr)_172px] min-[820px]:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[18px] font-bold text-[#ececee]">{row.symbol}</span>
          <span className="min-w-0 truncate text-[12px] text-[#8c8c95]">{row.name}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-[7px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: status.color, background: `${status.color}18` }}>{status.label}</span>
          <span className="font-mono text-[12px] text-[#bcbcc2]">{formatCurrency(row.price, row.currency ?? "USD")}</span>
          <span className={row.todayPct >= 0 ? "text-[12px] text-[#3ecf8e]" : "text-[12px] text-[#ff5f68]"}>{formatPercent(row.todayPct)}</span>
        </div>
        <Sparkline points={row.history.map((point) => point.close)} tone={row.todayPct >= 0 ? "good" : "bad"} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-bold leading-tight text-[#ececee]">{row.actionLabel}: {row.headline}</div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-[#9b9ba3]">{agentRowInsight(row, agent)}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#777780]">
          <span>{formatShares(row.shares)} sh</span>
          <span className={row.gainLoss >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{row.gainLoss >= 0 ? "+" : "-"}{formatMoneyBaht(Math.abs(row.gainLoss))}</span>
          <span>{row.yieldPct != null ? `Yield ${row.yieldPct.toFixed(2)}%` : "No yield read"}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 min-[820px]:justify-end">
        <div className="text-right">
          <div className="font-mono text-[22px] font-bold leading-none text-[#ececee]">{row.rating}</div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">rating</div>
        </div>
        <PremiumAiButton label={analystActive ? "Refresh" : "Analyze"} sublabel="Analyst" onClick={onAnalyze} size="xs" className="flex-none" />
      </div>
    </article>
  );
}

function Sparkline({ points, tone }: { points: number[]; tone: "good" | "bad" }) {
  const values = points.filter((value) => Number.isFinite(value)).slice(-56);
  if (values.length < 2) return <div className="mt-3 h-8 max-w-[190px] rounded-[7px] border border-[#24242a] bg-[#101012]" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 22;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  const color = tone === "good" ? "#3ecf8e" : "#ff5f68";
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-8 w-full max-w-[190px] overflow-visible rounded-[7px] border border-[#24242a] bg-[#101012]">
      <path d={`${path} L 100 32 L 0 32 Z`} fill={color} opacity="0.1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[#24242a] bg-[#0e0e10]/70 px-2.5 py-1.5">
      <span className="font-mono text-[15px] font-bold leading-none" style={{ color }}>{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#6f6f78]">{label}</span>
    </div>
  );
}

function todayHeadline(brief: DailyBrief, lead: HoldingBriefRow) {
  if (brief.counts.needs_you) return `Act on ${lead.symbol}. Let the rest wait.`;
  if (brief.counts.watch) return `Watch ${lead.symbol}. Do not force a trade.`;
  return `Hold steady. No cash needs to move.`;
}

function guruBriefThought(brief: DailyBrief, agent?: AgentBadge | null) {
  if (!brief.rows.length) return "A good portfolio starts quiet: define what you own, why you own it, and the price that would change your mind. Then the brief can judge the day for you.";
  const lead = brief.rows[0];
  if (agent?.id === "kai") return brief.counts.needs_you ? `${lead.symbol} is the only name asking for your attention. Do the check, keep the exit honest, and do not let one alert turn into ten random taps.` : `Today is a patience day. Keep ${lead.symbol} on the screen, but make the market earn your click.`;
  if (agent?.id === "rex") return brief.counts.needs_you ? `The tape points first to ${lead.symbol}. Decide there, size from the stop, and leave the sleepy positions alone.` : `No tape pressure. Watch ${lead.symbol}, but a clean no-trade is still a decision.`;
  if (agent?.id === "vera") return brief.counts.needs_you ? `${lead.symbol} is the only conversation worth having first. Start there, ask what would make you wrong, and let the answer decide the size.` : `The wise move today is restraint. Keep ${lead.symbol} under watch, but do not spend cash just because the screen is open.`;
  if (agent?.id === "nadia") return `${lead.symbol} ranks highest at ${lead.rating}/100. The portfolio has ${brief.counts.needs_you} action item, ${brief.counts.watch} monitor, and ${brief.counts.hold} passive hold; act only where the evidence changes the expected value.`;
  if (agent?.id === "sam") return brief.counts.needs_you ? `Begin with ${lead.symbol}, but judge it through downside and income durability. Cash is patient; dividends and risk rules are not.` : `This is a compounding day. Let the holdings work, and revisit ${lead.symbol} only if the entry becomes kinder.`;
  if (agent?.id === "ben") return `Think like an owner today: ${lead.symbol} deserves the first read, but price is only useful when the business and margin of safety agree.`;
  if (agent?.id === "alphawolf") return `The desk read is ${lead.symbol} first. Weigh price, structure, timing, income, and risk together; the best move may still be restraint.`;
  return brief.summary;
}

function primaryInstruction(row: HoldingBriefRow) {
  const read = shortRead(row.whatToDo);
  if (row.status === "needs_you") return `${read} Confirm the trigger, then either act cleanly or stand down.`;
  if (row.status === "watch") return `${read} Keep it on watch; no need to add cash until the setup improves.`;
  return `${read} Let this position sit unless the thesis or risk line changes.`;
}

function shortRead(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "The signal is incomplete.";
  if (trimmed.length <= 24 && !/[.!?]$/.test(trimmed)) return `The read is ${trimmed}.`;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function agentRowInsight(row: HoldingBriefRow, agent?: AgentBadge | null) {
  if (agent?.id === "kai") return row.status === "needs_you" ? `This is the one to check now. If the setup is not clean, do not force the entry.` : `Keep it on the list, but no need to chase this candle.`;
  if (agent?.id === "rex") return row.actionTone === "good" ? `Momentum is usable, but size small and define the exit before buying.` : `I would wait for tape confirmation before touching it.`;
  if (agent?.id === "nadia") return `Rating ${row.rating}/100, status ${statusCopy[row.status].label.toLowerCase()}. The data says ${row.actionLabel.toLowerCase()}, not guesswork.`;
  if (agent?.id === "sam") return row.yieldPct ? `Yield is ${row.yieldPct.toFixed(2)}%; add only if the income stream and entry both stay healthy.` : `No income edge shown, so patience beats activity here.`;
  if (agent?.id === "ben") return `Treat this like a business decision. Price only matters if the structure and margin of safety are good enough.`;
  if (agent?.id === "alphawolf") return `Check price, structure, timing, income, and risk together before making the move.`;
  return row.whatToDo;
}

function dailyBriefAnalystRead(row: HoldingBriefRow, agent?: AgentBadge | null) {
  const action = portfolioAction(row);
  const position = row.shares > 0 ? `You already hold ${formatShares(row.shares)} shares worth ${formatMoneyBaht(row.value)}` : "You do not hold this yet";
  const risk = row.sellTrigger.title.toLowerCase();
  const entry = row.nextMove.title.toLowerCase();
  if (agent?.id === "sam") return `${position}. My call is ${action.label.toLowerCase()}: protect the income stream, do not add unless the entry improves, and use ${risk} as the line that changes the decision.`;
  if (agent?.id === "nadia") return `${position}. The portfolio action is ${action.label.toLowerCase()}, not merely watch. Rating is ${row.rating}/100; entry frame is ${entry}, and the risk line is ${risk}.`;
  if (agent?.id === "rex") return `${position}. ${action.label} is the trade instruction: keep risk defined, avoid averaging up blindly, and only press if price behavior confirms the setup.`;
  if (agent?.id === "kai") return `${position}. ${action.label} is the clean move today. If the chart does not give a cleaner entry, keep your hands off the buy button.`;
  if (agent?.id === "ben") return `${position}. Owner answer: ${action.label.toLowerCase()}. Price only matters if ${entry} remains believable and ${risk} does not break.`;
  return `${position}. The Daily Brief action is ${action.label.toLowerCase()}: ${action.reason}`;
}

function buildBriefAnalysis(row: HoldingBriefRow, agent?: AgentBadge | null): StockAnalysisResponse {
  const action = portfolioAction(row);
  return {
    signal: action.label,
    headline: `${action.label}: ${action.headline}`,
    tone: action.tone,
    confidence: row.rating,
    summary: dailyBriefAnalystRead(row, agent),
    scores: [],
    bullets: [
      `Position: ${row.shares > 0 ? `You hold ${formatShares(row.shares)} shares, ${formatMoneyBaht(row.value)} current value, ${row.gainLoss >= 0 ? "+" : "-"}${formatMoneyBaht(Math.abs(row.gainLoss))} P/L.` : "You do not hold this stock yet."}`,
      `Action: ${action.reason}`,
      `${row.nextMove.label}: ${row.nextMove.title}. ${row.nextMove.body}`,
      `${row.sellTrigger.label}: ${row.sellTrigger.title}. ${row.sellTrigger.body}`,
    ],
    agent,
    recap: null,
    agentFit: null,
    agentFitReason: null,
  };
}

function portfolioAction(row: HoldingBriefRow): { label: string; headline: string; reason: string; tone: StockAnalysisResponse["tone"] } {
  const owns = row.shares > 0;
  const label = row.actionLabel.toLowerCase();
  if (row.sellTrigger.tone === "bad" || label.includes("review risk")) {
    return {
      label: owns ? "SELL / REDUCE" : "DO NOT BUY",
      headline: owns ? `Reduce ${row.symbol} until the risk line is repaired.` : `${row.symbol} has a broken risk line.`,
      reason: owns ? "Price is already through the risk trigger, so protect capital before thinking about upside." : "The chart is below the risk trigger, so this is not a clean entry.",
      tone: "bad",
    };
  }
  if (label.includes("buy more") || label.includes("apply plan")) {
    return {
      label: owns ? "BUY MORE" : "BUY",
      headline: owns ? `Add to ${row.symbol} only inside the planned size.` : `${row.symbol} is actionable, but size it from risk.`,
      reason: owns ? "You already own it, and the brief shows an add/plan signal. Add only the planned amount, not a random chase." : "The brief has a buy signal, but it still needs risk-defined sizing.",
      tone: "good",
    };
  }
  if (label.includes("wait setup")) {
    return {
      label: owns ? "HOLD, WAIT TO ADD" : "WAIT TO BUY",
      headline: owns ? `Hold ${row.symbol}; wait for a cleaner add point.` : `Wait for ${row.symbol} to complete the setup.`,
      reason: owns ? "The setup is not clean enough to add cash, but there is no sell trigger yet." : "The setup is forming, but the entry is not confirmed.",
      tone: "warn",
    };
  }
  if (row.status === "hold") {
    return {
      label: owns ? "HOLD" : "WAIT",
      headline: owns ? `Hold ${row.symbol}; no portfolio action needed today.` : `Wait on ${row.symbol}; no entry required today.`,
      reason: owns ? "You hold the position and the brief does not show a cash-add or sell trigger." : "There is no portfolio position and no immediate buy trigger.",
      tone: "good",
    };
  }
  return {
    label: owns ? "HOLD, DO NOT ADD" : "WAIT",
    headline: owns ? `Hold ${row.symbol}; do not add cash yet.` : `Wait on ${row.symbol}; no buy today.`,
    reason: owns ? "You already hold this stock. The queue says monitor, but the portfolio action is to keep the current position and wait for better evidence before adding." : "The stock is worth monitoring, but not buying yet.",
    tone: "warn",
  };
}

function Meta({ label, value, color = "#ececee" }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0 items-center gap-2 rounded-[8px] border border-[#26262c] bg-[#121214] px-3 py-1.5 min-[560px]:flex">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f6f78]">{label}</span>
      <span className="block truncate font-mono text-[12px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function formatShares(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
