import { useState } from "react";
import { AgentByline } from "../../components/agents/AgentByline";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { ErrorCard, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { PillTabs } from "../../components/ui/PillTabs";
import { TagPill } from "../../components/ui/Badge";
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
      <section className="rounded-xl border border-[#2a2a31] bg-[#161619] p-5">
        <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">Your holdings today</div>
        <h2 className="mt-1 text-lg font-semibold">{brief.rows.length ? triageHeadline(brief) : "Add holdings to get a daily read"}</h2>
        <p className="mt-1 max-w-[560px] text-sm text-[#8c8c95]">{brief.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TagPill label={`${brief.counts.hold} chill`} color={TRIAGE_COPY.hold.color} />
          <TagPill label={`${brief.counts.watch} watch`} color={TRIAGE_COPY.watch.color} />
          <TagPill label={`${brief.counts.needs_you} sell`} color={TRIAGE_COPY.needs_you.color} />
        </div>
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
      <article className="grid gap-3 rounded-[10px] border border-[#26262c] bg-[#151518] p-3.5 min-[820px]:grid-cols-[180px_minmax(0,1fr)_172px] min-[820px]:items-center">
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
            <div className="text-right">
              <div className="font-mono text-[22px] font-bold leading-none" style={{ color: aiScore != null ? toneColor(aiTone) : "#6f6f78" }}>
                {state?.loading ? "···" : aiScore}
              </div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">ai score</div>
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
        <section className="relative">
          <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 z-10 rounded-[7px] border border-[#2a2a31] bg-[#0e0e10]/90 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8c8c95] hover:text-[#ececee]">
            Close
          </button>
          {state?.loading ? <PremiumLoading title={agentLoadingTitle(agentId, "analyst", row.symbol)} subject={row.symbol} agentId={agentId} task="analyst" /> : null}
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
  const plan = data.todayVsPlan;
  return (
    <div className="rounded-[14px] border bg-[#161619] p-5" style={{ borderColor: `${color}55` }}>
      <AgentByline agent={data.agent} label="Today's read" />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex rounded-[7px] border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: `${color}66`, color }}>
            {data.signal}
          </div>
          <h3 className="mt-2 text-[16px] font-bold leading-snug text-[#ececee]">{data.headline}</h3>
          <p className="mt-2 text-[13px] leading-[1.6] text-[#cfcfd4]">{data.summary}</p>
        </div>
        <div className="flex h-[76px] w-[76px] flex-none flex-col items-center justify-center rounded-[16px] border bg-[#0e0e10]" style={{ borderColor: `${color}66` }}>
          <div className="font-mono text-[26px] font-extrabold leading-none" style={{ color }}>{data.buyScore}</div>
          <div className="mt-1 text-[8px] uppercase tracking-[0.08em] text-[#8c8c95]">today setup</div>
        </div>
      </div>

      <div className="mt-4 rounded-[11px] border border-[#2a2a31] bg-[#0e0e10] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8c8c95]">Today vs plan</div>
          <div className="flex gap-1.5">
            <span className="rounded-[5px] border border-[#2a2a31] px-2 py-1 font-mono text-[9px] text-[#8c8c95]">{plan.planSource}</span>
            <span className="rounded-[5px] border border-[#2a2a31] px-2 py-1 font-mono text-[9px] text-[#8c8c95]">{plan.impactLevel}</span>
            <span className="rounded-[5px] border px-2 py-1 font-mono text-[9px] font-bold" style={{ color, borderColor: `${color}55`, background: `${color}0d` }}>{plan.status}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2.5 min-[720px]:grid-cols-2">
          <TodayField label="What we planned" body={plan.plannedSetup} />
          <TodayField label="What happened today" body={plan.actualSession} />
        </div>
        <div className="mt-2.5 rounded-[8px] border border-[#252529] bg-white/[0.02] px-3 py-2.5">
          <div className="text-[12px] font-bold" style={{ color }}>{plan.verdict}</div>
          <div className="mt-1 text-[11px] leading-[1.5] text-[#9b9ba3]">{plan.why}</div>
          <div className="mt-2 border-t border-[#252529] pt-2 text-[10px] leading-[1.5] text-[#777780]"><span className="font-bold text-[#8c8c95]">Horizon · {plan.planHorizon}:</span> {plan.enduranceReason}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 min-[820px]:grid-cols-3">
        <div className="rounded-[10px] border bg-[#0e0e10] p-3.5" style={{ borderColor: `${holdingActionColor(data.holdingAction)}55` }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Holding action today</div>
          <div className="mt-1.5 font-mono text-[17px] font-extrabold" style={{ color: holdingActionColor(data.holdingAction) }}>{data.holdingAction}</div>
          <div className="mt-2 text-[11px] leading-[1.5] text-[#bcbcc2]">{data.holdingActionReason}</div>
        </div>
        <TodayField label="Rare add gate" body={data.addGate} />
        <TodayField label="Reduce / sell gate" body={data.sellGate} />
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8c8c95]">Agent analysis</div>
            <div className="mt-1 text-[13px] font-semibold text-[#ececee]">{data.analysisTitle}</div>
          </div>
          <div className="max-w-[520px] text-right text-[10px] leading-[1.45] text-[#6f6f78]">{data.todayVsPlan.planHorizon}</div>
        </div>
        <div className="mt-3 grid gap-2.5 min-[900px]:grid-cols-3">
          {data.analysisSections.map((section) => <AgentAnalysisCard key={section.title} section={section} color={color} />)}
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 min-[720px]:grid-cols-2">
        <TodayField label="What matters tonight" body={data.whatMattersTonight} />
        <TodayField label="Overnight watch" body={data.tomorrow.overnightWatch.join(" · ")} />
      </div>
      <div className="mt-2.5 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-3.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">Risk</div>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-[#9b9ba3]">{data.risk}</p>
      </div>
    </div>
  );
}

function holdingActionColor(action: TodayPerformanceResponse["holdingAction"]) {
  if (action === "ADD" || action === "ADD_SMALL") return "#3ecf8e";
  if (action === "REDUCE" || action === "SELL") return "#ff5f68";
  return "#f5c451";
}

function AgentAnalysisCard({ section, color }: { section: TodayPerformanceResponse["analysisSections"][number]; color: string }) {
  return (
    <div className="rounded-[11px] border bg-[#0e0e10] p-3.5" style={{ borderColor: `${color}45` }}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em]" style={{ color }}>{section.title}</div>
      <div className="mt-2 text-[12.5px] font-bold leading-[1.4] text-[#ececee]">{section.verdict}</div>
      <div className="mt-2">
        <div className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#6f6f78]">Evidence used</div>
        <ul className="mt-1.5 space-y-1 text-[10.5px] leading-[1.45] text-[#9b9ba3]">
          {section.evidence.map((item, index) => <li key={index}>• {item}</li>)}
        </ul>
      </div>
      <ScenarioLine label="My action" body={section.action} color={color} />
    </div>
  );
}

function ScenarioLine({ label, body, color }: { label: string; body: string; color: string }) {
  return <div className="mt-2 border-t border-[#24242a] pt-2"><div className="text-[8.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{label}</div><div className="mt-1 text-[10.5px] leading-[1.45] text-[#bcbcc2]">{body}</div></div>;
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
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
