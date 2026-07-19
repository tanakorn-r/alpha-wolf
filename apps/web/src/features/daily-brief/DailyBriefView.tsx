import { useEffect, useState } from "react";
import { AgentCall } from "../../components/agents/AgentCall";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { DataTrustBadge } from "../../components/DataTrustBadge";
import { AgentActionButton } from "../../components/agents/AgentActionButton";
import { ErrorCard, RetryPanel } from "../../components/ui/panels";
import { PillTabs } from "../../components/ui/PillTabs";
import { TagPill } from "../../components/ui/Badge";
import type { TodayPerformanceResponse } from "../../lib/api";
import { actionPositionLabel, actionPositionTone } from "../../lib/actionPosition";
import { formatCurrency, formatMoneyBaht, formatNumber, formatPercent } from "../../lib/format";
import { formatLocalDate } from "../../lib/locale";
import { agentLoadingTitle, PremiumLoading } from "../hunt-ai/ui";
import type { BriefFilter, BriefStatus, BriefTone, DailyBrief, HoldingBriefRow } from "./useDailyBrief";

const TRIAGE_COPY: Record<BriefStatus, { label: string; color: string }> = {
  hold: { label: "Chill", color: "#3ecf8e" },
  watch: { label: "Watch", color: "#f5c451" },
  needs_you: { label: "Sell", color: "#ff5f68" },
};

const filters: Array<{ key: BriefFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_you", label: "Act today" },
  { key: "watch", label: "Watch closely" },
  { key: "hold", label: "No action" },
];

export function DailyBriefView({ brief }: { brief: DailyBrief }) {
  if (brief.loading) return <DailyBriefLoadingShell />;
  if (brief.failed) return <RetryPanel label="Daily Brief could not load your portfolio." onRetry={brief.retry} />;

  return (
    <div className="flex flex-col gap-3.5">
      <MorningMemo brief={brief} />
      {brief.rows.length ? <ExecutiveStrip brief={brief} /> : null}
      {brief.rows.length ? <DataTrustBadge trust={brief.dataTrust} className="self-start" /> : null}

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

      {brief.rows.length ? <CatalystTimeline brief={brief} /> : null}

      <section className="grid gap-2.5">
        {brief.visibleRows.length ? brief.visibleRows.map((row, index) => (
          <BriefQueueRow
            key={row.symbol}
            row={row}
            defaultExpanded={index === 0}
            agentId={brief.activeAgentId}
            agent={brief.activeAgent}
            state={brief.rowAnalysis[row.symbol]}
            onOpen={(force) => void brief.analyzeRow(row, force)}
          />
        )) : (
          <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-5 py-8 text-center text-[13px] text-[#8c8c95]">No holdings in this filter.</div>
        )}
      </section>
    </div>
  );
}

function MorningMemo({ brief }: { brief: DailyBrief }) {
  const review = brief.portfolioReview;
  if (brief.portfolioReviewLoading) return <PremiumLoading title={agentLoadingTitle(brief.activeAgentId, "portfolio", "your holdings")} subject="Portfolio" agentId={brief.activeAgentId} task="portfolio" />;
  if (review) {
    return (
      <AgentCall agent={review.agent} label="Morning desk memo" score={review.score} scoreLabel="portfolio readiness" signal={review.verdict} headline={review.intro} summary={review.sections[0]?.b ?? brief.summary} bullets={review.bullets.slice(0, 4)} accent={review.agent.color} signoff={false} density="compact" dataTrust={review.dataTrust}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: `${review.agent.color}30` }}>
          <span className="text-[10px] text-[#6f6f78]">Saved memo · update when you want a fresh read</span>
          <AgentActionButton agent={review.agent} label="Refresh memo" sublabel="Update memo" onClick={() => void brief.generatePortfolioReview(true)} />
        </div>
        {brief.portfolioReviewError ? <div className="mt-3"><ErrorCard message={brief.portfolioReviewError} /></div> : null}
      </AgentCall>
    );
  }
  return (
    <section className="rounded-[var(--aw-radius-card)] border border-[#3ecf8e]/25 bg-[radial-gradient(circle_at_85%_10%,rgba(116,164,255,.10),transparent_34%),#161619] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#3ecf8e]">Your holdings today</div>
          <h2 className="mt-1.5 text-[19px] font-bold">{brief.rows.length ? triageHeadline(brief) : "Add holdings to get a daily read"}</h2>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.6] text-[#8c8c95]">{brief.summary}</p>
        </div>
        {brief.rows.length ? <AgentActionButton agent={brief.activeAgent} label="Generate desk memo" sublabel="Portfolio AI" onClick={() => void brief.generatePortfolioReview(false)} /> : null}
      </div>
      {brief.portfolioReviewError ? <div className="mt-3"><ErrorCard message={brief.portfolioReviewError} /></div> : null}
    </section>
  );
}

function ExecutiveStrip({ brief }: { brief: DailyBrief }) {
  const lead = brief.rows[0];
  const watch = brief.rows.find((row) => row.status === "watch") ?? lead;
  const catalyst = nextCatalyst(brief.rows);
  return (
    <section className="grid gap-2 min-[680px]:grid-cols-2 min-[1050px]:grid-cols-4">
      <ExecutiveCard eyebrow="Do today" title={brief.counts.needs_you ? `${brief.counts.needs_you} decision${brief.counts.needs_you === 1 ? "" : "s"}` : "No trade required"} body={brief.counts.needs_you ? `${lead.symbol} · ${lead.actionLabel}` : `Keep ${lead.symbol} on plan`} color={brief.counts.needs_you ? "#f5c451" : "#3ecf8e"} />
      <ExecutiveCard eyebrow="Top watch" title={watch.symbol} body={watch.sellTrigger.title} color={watch.sellTrigger.tone === "bad" ? "#ff5f68" : "#f5c451"} />
      <ExecutiveCard eyebrow="Next catalyst" title={catalyst?.title ?? "No dated event"} body={catalyst?.body ?? "No dividend or DCA deadline is currently visible."} color="#74a4ff" />
      <ExecutiveCard eyebrow="Portfolio today" title={`${brief.totalPl >= 0 ? "+" : "-"}${formatMoneyBaht(Math.abs(brief.totalPl))}`} body={`${formatMoneyBaht(brief.stats?.totalValue)} total value`} color={brief.totalPl >= 0 ? "#3ecf8e" : "#ff5f68"} />
    </section>
  );
}

function ExecutiveCard({ eyebrow, title, body, color }: { eyebrow: string; title: string; body: string; color: string }) {
  return <div className="rounded-[10px] border border-[#2a2a31] bg-[#151518] p-3.5"><div className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">{eyebrow}</div><div className="mt-1.5 truncate text-[14px] font-bold" style={{ color }}>{title}</div><div className="mt-1 line-clamp-2 text-[10.5px] leading-[1.45] text-[#8c8c95]">{body}</div></div>;
}

function CatalystTimeline({ brief }: { brief: DailyBrief }) {
  const items = catalystItems(brief.rows).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#151518] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5"><span className="text-[9px] font-bold uppercase tracking-[0.11em] text-[#74a4ff]">Next 30 days</span>{items.map((item) => <span key={item.key} className="inline-flex items-center gap-2 rounded-[7px] border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5 text-[10px]"><b className="font-mono text-[#ececee]">{item.date}</b><span className="text-[#8c8c95]">{item.label}</span></span>)}</div>
    </section>
  );
}

function DailyBriefLoadingShell() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-label="Loading Daily Brief portfolio">
      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-5">
        <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#3ecf8e]">Your holdings today</div>
        <div className="mt-3 h-5 w-72 max-w-full animate-pulse rounded-full bg-[#292930]" />
        <div className="mt-2 h-3 w-[440px] max-w-full animate-pulse rounded-full bg-[#24242a]" />
      </section>
      <div className="flex items-center justify-between gap-3">
        <div className="h-10 w-72 max-w-[65%] animate-pulse rounded-[9px] bg-[#202024]" />
        <div className="h-10 w-44 max-w-[30%] animate-pulse rounded-[9px] bg-[#202024]" />
      </div>
      {[0, 1].map((row) => (
        <section key={row} className="grid gap-3 rounded-[10px] border border-[#26262c] bg-[#151518] p-3.5 min-[820px]:grid-cols-[180px_minmax(0,1fr)_200px]">
          <div className="grid gap-2"><div className="h-5 w-28 animate-pulse rounded-full bg-[#292930]" /><div className="h-3 w-36 animate-pulse rounded-full bg-[#24242a]" /><div className="h-8 w-full animate-pulse rounded-[7px] bg-[#202024]" /></div>
          <div className="grid content-center gap-2"><div className="h-4 w-4/5 animate-pulse rounded-full bg-[#292930]" /><div className="h-3 w-full animate-pulse rounded-full bg-[#24242a]" /><div className="h-3 w-3/5 animate-pulse rounded-full bg-[#202024]" /></div>
          <div className="flex items-center justify-end gap-3"><div className="h-12 w-12 animate-pulse rounded-full bg-[#24242a]" /><div className="h-9 w-24 animate-pulse rounded-[8px] bg-[#24242a]" /></div>
        </section>
      ))}
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

function catalystItems(rows: HoldingBriefRow[]) {
  const events = rows.flatMap((row) => row.events.map((event) => ({
    key: `${row.symbol}:${event.kind}:${event.date}`,
    timestamp: new Date(`${event.date}T00:00:00`).getTime(),
    date: formatLocalDate(new Date(`${event.date}T00:00:00`), { month: "short", day: "numeric" }),
    title: `${row.symbol} ${event.kind === "EX-DIV" ? "ex-dividend" : "payment"}`,
    label: `${row.symbol} · ${event.kind === "EX-DIV" ? "ex-div" : "pays"}`,
    body: event.days <= 0 ? "Today" : `In ${event.days} days`,
  })));
  const orders = rows.flatMap((row) => row.dcaOrders.map((order) => ({
    key: `${row.symbol}:DCA:${order.id}`,
    timestamp: new Date(`${order.scheduledFor}T00:00:00`).getTime(),
    date: formatLocalDate(new Date(`${order.scheduledFor}T00:00:00`), { month: "short", day: "numeric" }),
    title: `${row.symbol} DCA plan`,
    label: `${row.symbol} · DCA plan`,
    body: "Scheduled capital decision",
  })));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = today.getTime() + 30 * 86_400_000;
  return [...events, ...orders].filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= today.getTime() && item.timestamp <= horizon).sort((a, b) => a.timestamp - b.timestamp);
}

function nextCatalyst(rows: HoldingBriefRow[]) {
  return catalystItems(rows)[0] ?? null;
}

function BriefQueueRow({
  row,
  defaultExpanded,
  agentId,
  agent,
  state,
  onOpen,
}: {
  row: HoldingBriefRow;
  defaultExpanded: boolean;
  agentId: string;
  agent: DailyBrief["activeAgent"];
  state?: DailyBrief["rowAnalysis"][string];
  onOpen: (force: boolean) => void;
}) {
  const tag = triageTag(row);
  const hasResult = Boolean(state?.data);
  const [open, setOpen] = useState(false);
  const [lensesOpen, setLensesOpen] = useState(defaultExpanded);
  const aiScore = state?.data?.buyScore;
  const aiTone = state?.data?.tone;

  useEffect(() => {
    // A durable DB result is the content for this page, not a hidden prerequisite for
    // another AI run. Reveal it as soon as passive hydration completes.
    if (hasResult) setOpen(true);
  }, [hasResult]);

  function runAnalysis() {
    setOpen(true);
    if (hasResult && !open) return;
    onOpen(hasResult);
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
          {row.detailLoading ? (
            <div className="mt-2 grid gap-1.5" role="status" aria-label={`Loading market context for ${row.symbol}`}>
              <div className="h-2.5 w-full animate-pulse rounded-full bg-[#292930]" />
              <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-[#24242a]" />
              <span className="text-[9.5px] uppercase tracking-[0.08em] text-[#5f5f68]">Loading technicals and news</span>
            </div>
          ) : (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-[#9b9ba3]">{row.whatToDo}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#777780]">
            <span>{formatShares(row.shares)} sh</span>
            <span className={row.gainLoss >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{row.gainLoss >= 0 ? "+" : "-"}{formatMoneyBaht(Math.abs(row.gainLoss))}</span>
            <span>{row.yieldPct != null ? `Yield ${row.yieldPct.toFixed(2)}%` : "No yield read"}</span>
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 min-[820px]:justify-end">
          {state?.loading || state?.restoring || aiScore != null ? (
            <div className="flex w-[100px] flex-col items-center gap-1.5">
              <div className="relative flex h-12 w-full flex-none flex-col justify-center">
                {state?.loading || state?.restoring ? (
                  <div className="grid h-12 place-items-center"><LoadingSpinner size={18} className="text-[#6f6f78]" /></div>
                ) : (
                  <>
                    <div className="truncate text-center text-[9px] font-bold uppercase" style={{ color: actionPositionTone(aiScore ?? 50) }}>{actionPositionLabel(aiScore ?? 50)}</div>
                    <div className="relative mt-2 h-1.5 rounded-full bg-[linear-gradient(90deg,#f2575c,#f5c451_50%,#3ecf8e)]">
                      <span className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_#161619]" style={{ left: `${Math.max(0, Math.min(100, aiScore ?? 50))}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[6.5px] font-semibold uppercase text-[#5f5f68]"><span>Sell</span><span>Buy</span></div>
                  </>
                )}
              </div>
              <div className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.08em] text-[#6f6f78]">action position</div>
            </div>
          ) : null}
          <div className="flex flex-col items-stretch gap-1.5">
            <AgentActionButton
              agent={state?.data?.agent ?? agent}
              fallbackName="Your Agent"
              label={state?.restoring ? "Loading" : state?.loading ? "Analyzing" : hasResult ? open ? "Refresh" : "View" : "Ask Agent"}
              sublabel={hasResult ? open ? "Refresh analysis" : "Open saved" : "Today’s read"}
              loading={state?.loading || state?.restoring}
              onClick={runAnalysis}
              className="w-full flex-none"
            />
            <button type="button" onClick={() => setLensesOpen((value) => !value)} className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#74a4ff] hover:text-[#9bc0ff]">{lensesOpen ? "Hide desk lenses" : "Show desk lenses"}</button>
          </div>
        </div>
      </article>

      {lensesOpen ? <HoldingLensGrid row={row} /> : null}

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

function HoldingLensGrid({ row }: { row: HoldingBriefRow }) {
  const panels = [
    { ...row.nextMove, label: "Valuation desk" },
    { ...row.sellTrigger, label: "Technical risk" },
    { ...row.watchFor, label: "Income & events" },
    { ...row.news, label: "News desk" },
  ];
  return (
    <section className="grid gap-2 rounded-[10px] border border-[#25252b] bg-[#111114] p-2.5 min-[680px]:grid-cols-2 min-[1120px]:grid-cols-4">
      {panels.map((panel) => <DecisionLens key={panel.label} panel={panel} />)}
    </section>
  );
}

function DecisionLens({ panel }: { panel: HoldingBriefRow["nextMove"] }) {
  const color = toneColor(panel.tone);
  return (
    <div className="rounded-[8px] border bg-[#161619] p-3" style={{ borderColor: `${color}2f` }}>
      <div className="text-[8.5px] font-bold uppercase tracking-[0.09em]" style={{ color }}>{panel.label}</div>
      <div className="mt-1.5 text-[11.5px] font-bold text-[#ececee]">{panel.title}</div>
      <p className="mt-1 text-[10px] leading-[1.5] text-[#8c8c95]">{panel.body}</p>
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
    <AgentCall agent={data.agent} label="Today's plan" score={data.buyScore} scoreLabel="Action position" scoreMode="action" scoreNote={`Evidence strength ${data.buyScore}/100`} signal={data.signal} headline={data.headline} summary={data.summary} accent={color} meta="Today only · generated on request · not financial advice" dataTrust={data.dataTrust}>
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
  return formatNumber(value);
}
