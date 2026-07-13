import { useState } from "react";
import { AgentCall } from "../../components/agents/AgentCall";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { ErrorCard, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { PillTabs } from "../../components/ui/PillTabs";
import { TagPill } from "../../components/ui/Badge";
import { Ring } from "../../lib/ring";
import type { TodayPerformanceResponse } from "../../lib/api";
import { formatCurrency, formatMoneyBaht, formatPercent } from "../../lib/format";
import { agentLoadingTitle, PremiumLoading } from "../hunt-ai/ui";
import type { BriefFilter, BriefStatus, BriefTone, DailyBrief, HoldingBriefRow } from "./useDailyBrief";

const TRIAGE_COPY: Record<BriefStatus, { label: string; color: string }> = {
  hold: { label: "Chill", color: "#3ecf8e" },
  watch: { label: "Watch", color: "#f5c451" },
  needs_you: { label: "Sell", color: "#ff5f68" },
};

const filters: Array<{ key: BriefFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_you", label: "Sell" },
  { key: "watch", label: "Watch" },
  { key: "hold", label: "Chill" },
];

export function DailyBriefView({ brief }: { brief: DailyBrief }) {
  if (brief.loading) return <LoadingPanel title="Building your Daily Brief..." body="Reading your holdings, live detail cards, and dividend calendar." />;
  if (brief.failed) return <RetryPanel label="Daily Brief could not load your portfolio." onRetry={brief.retry} />;

  return (
    <div className="flex flex-col gap-3.5">
      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-5">
        <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">Your holdings today</div>
        <h2 className="mt-1 text-lg font-semibold">{brief.rows.length ? triageHeadline(brief) : "Add holdings to get a daily read"}</h2>
        <p className="mt-1 max-w-[560px] text-sm text-[#8c8c95]">{brief.summary}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillTabs
          value={brief.filter}
          onChange={brief.setFilter}
          className="w-full min-[720px]:w-auto"
          options={filters.map((item) => ({ value: item.key, label: `${item.label} (${brief.counts[item.key]})` }))}
        />
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
            agentId={brief.activeAgentId}
            state={brief.rowAnalysis[row.symbol]}
            onOpen={() => void brief.analyzeRow(row)}
          />
        )) : (
          <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-5 py-8 text-center text-[13px] text-[#8c8c95]">No holdings in this filter.</div>
        )}
      </section>
    </div>
  );
}

function triageTag(row: HoldingBriefRow): { label: string; color: string } {
  if (row.status !== "needs_you") return TRIAGE_COPY[row.status];
  // The "needs_you" bucket also covers buy-more/dividend-deadline cases for a held
  // position, not only risk triggers — only label it "Sell" when it actually is one.
  return row.actionTone === "bad" ? TRIAGE_COPY.needs_you : { label: row.actionLabel, color: "#f5c451" };
}

function triageHeadline(brief: DailyBrief) {
  if (brief.counts.needs_you) return `${brief.counts.needs_you} position${brief.counts.needs_you === 1 ? "" : "s"} need${brief.counts.needs_you === 1 ? "s" : ""} a decision today.`;
  if (brief.counts.watch) return `Nothing urgent — keep an eye on ${brief.counts.watch} position${brief.counts.watch === 1 ? "" : "s"}.`;
  return "You're clear to chill — nothing needs you today.";
}

function BriefQueueRow({
  row,
  agentId,
  state,
  onOpen,
}: {
  row: HoldingBriefRow;
  agentId: string;
  state?: DailyBrief["rowAnalysis"][string];
  onOpen: () => void;
}) {
  const tag = triageTag(row);
  const hasResult = Boolean(state?.data);
  const [open, setOpen] = useState(false);
  const aiScore = state?.data?.buyScore;
  const aiTone = state?.data?.tone;

  function runAnalysis() {
    setOpen(true);
    onOpen();
  }

  return (
    <div className="flex flex-col gap-2">
      <article className="grid gap-3 rounded-[10px] border border-[#26262c] bg-[#151518] p-3.5 min-[820px]:grid-cols-[180px_minmax(0,1fr)_200px] min-[820px]:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[18px] font-bold text-[#ececee]">{row.symbol}</span>
            <span className="min-w-0 truncate text-[12px] text-[#8c8c95]">{row.name}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TagPill label={tag.label} color={tag.color} />
            <span className="font-mono text-[12px] text-[#bcbcc2]">{formatCurrency(row.price, row.currency ?? "USD")}</span>
            <span className={row.todayPct >= 0 ? "text-[12px] text-[#3ecf8e]" : "text-[12px] text-[#ff5f68]"}>{formatPercent(row.todayPct)}</span>
          </div>
          <Sparkline points={row.history.map((point) => point.close)} tone={row.todayPct >= 0 ? "good" : "bad"} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold leading-tight text-[#ececee]">{row.actionLabel}: {row.headline}</div>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-[#9b9ba3]">{row.whatToDo}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#777780]">
            <span>{formatShares(row.shares)} sh</span>
            <span className={row.gainLoss >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{row.gainLoss >= 0 ? "+" : "-"}{formatMoneyBaht(Math.abs(row.gainLoss))}</span>
            <span>{row.yieldPct != null ? `Yield ${row.yieldPct.toFixed(2)}%` : "No yield read"}</span>
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 min-[820px]:justify-end">
          {state?.loading || aiScore != null ? (
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-12 w-12 flex-none">
                {state?.loading ? (
                  <div className="grid h-12 w-12 place-items-center"><LoadingSpinner size={18} className="text-[#6f6f78]" /></div>
                ) : (
                  <>
                    <Ring score={aiScore ?? 0} color={toneColor(aiTone)} size={48} stroke={5} />
                    <div className="absolute inset-0 grid place-items-center font-mono text-[15px] font-bold" style={{ color: toneColor(aiTone) }}>{aiScore}</div>
                  </>
                )}
              </div>
              <div className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">ai score</div>
            </div>
          ) : null}
          <PremiumAiButton
            label={state?.loading ? "Analyzing" : hasResult ? "Refresh" : "Analyze"}
            sublabel="Today"
            loading={state?.loading}
            onClick={runAnalysis}
            size="xs"
            className="flex-none"
          />
        </div>
      </article>

      {open ? (
        <section className="flex flex-col gap-2">
          {state?.loading ? (
            <PremiumLoading title={agentLoadingTitle(agentId, "analyst", row.symbol)} subject={row.symbol} agentId={agentId} task="analyst" onClose={() => setOpen(false)} />
          ) : (
            <div className="flex items-center justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-[var(--aw-radius-chip)] border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8c8c95] hover:text-[#ececee]">
                Close
              </button>
            </div>
          )}
          {state?.error ? <ErrorCard message={state.error} /> : null}
          {state?.data ? <TodayPanel data={state.data} /> : null}
        </section>
      ) : null}
    </div>
  );
}

function toneColor(tone?: BriefTone | string) {
  if (tone === "good") return "#3ecf8e";
  if (tone === "bad") return "#ff5f68";
  if (tone === "warn") return "#f5c451";
  return "#ececee";
}

function TodayPanel({ data }: { data: TodayPerformanceResponse }) {
  const color = toneColor(data.tone);
  const alignment = data.horizonAlignment;
  return (
    <AgentCall agent={data.agent} label="Today's plan" score={data.buyScore} scoreLabel="plan fit" signal={data.signal} headline={data.headline} summary={data.summary} accent={color} meta="Today only · generated on request · not financial advice">
      <div className="mt-4 grid gap-2.5 min-[760px]:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[10px] border bg-[#0e0e10] p-3.5" style={{ borderColor: `${holdingActionColor(data.holdingAction)}55` }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Do this today</div>
          <div className="mt-1.5 font-mono text-[17px] font-extrabold" style={{ color: holdingActionColor(data.holdingAction) }}>{data.holdingAction}</div>
          <div className="mt-2 text-[11px] leading-[1.5] text-[#bcbcc2]">{data.holdingActionReason}</div>
        </div>
        <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">Future alignment · {alignment.planHorizon}</div>
            <span className="rounded-[5px] border px-2 py-1 font-mono text-[9px] font-bold" style={{ color, borderColor: `${color}55`, background: `${color}0d` }}>{alignment.status}</span>
          </div>
          <div className="mt-2 text-[12.5px] font-bold text-[#ececee]">{alignment.structureRead}</div>
          <div className="mt-1 text-[11px] leading-[1.5] text-[#9b9ba3]">{alignment.why}</div>
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-3.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">Why this Agent chose it</div>
        <p className="mt-1 text-[12px] leading-[1.5] text-[#bcbcc2]">{data.todayRead}</p>
        <ul className="mt-2 grid gap-1 text-[11px] leading-[1.45] text-[#9b9ba3] min-[760px]:grid-cols-3">
          {data.evidence.map((item, index) => <li key={index}>• {item}</li>)}
        </ul>
      </div>

      <div className="mt-3 grid gap-2.5 min-[760px]:grid-cols-3">
        <TodayField label="Continue / add if" body={data.continueGate} />
        <TodayField label="Reduce / exit if" body={data.exitGate} />
        <TodayField label="Check next" body={data.nextCheck} />
      </div>
      <p className="mt-2.5 text-[10.5px] leading-[1.45] text-[#6f6f78]">Risk: {data.risk}</p>
    </AgentCall>
  );
}

function holdingActionColor(action: TodayPerformanceResponse["holdingAction"]) {
  if (action === "ADD" || action === "ADD_SMALL") return "#3ecf8e";
  if (action === "REDUCE" || action === "SELL") return "#ff5f68";
  return "#f5c451";
}

function TodayField({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">{label}</div>
      <p className="mt-1 text-[12.5px] leading-[1.55] text-[#cfcfd4]">{body}</p>
    </div>
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
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
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
