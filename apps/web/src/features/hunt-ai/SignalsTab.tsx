import { EmptyPanel, LoadingPanel } from "../../components/ui/panels";
import { AgentCall } from "../../components/agents/AgentCall";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import type { ValuationVerdictResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { clamp, formatAnalyzedAt } from "./lib";
import { agentLoadingTitle, PremiumLoading } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function SignalsTab({ hunt }: { hunt: HuntAi }) {
  const signals = hunt.signals;

  if (signals.loading) return <LoadingPanel title="Loading your holdings..." body="Preparing the Hunt AI watchlist." />;
  if (!signals.symbols.length || !signals.ticker) {
    return <EmptyPanel title="No Hunt AI watchlist yet" body="Add a holding or use Add stock above. Daily Signals will stay empty until there is real data to analyze." />;
  }
  if (signals.pending) return <ValuationState ticker={signals.ticker} state="loading" fetching={signals.fetching} agentId={hunt.activeAgentId} onRun={signals.run} onOpen={() => signals.openDetail(signals.ticker)} />;
  if (signals.failed) return <ValuationState ticker={signals.ticker} state="error" fetching={signals.fetching} agentId={hunt.activeAgentId} onRun={signals.retry} onOpen={() => signals.openDetail(signals.ticker)} />;
  if (signals.fetching) return <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "valuation", signals.ticker)} subject={signals.ticker} agentId={hunt.activeAgentId} task="valuation" />;
  if (!signals.verdict || !signals.hasRun) return <ValuationStart ticker={signals.ticker} fetching={signals.fetching} agentId={hunt.activeAgentId} onRun={signals.run} onOpen={() => signals.openDetail(signals.ticker)} />;

  return <ValuationVerdict verdict={signals.verdict} analyzedAt={signals.analyzedAt} fetching={signals.fetching} onRun={signals.rerun} onOpen={() => signals.openDetail(signals.ticker)} />;
}

function ValuationStart({ ticker, fetching, agentId, onRun, onOpen }: { ticker: string; fetching: boolean; agentId: string; onRun: () => void; onOpen: () => void }) {
  return <ValuationState ticker={ticker} state="ready" fetching={fetching} agentId={agentId} onRun={onRun} onOpen={onOpen} />;
}

function ValuationState({
  ticker,
  state,
  fetching,
  agentId,
  onRun,
  onOpen,
}: {
  ticker: string;
  state: "ready" | "loading" | "error";
  fetching: boolean;
  agentId: string;
  onRun: () => void;
  onOpen: () => void;
}) {
  const buttonLabel = state === "loading" || fetching ? "Running" : state === "error" ? "Retry Verdict" : "AI Verdict";

  if (state === "loading") {
    return <PremiumLoading title={agentLoadingTitle(agentId, "valuation", ticker)} subject={ticker} agentId={agentId} task="valuation" />;
  }

  return (
    <section className="overflow-hidden rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#1a1a1e]">
      <div className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-[11px]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[11px]">
            <span className="font-mono text-[16px] font-extrabold text-[#ececee]">{ticker}</span>
            <span className="min-w-0 text-[11px] text-[#8c8c95]">Selected ticker · SET</span>
            <span className="rounded-[5px] border border-[#2a2a31] bg-[#0e0e10] px-[10px] py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#8c8c95]">
              {state === "error" ? "Verdict failed" : "Awaiting verdict"}
            </span>
          </div>
          <div className="ml-auto flex flex-none items-center gap-[7px]">
            <button type="button" onClick={onOpen} className="rounded-[5px] border border-[#2a2a31] bg-[#161619] px-[11px] py-[5px] text-[10px] font-bold text-[#bcbcc2] hover:border-[#3ecf8e]">
              Open Detail
            </button>
            <PremiumAiButton label={buttonLabel} sublabel="Valuation" disabled={fetching} loading={fetching} onClick={onRun} size="xs" />
          </div>
        </div>
      </div>

    </section>
  );
}

function ValuationVerdict({ verdict, analyzedAt, onRun, onOpen }: { verdict: ValuationVerdictResponse; analyzedAt: string; fetching: boolean; onRun: () => void; onOpen: () => void }) {
  const band = buildStructureBand(verdict);
  const theme = verdictTheme(verdict.verdict, verdict.rightNow.action, band.currentZone);
  const companyLabel = verdict.name.trim().toUpperCase() === verdict.symbol.trim().toUpperCase()
    ? verdict.symbol
    : `${verdict.symbol} · ${verdict.name}`;
  return (
    <div className="flex flex-col gap-2.5">
      <AgentCall
        agent={verdict.agent}
        label="Daily valuation"
        score={verdict.rightNow.conviction}
        scoreLabel="Decision conviction"
        signal={verdictLabel(verdict.verdict, verdict.rightNow.action, band)}
        headline={companyLabel}
        summary={verdict.recap ?? verdict.narrative ?? verdict.rightNow.note}
        accent={theme.accent}
        meta={`Cached ${formatAnalyzedAt(analyzedAt)} · supplied fundamentals only · not financial advice`}
        onRerun={onRun}
        dataTrust={verdict.dataTrust}
      >
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onOpen} className="rounded-[var(--aw-radius-control)] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2 text-[11px] font-bold text-[#bcbcc2] hover:border-[#3ecf8e]">Open stock detail</button>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          <TodayTape verdict={verdict} />
          <MetricGrid verdict={verdict} theme={theme} />
          <StructureBand band={band} />
          <Evidence verdict={verdict} />
        </div>
      </AgentCall>
    </div>
  );
}

function TodayTape({ verdict }: { verdict: ValuationVerdictResponse }) {
  const metrics = verdict.metrics;
  const chase = buildChaseRead(verdict);
  const todayTone = (metrics.todayChangePct ?? 0) > 0 ? "#3ecf8e" : (metrics.todayChangePct ?? 0) < 0 ? "#f2575c" : "#ececee";
  const rangePosition = intradayPosition(metrics.currentPrice, metrics.dayLow, metrics.dayHigh);
  const hasTape = [metrics.todayChangePct, metrics.dayLow, metrics.dayHigh, metrics.volumeRatio, metrics.rsi14, metrics.resistance]
    .some((value) => typeof value === "number" && Number.isFinite(value));

  if (!hasTape) return null;

  return (
    <section className="rounded-[10px] border border-[#2a2a31] bg-[#111114] px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <div className="text-[11px] font-bold tracking-[0.02em] text-[#ececee]">Today&apos;s price &amp; FOMO check</div>
        <div className="font-mono text-[9.5px] text-[#5a5a62]">session move · crowd · trigger</div>
      </div>
      <div className="mt-2.5 grid gap-2 min-[720px]:grid-cols-2 min-[1180px]:grid-cols-4">
        <TapeCard
          label="Today's move"
          value={formatNullableMoney(metrics.currentPrice, verdict.currency)}
          note={todayMoveText(metrics.todayChange, metrics.todayChangePct, verdict.currency)}
          color={todayTone}
        />
        <TapeCard
          label="Intraday range"
          value={rangeText(metrics.dayLow, metrics.dayHigh, verdict.currency)}
          note={rangePosition == null ? "session range unavailable" : `${Math.round(rangePosition * 100)}% through today's range`}
          color="#ececee"
        />
        <TapeCard
          label="Crowd / volume"
          value={metrics.volumeRatio != null ? `${metrics.volumeRatio.toFixed(2)}× normal` : "—"}
          note={volumeText(metrics.currentVolume, metrics.averageVolume)}
          color={volumeTone(metrics.volumeRatio)}
        />
        <TapeCard
          label={`${verdict.agent?.name ?? "Agent"} chase heat`}
          value={`${chase.score}/100 · ${chase.label}`}
          note={chase.reason}
          color={chase.color}
        />
      </div>
    </section>
  );
}

function TapeCard({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#6f6f78]">{label}</div>
      <div className="mt-1 font-mono text-[15px] font-bold" style={{ color }}>{value}</div>
      <div className="mt-1 text-[10.5px] leading-[1.4] text-[#8c8c95]">{note}</div>
    </div>
  );
}

type VerdictTheme = ReturnType<typeof verdictTheme>;

function RightNow({ verdict, theme, zone }: { verdict: ValuationVerdictResponse; theme: VerdictTheme; zone: StructureZone }) {
  const discountZone = (zone === "deep" || zone === "discount") && verdict.rightNow.action === "WAIT" && verdict.verdict !== "CHASING";
  const meta = zoneMeta(zone);
  const actionColor = discountZone ? meta.color : actionTone(verdict.rightNow.action);
  const action = discountZone ? (zone === "deep" ? "DCA NOW" : "ACCUMULATE") : actionLabel(verdict.rightNow.action);
  const note = discountZone ? discountActionNote(verdict, meta.shortLabel) : verdict.rightNow.note;
  const metricLabel = discountZone ? "Add heavier near" : "Add only below";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border px-3.5 py-2.5" style={{ borderColor: theme.todayBorder, background: theme.todayBg }}>
      <div className="flex flex-none flex-col gap-0.5">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">Right now · Today</div>
        <div className="text-[18px] font-extrabold tracking-[-0.3px]" style={{ color: actionColor }}>{action}</div>
      </div>
      <div className="min-w-[180px] flex-1 text-[12.5px] leading-[1.55] text-[#bcbcc2]">{note}</div>
      <div className="flex flex-none gap-3.5">
      <MiniMetric label={metricLabel} value={formatNullableMoney(verdict.rightNow.entryOnlyAt, verdict.currency)} note={pctAwayText(verdict.rightNow.pctAway)} color={theme.accent} />
      <MiniMetric label={`${verdict.agent?.name ?? "Agent"} perspective`} value={String(verdict.rightNow.conviction)} note="/ 100" color={theme.accent} />
      </div>
    </div>
  );
}

function MetricGrid({ verdict, theme }: { verdict: ValuationVerdictResponse; theme: VerdictTheme }) {
  const metrics = verdict.metrics;
  const impliedBookValue = metrics.bookValuePerShare ?? (metrics.currentPrice != null && metrics.pbv != null && metrics.pbv > 0 ? metrics.currentPrice / metrics.pbv : null);
  const bookValueInferred = metrics.bookValuePerShare == null && impliedBookValue != null;
  return (
    <div className="grid gap-2.5 min-[760px]:grid-cols-2 min-[1120px]:grid-cols-3">
      <MetricCard label="Trailing P / E" value={metrics.peRatio != null ? `${metrics.peRatio.toFixed(2)}x` : "—"} note="price / reported earnings" color={theme.accent} />
      <MetricCard label="Forward P / E" value={metrics.forwardPE != null ? `${metrics.forwardPE.toFixed(2)}x` : "—"} note="price / expected earnings" color={theme.accent} />
      <MetricCard label="Book value / sh" value={formatNullableMoney(impliedBookValue, verdict.currency)} note={bookValueInferred ? "implied from price ÷ P/B" : "reported fair-value anchor"} color="#ececee" />
      <MetricCard label="P / BV" value={metrics.pbv != null ? `${metrics.pbv.toFixed(2)}x` : "—"} note={metrics.pbvFloor != null ? `vs ${metrics.pbvFloor.toFixed(2)}x floor` : "valuation multiple"} color={theme.accent} />
      <MetricCard label="Dividend yield" value={metrics.dividendYield != null ? `${metrics.dividendYield.toFixed(2)}%` : "—"} note="annual" color="#3ecf8e" />
    </div>
  );
}

type StructureBandModel = ReturnType<typeof buildStructureBand>;

function StructureBand({ band }: { band: StructureBandModel }) {
  return (
    <div className="rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-4 pb-3 pt-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-[6px]">
        <div className="text-[12px] font-bold tracking-[0.02em] text-[#ececee]">Where the price sits vs structure</div>
        <div className="font-mono text-[10.5px] text-[#5a5a62]">{band.scaleLabel}</div>
      </div>
      <div className="relative mx-1 mt-3 h-[78px]">
        <div className="absolute left-0 right-0 top-[34px] h-[14px] overflow-hidden rounded-[7px] border border-[#2a2a31] bg-[#161619]">
          <div className="absolute bottom-0 top-0 bg-[#3ecf8e]/35" style={{ left: `${band.deepDiscountLeft}%`, width: `${band.deepDiscountWidth}%` }} />
          <div className="absolute bottom-0 top-0 bg-[#78e6b8]/22" style={{ left: `${band.discountLeft}%`, width: `${band.discountWidth}%` }} />
          <div className="absolute bottom-0 top-0 bg-[#f5c451]/20" style={{ left: `${band.fairLeft}%`, width: `${band.fairWidth}%` }} />
          <div className="absolute bottom-0 top-0 bg-[#ff8c91]/18" style={{ left: `${band.expensiveLeft}%`, width: `${band.expensiveWidth}%` }} />
          <div className="absolute bottom-0 top-0 bg-[#f2575c]/24" style={{ left: `${band.chasingLeft}%`, width: `${band.chasingWidth}%` }} />
        </div>
        <ZoneLabel left={band.deepDiscountLabelLeft} color="#3ecf8e" label={band.zoneLabels?.[0] ?? "DEEP VALUE"} />
        <ZoneLabel left={band.discountLabelLeft} color="#78e6b8" label={band.zoneLabels?.[1] ?? "DCA DISCOUNT"} />
        <ZoneLabel left={band.fairLabelLeft} color="#f5c451" label={band.zoneLabels?.[2] ?? "FAIR VALUE"} />
        <ZoneLabel left={band.expensiveLabelLeft} color="#ff8c91" label={band.zoneLabels?.[3] ?? "EXPENSIVE"} />
        <ZoneLabel left={band.chasingLabelLeft} color="#f2575c" label={band.zoneLabels?.[4] ?? "CHASE TRAP"} />
        <BandMarker left={band.entryPct} color="#3ecf8e" label={band.entryLabel} align="below" />
        {band.showFairMarker !== false ? <BandMarker left={band.fairPct} color="#8c8c95" label={band.fairLabel} align="below" /> : null}
        <BandMarker left={band.nowPct} color={band.nowColor} label={band.nowLabel} align="above" />
      </div>
    </div>
  );
}

function ZoneLabel({ left, color, label }: { left: number; color: string; label: string }) {
  return (
    <div className="absolute top-[14px] -translate-x-1/2 whitespace-nowrap text-[9px] font-bold tracking-[0.05em]" style={{ left: `${left}%`, color }}>
      {label}
    </div>
  );
}

function Evidence({ verdict }: { verdict: ValuationVerdictResponse }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#5a5a62]">What {verdict.agent?.name ?? "this Agent"} sees</div>
      <div className="flex flex-col gap-[6px]">
        {verdict.whatAiSees.map((item, index) => {
          const tone = evidenceTone(item.tone);
          return (
          <div key={index} className="flex items-start gap-2 text-[12px] leading-[1.55] text-[#bcbcc2]">
            <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: tone.color }} />
            <span><b style={{ color: tone.color }}>{item.title}.</b> {item.text}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function evidenceTone(tone: "GOOD" | "WATCH" | "BAD") {
  if (tone === "GOOD") return { color: "#3ecf8e", border: "rgba(62,207,142,0.3)", bg: "rgba(62,207,142,0.08)" };
  if (tone === "BAD") return { color: "#f2575c", border: "rgba(242,87,92,0.3)", bg: "rgba(242,87,92,0.08)" };
  return { color: "#f5c451", border: "rgba(245,196,81,0.3)", bg: "rgba(245,196,81,0.08)" };
}

function ThePlay({ verdict, theme }: { verdict: ValuationVerdictResponse; theme: VerdictTheme }) {
  const zone = addBackZone(verdict);
  const sub = addBackSub(verdict);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3.5" style={{ borderColor: theme.footBorder, background: theme.footBg }}>
      <div className="min-w-[260px] flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: theme.accent }}>The play this month</div>
      <div className="mt-[5px] text-[12px] leading-[1.55] text-[#ececee]">{verdict.thePlay.text}</div>
      </div>
      <div className="text-right max-[760px]:text-left">
        <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5a5a62]">Add-back zone</div>
        <div className="mt-0.5 font-mono text-[21px] font-extrabold" style={{ color: theme.accent }}>{zone}</div>
        {sub ? <div className="text-[10.5px] text-[#8c8c95]">{sub}</div> : null}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="min-w-[92px] text-right max-[760px]:text-left">
      <div className="text-[9px] uppercase tracking-[0.04em] text-[#5a5a62]">{label}</div>
      <div className="mt-[3px] font-mono text-[18px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#8c8c95]">{note}</div>
    </div>
  );
}

function MetricCard({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.04em] text-[#8c8c95]">{label}</div>
      <div className="mt-1 font-mono text-[16px] font-bold" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-[#8c8c95]">{note}</div>
    </div>
  );
}

function BandMarker({ left, color, label, align }: { left: number; color: string; label: string; align: "above" | "below" }) {
  const top = align === "above" ? "0" : "34px";
  return (
    <div className="absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap" style={{ left: `${left}%`, top }}>
      {align === "above" ? <div className="rounded-[4px] px-[6px] py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em] text-[#0e0e10]" style={{ background: color }}>{label}</div> : null}
      <div className={align === "above" ? "h-10 w-[2px]" : "h-[22px] w-[2px]"} style={{ background: color }} />
      {align === "below" ? <div className="mt-1 font-mono text-[9px]" style={{ color }}>{label}</div> : null}
    </div>
  );
}

type StructureZone = "deep" | "discount" | "fair" | "expensive" | "chasing";

function zoneMeta(zone: StructureZone) {
  if (zone === "deep") return { color: "#3ecf8e", border: "rgba(62,207,142,0.48)", bg: "rgba(62,207,142,0.14)", shortLabel: "DEEP" };
  if (zone === "discount") return { color: "#78e6b8", border: "rgba(120,230,184,0.42)", bg: "rgba(120,230,184,0.12)", shortLabel: "DISCOUNT" };
  if (zone === "expensive") return { color: "#ff8c91", border: "rgba(255,140,145,0.42)", bg: "rgba(255,140,145,0.12)", shortLabel: "EXPENSIVE" };
  if (zone === "chasing") return { color: "#f2575c", border: "rgba(242,87,92,0.46)", bg: "rgba(242,87,92,0.14)", shortLabel: "CHASE" };
  return { color: "#f5c451", border: "rgba(245,196,81,0.42)", bg: "rgba(245,196,81,0.14)", shortLabel: "FAIR" };
}

function verdictTheme(verdict: ValuationVerdictResponse["verdict"], action?: ValuationVerdictResponse["rightNow"]["action"], zone?: StructureZone) {
  const meta = zone ? zoneMeta(zone) : null;
  if (zone === "deep" || (verdict === "DISCOUNT" && action === "BUY")) return {
    accent: "#3ecf8e",
    cardBorder: "rgba(62,207,142,0.4)",
    badgeBg: "rgba(62,207,142,0.14)",
    badgeBorder: "rgba(62,207,142,0.4)",
    frame: "linear-gradient(90deg,#3ecf8e,#4d96ff)",
    footBg: "rgba(62,207,142,0.06)",
    footBorder: "rgba(62,207,142,0.3)",
    todayBg: "rgba(62,207,142,0.07)",
    todayBorder: "rgba(62,207,142,0.3)",
  };
  if (zone === "discount") return {
    accent: "#78e6b8",
    cardBorder: "rgba(120,230,184,0.36)",
    badgeBg: meta?.bg ?? "rgba(120,230,184,0.12)",
    badgeBorder: meta?.border ?? "rgba(120,230,184,0.42)",
    frame: "linear-gradient(90deg,#78e6b8,#f5c451)",
    footBg: "rgba(120,230,184,0.06)",
    footBorder: "rgba(120,230,184,0.28)",
    todayBg: "rgba(120,230,184,0.06)",
    todayBorder: "rgba(120,230,184,0.28)",
  };
  if (zone === "expensive") return {
    accent: "#ff8c91",
    cardBorder: "rgba(255,140,145,0.36)",
    badgeBg: meta?.bg ?? "rgba(255,140,145,0.12)",
    badgeBorder: meta?.border ?? "rgba(255,140,145,0.42)",
    frame: "linear-gradient(90deg,#f5c451,#ff8c91)",
    footBg: "rgba(255,140,145,0.06)",
    footBorder: "rgba(255,140,145,0.28)",
    todayBg: "rgba(255,140,145,0.06)",
    todayBorder: "rgba(255,140,145,0.28)",
  };
  if (zone === "chasing") return {
    accent: "#f2575c",
    cardBorder: "rgba(242,87,92,0.4)",
    badgeBg: "rgba(242,87,92,0.14)",
    badgeBorder: "rgba(242,87,92,0.4)",
    frame: "linear-gradient(90deg,#f5c451,#f2575c)",
    footBg: "rgba(242,87,92,0.06)",
    footBorder: "rgba(242,87,92,0.3)",
    todayBg: "rgba(242,87,92,0.06)",
    todayBorder: "rgba(242,87,92,0.3)",
  };
  if (verdict === "DISCOUNT") return {
    accent: "#f5c451",
    cardBorder: "rgba(245,196,81,0.4)",
    badgeBg: "rgba(245,196,81,0.14)",
    badgeBorder: "rgba(245,196,81,0.4)",
    frame: "linear-gradient(90deg,#f5c451,#3ecf8e)",
    footBg: "rgba(245,196,81,0.06)",
    footBorder: "rgba(245,196,81,0.3)",
    todayBg: "rgba(245,196,81,0.07)",
    todayBorder: "rgba(245,196,81,0.3)",
  };
  if (verdict === "CHASING") return {
    accent: "#f2575c",
    cardBorder: "rgba(242,87,92,0.4)",
    badgeBg: "rgba(242,87,92,0.14)",
    badgeBorder: "rgba(242,87,92,0.4)",
    frame: "linear-gradient(90deg,#f5c451,#f2575c)",
    footBg: "rgba(242,87,92,0.06)",
    footBorder: "rgba(242,87,92,0.3)",
    todayBg: "rgba(245,196,81,0.07)",
    todayBorder: "rgba(245,196,81,0.3)",
  };
  if (verdict === "INSUFFICIENT_DATA") return {
    accent: "#8c8c95",
    cardBorder: "rgba(140,140,149,0.36)",
    badgeBg: "rgba(140,140,149,0.12)",
    badgeBorder: "rgba(140,140,149,0.34)",
    frame: "linear-gradient(90deg,#8c8c95,#5a5a62)",
    footBg: "rgba(140,140,149,0.06)",
    footBorder: "rgba(140,140,149,0.28)",
    todayBg: "rgba(140,140,149,0.07)",
    todayBorder: "rgba(140,140,149,0.3)",
  };
  return {
    accent: "#f5c451",
    cardBorder: "rgba(245,196,81,0.4)",
    badgeBg: "rgba(245,196,81,0.14)",
    badgeBorder: "rgba(245,196,81,0.4)",
    frame: "linear-gradient(90deg,#f5c451,#3ecf8e)",
    footBg: "rgba(245,196,81,0.06)",
    footBorder: "rgba(245,196,81,0.3)",
    todayBg: "rgba(245,196,81,0.07)",
    todayBorder: "rgba(245,196,81,0.3)",
  };
}

function verdictLabel(verdict: ValuationVerdictResponse["verdict"], action: ValuationVerdictResponse["rightNow"]["action"], band: StructureBandModel) {
  const zone = band.currentZone;
  if (band.tactical) {
    if (zone === "deep") return "No setup · stand aside";
    if (zone === "discount") return "Building · wait for breakout";
    if (zone === "fair") return "At trigger · demand volume";
    if (zone === "expensive") return "Extended · manage risk";
    return "Chase trap · pause / skip";
  }
  if (zone === "deep") return action === "BUY" ? "Deep value · load zone" : "Deep value · verify risk";
  if (zone === "discount") return action === "BUY" ? "DCA discount · accumulate" : "DCA discount · wait for setup";
  if (zone === "expensive") return "Expensive · wait for pullback";
  if (zone === "chasing" || verdict === "CHASING") return "Chase trap · pause / skip";
  if (verdict === "INSUFFICIENT_DATA") return "Insufficient data";
  if (zone === "fair") return "Fair value · hold / wait";
  return "Fair · hold / wait";
}

function actionTone(action: ValuationVerdictResponse["rightNow"]["action"]) {
  if (action === "BUY") return "#3ecf8e";
  if (action === "TRIM" || action === "AVOID") return "#f2575c";
  return "#f5c451";
}

function currentMarkerTone(verdict: ValuationVerdictResponse, zone: StructureZone) {
  return zoneMeta(zone).color;
}

function actionLabel(action: ValuationVerdictResponse["rightNow"]["action"]) {
  if (action === "BUY") return "BUY NOW";
  return action;
}

function buildStructureBand(verdict: ValuationVerdictResponse) {
  const book = verdict.metrics.bookValuePerShare ?? verdict.structureBand.fairAnchor ?? null;
  const pbvFloor = verdict.metrics.pbvFloor ?? null;
  const now = verdict.metrics.currentPrice ?? verdict.structureBand.now ?? null;
  const labelBetween = (left: number, right: number) => (left + right) / 2;

  const discountFloor = book != null && pbvFloor != null ? book * pbvFloor : verdict.structureBand.discountAnchor;
  const discountFair = book ?? verdict.structureBand.fairAnchor;
  // The P/BV-floor visual assumes the floor sits BELOW fair (a real cheap anchor on the left). For
  // development / deep-discount names the "floor" multiple can be >1x book (e.g. 1.40x) while price
  // trades far under book — that inverts the scale and collapses the green slices. Only use it when
  // the floor is genuinely cheaper than fair; otherwise fall through to the general entry/fair band.
  const shouldShowBuyDiscount = verdict.verdict === "DISCOUNT" && verdict.rightNow.action === "BUY"
    && discountFloor != null && discountFair != null && discountFloor < discountFair;

  if (shouldShowBuyDiscount) {
    const floor = discountFloor;
    const fair = discountFair;
    const fairTop = fair != null ? fair * 1.1 : null;
    const values = validNumbers(floor, fair, fairTop, now);
    const lo = values.length ? Math.min(...values) * 0.93 : 0;
    const hi = values.length ? Math.max(fairTop ?? 0, now != null ? now * 1.06 : 0, fair != null ? fair * 1.16 : 0, ...values) : 1;
    const floorPct = percentOnBand(floor, lo, hi);
    const fairPct = percentOnBand(fair, lo, hi);
    const fairTopPct = percentOnBand(fairTop, lo, hi);
    const nowPct = percentOnBand(now, lo, hi);
    const deepEndPct = labelBetween(floorPct, fairPct);
    const expensiveStartPct = labelBetween(fairPct, fairTopPct);
    const currentZone = zoneFromCall(verdict.verdict, verdict.rightNow.action, nowPct, floorPct);
    const currentMeta = zoneMeta(currentZone);

    return {
      tactical: false,
      scaleLabel: pbvFloor != null ? `P/BV floor ${pbvFloor.toFixed(2)}x → book 1.0x` : verdict.structureBand.zoneLabel,
      deepDiscountLeft: floorPct,
      deepDiscountWidth: Math.max(0, deepEndPct - floorPct),
      discountLeft: deepEndPct,
      discountWidth: Math.max(0, fairPct - deepEndPct),
      fairLeft: fairPct,
      fairWidth: Math.max(0, expensiveStartPct - fairPct),
      expensiveLeft: expensiveStartPct,
      expensiveWidth: Math.max(0, fairTopPct - expensiveStartPct),
      chasingLeft: fairTopPct,
      chasingWidth: Math.max(0, 100 - fairTopPct),
      deepDiscountLabelLeft: labelBetween(floorPct, deepEndPct),
      discountLabelLeft: labelBetween(deepEndPct, fairPct),
      fairLabelLeft: labelBetween(fairPct, expensiveStartPct),
      expensiveLabelLeft: labelBetween(expensiveStartPct, fairTopPct),
      chasingLabelLeft: labelBetween(fairTopPct, 100),
      entryPct: floorPct,
      entryLabel: floor != null ? `${moneyLabel(floor, verdict.currency)} · ${pbvFloor != null ? `${pbvFloor.toFixed(2)}x` : "floor"}` : "floor",
      fairPct,
      fairLabel: fair != null ? `${moneyLabel(fair, verdict.currency)} · book` : "book",
      nowPct,
      nowLabel: now != null ? `${currentMeta.shortLabel} ${moneyLabel(now, verdict.currency)}` : currentMeta.shortLabel,
      nowColor: currentMeta.color,
      currentZone,
    };
  }

  const entry = firstNumber(verdict.rightNow.entryOnlyAt, verdict.thePlay.addBackLow, verdict.structureBand.discountAnchor, now != null ? now * 0.96 : null);
  const entryHigh = firstNumber(verdict.thePlay.addBackHigh, verdict.rightNow.entryOnlyAt, entry);
  const fair = firstNumber(verdict.structureBand.fairAnchor, book, now);
  const chasingVerdict = verdict.verdict === "CHASING";
  const tacticalAgent = verdict.agent?.id === "kai" || verdict.agent?.id === "rex";
  // Tactical Agents can use entryOnlyAt as a breakout trigger ABOVE today's price. That is not a
  // value floor, so forcing it through the deep-value → chase valuation scale reverses the map and
  // piles every label on top of another. Render a setup/trigger scale for that shape instead.
  const trigger = firstNumber(verdict.metrics.resistance, entry != null && now != null && entry >= now ? entry : null);
  const tacticalTrigger = tacticalAgent && now != null && trigger != null;
  if (tacticalTrigger) {
    const lo = Math.min(now, trigger) * 0.96;
    const hi = Math.max(now, trigger) * 1.08;
    const nowPct = percentOnBand(now, lo, hi);
    const triggerPct = percentOnBand(trigger, lo, hi);
    const currentZone = tacticalZone(now, trigger, verdict.metrics.volumeRatio);
    const currentMeta = zoneMeta(currentZone);
    const currentLabel = currentZone === "deep" ? "NO SETUP"
      : currentZone === "discount" ? "BUILDING"
      : currentZone === "fair" ? "TRIGGER"
      : currentZone === "expensive" ? "EXTENDED"
      : "CHASE";
    return {
      tactical: true,
      scaleLabel: `${verdict.agent?.name ?? "Agent"} setup map · trigger vs current price`,
      deepDiscountLeft: 0,
      deepDiscountWidth: 20,
      discountLeft: 20,
      discountWidth: 20,
      fairLeft: 40,
      fairWidth: 20,
      expensiveLeft: 60,
      expensiveWidth: 20,
      chasingLeft: 80,
      chasingWidth: 20,
      deepDiscountLabelLeft: 10,
      discountLabelLeft: 30,
      fairLabelLeft: 50,
      expensiveLabelLeft: 70,
      chasingLabelLeft: 90,
      zoneLabels: ["NO SETUP", "BUILDING", "TRIGGER", "EXTENDED", "CHASE TRAP"] as const,
      entryPct: triggerPct,
      entryLabel: `${moneyLabel(trigger, verdict.currency)} · trigger`,
      fairPct: triggerPct,
      fairLabel: "",
      showFairMarker: false,
      nowPct,
      nowLabel: `${currentLabel} ${moneyLabel(now, verdict.currency)}`,
      nowColor: currentMeta.color,
      currentZone,
    };
  }
  const stretched = firstNumber(fair != null ? fair * (chasingVerdict ? 1.0 : 1.08) : null, now != null ? now * 1.05 : null);
  const values = validNumbers(entry, entryHigh, fair, stretched, now);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const lo = min === max ? min * 0.9 : min - (max - min) * 0.14;
  const hi = min === max ? max * 1.1 : max + (max - min) * 0.14;
  const entryPct = percentOnBand(entry, lo, hi);
  const entryHighPct = Math.max(entryPct, percentOnBand(entryHigh, lo, hi));
  const fairPct = Math.max(entryHighPct, percentOnBand(fair, lo, hi));
  const stretchedPct = Math.max(fairPct, percentOnBand(stretched, lo, hi));
  const nowPct = percentOnBand(now, lo, hi);
  const pbv = verdict.metrics.pbv;
  const chasingSeed = chasingVerdict ? Math.max(fairPct + 6, Math.min(nowPct - 2, 97)) : stretchedPct;
  const currentZone = zoneFromCall(verdict.verdict, verdict.rightNow.action, nowPct, entryPct);
  const [deepEndPct, fairStartPct, expensiveStartPct, chasingStartPct] = alignZoneBoundaries(
    [labelBetween(entryPct, fairPct), fairPct, labelBetween(fairPct, chasingSeed), chasingSeed],
    zoneIndex(currentZone),
    nowPct,
  );
  const currentMeta = zoneMeta(currentZone);

  return {
    tactical: false,
    scaleLabel: pbv != null ? `P/BV now ${pbv.toFixed(2)}x · AI entry map` : verdict.structureBand.zoneLabel,
    deepDiscountLeft: entryPct,
    deepDiscountWidth: Math.max(3, deepEndPct - entryPct),
    discountLeft: deepEndPct,
    discountWidth: Math.max(3, fairStartPct - deepEndPct),
    fairLeft: fairStartPct,
    fairWidth: Math.max(3, expensiveStartPct - fairStartPct),
    expensiveLeft: expensiveStartPct,
    expensiveWidth: Math.max(3, chasingStartPct - expensiveStartPct),
    chasingLeft: chasingStartPct,
    chasingWidth: Math.max(0, 100 - chasingStartPct),
    deepDiscountLabelLeft: labelBetween(entryPct, deepEndPct),
    discountLabelLeft: labelBetween(deepEndPct, fairStartPct),
    fairLabelLeft: labelBetween(fairStartPct, expensiveStartPct),
    expensiveLabelLeft: labelBetween(expensiveStartPct, chasingStartPct),
    chasingLabelLeft: labelBetween(chasingStartPct, 100),
    entryPct,
    entryLabel: entry != null ? `${moneyLabel(entry, verdict.currency)} · entry` : "entry",
    fairPct,
    fairLabel: fair != null ? `${moneyLabel(fair, verdict.currency)} · fair` : "fair",
    nowPct,
    nowLabel: now != null ? `${currentMeta.shortLabel} ${moneyLabel(now, verdict.currency)}` : currentMeta.shortLabel,
    nowColor: currentMarkerTone(verdict, currentZone),
    currentZone,
  };
}

function formatNullableMoney(value: number | null | undefined, currency: string) {
  return typeof value === "number" && Number.isFinite(value) ? moneyLabel(value, currency) : "—";
}

function buildChaseRead(verdict: ValuationVerdictResponse) {
  const { currentPrice, todayChangePct, dayLow, dayHigh, volumeRatio, rsi14, resistance } = verdict.metrics;
  const agentName = verdict.agent?.name ?? "This agent";
  const rangePosition = intradayPosition(currentPrice, dayLow, dayHigh) ?? 0.5;
  const triggerGapPct = currentPrice != null && resistance != null && resistance > 0
    ? ((currentPrice - resistance) / resistance) * 100
    : null;
  const moveHeat = clamp(Math.max(todayChangePct ?? 0, 0) * 7, 0, 28);
  const crowdHeat = volumeRatio == null ? 0 : clamp((volumeRatio - 0.6) * 24, 0, 28);
  const momentumHeat = rsi14 == null ? 0 : clamp((rsi14 - 55) * 1.2, 0, 22);
  const closeHeat = clamp((rangePosition - 0.7) * 30, 0, 9);
  const extensionHeat = triggerGapPct == null ? 0 : triggerGapPct > 0
    ? clamp(8 + triggerGapPct * 4, 0, 30)
    : triggerGapPct > -1.5 ? 5 : 0;
  const score = Math.round(clamp(moveHeat + crowdHeat + momentumHeat + closeHeat + extensionHeat, 0, 100));
  const volumeLabel = volumeRatio == null ? "volume confirmation is unavailable" : `volume is ${volumeRatio.toFixed(2)}× normal`;

  if (triggerGapPct != null && triggerGapPct < -0.75) {
    return {
      score,
      label: score >= 60 ? "WARM" : score >= 35 ? "WATCH" : "LOW",
      color: score >= 60 ? "#f5c451" : "#78e6b8",
      reason: `Not a chase yet: ${Math.abs(triggerGapPct).toFixed(1)}% below ${moneyLabel(resistance!, verdict.currency)} resistance; ${volumeLabel}.`,
    };
  }
  if (triggerGapPct != null && triggerGapPct > 5) {
    return {
      score,
      label: "CHASE RISK",
      color: "#f2575c",
      reason: `${triggerGapPct.toFixed(1)}% above resistance. ${agentName} treats that extension as FOMO unless price resets.`,
    };
  }
  if (triggerGapPct != null && triggerGapPct > 0 && volumeRatio != null && volumeRatio < 0.8) {
    return {
      score,
      label: "FAKEOUT RISK",
      color: "#f2575c",
      reason: `Above resistance, but ${volumeLabel}; a thin breakout is chase risk, not confirmation.`,
    };
  }
  if (triggerGapPct != null && triggerGapPct >= -0.75 && triggerGapPct <= 1) {
    return {
      score,
      label: "AT TRIGGER",
      color: "#f5c451",
      reason: `At the ${moneyLabel(resistance!, verdict.currency)} trigger. ${agentName} wants strong volume before calling it a real breakout.`,
    };
  }
  if (triggerGapPct != null && triggerGapPct > 0) {
    return {
      score,
      label: volumeRatio != null && volumeRatio >= 1.2 ? "CONFIRMED" : "EXTENDED",
      color: volumeRatio != null && volumeRatio >= 1.2 ? "#3ecf8e" : "#ff8c91",
      reason: `${triggerGapPct.toFixed(1)}% above resistance; ${volumeLabel}. Confirmation determines breakout versus chase.`,
    };
  }

  return {
    score,
    label: score >= 70 ? "HOT" : score >= 40 ? "WATCH" : "LOW",
    color: score >= 70 ? "#f2575c" : score >= 40 ? "#f5c451" : "#78e6b8",
    reason: `No resistance trigger supplied. Heat uses today's move, range position, RSI, and ${volumeLabel}.`,
  };
}

function tacticalZone(now: number, trigger: number, volumeRatio: number | null | undefined): StructureZone {
  const gapPct = ((now - trigger) / trigger) * 100;
  if (gapPct < -8) return "deep";
  if (gapPct < -0.75) return "discount";
  if (gapPct <= 1) return "fair";
  if (gapPct > 5 || (volumeRatio != null && volumeRatio < 0.8)) return "chasing";
  return "expensive";
}

function intradayPosition(current: number | null | undefined, low: number | null | undefined, high: number | null | undefined) {
  if (current == null || low == null || high == null || high <= low) return null;
  return clamp((current - low) / (high - low), 0, 1);
}

function todayMoveText(change: number | null | undefined, pct: number | null | undefined, currency: string) {
  if (change == null && pct == null) return "daily move unavailable";
  const changeText = change == null ? "" : `${change > 0 ? "+" : ""}${moneyLabel(change, currency)}`;
  const pctText = pct == null ? "" : `${signed(pct)}% today`;
  return [changeText, pctText].filter(Boolean).join(" · ");
}

function rangeText(low: number | null | undefined, high: number | null | undefined, currency: string) {
  if (low == null || high == null) return "—";
  return `${moneyLabel(low, currency)}–${moneyLabel(high, currency)}`;
}

function volumeText(current: number | null | undefined, average: number | null | undefined) {
  if (current == null && average == null) return "volume unavailable";
  if (current == null) return `normal ${compactNumber(average!)} shares`;
  if (average == null) return `${compactNumber(current)} shares today`;
  return `${compactNumber(current)} today vs ${compactNumber(average)} normal`;
}

function volumeTone(ratio: number | null | undefined) {
  if (ratio == null) return "#8c8c95";
  if (ratio >= 1.5) return "#3ecf8e";
  if (ratio < 0.8) return "#f2575c";
  return "#f5c451";
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function pctAwayText(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "entry gap unknown";
  return `${signed(value)}% away`;
}

function discountActionNote(verdict: ValuationVerdictResponse, label: string) {
  const addBack = verdict.rightNow.entryOnlyAt ?? verdict.thePlay.addBackLow ?? verdict.structureBand.discountAnchor;
  const addBackText = addBack != null ? ` Add heavier near ${moneyLabel(addBack, verdict.currency)}.` : " Scale in gradually instead of waiting for a perfect tick.";
  return `${label} zone: start DCA here; this is not a wait-only setup unless new risk appears.${addBackText}`;
}

function percentOnBand(value: number | null | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || max <= min) return 50;
  return clamp(((value - min) / (max - min)) * 100, 3, 97);
}

function validNumbers(...values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function firstNumber(...values: Array<number | null | undefined>) {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
}

const ZONE_ORDER: StructureZone[] = ["deep", "discount", "fair", "expensive", "chasing"];

function zoneIndex(zone: StructureZone): number {
  return ZONE_ORDER.indexOf(zone);
}

// Strategic valuation zones follow the Agent's call. Tactical Kai/Rex setup maps are handled
// separately from actual price-vs-resistance geometry, because BUILDING and CHASING describe
// opposite sides of the trigger.
function zoneFromCall(
  verdict: ValuationVerdictResponse["verdict"],
  action: ValuationVerdictResponse["rightNow"]["action"],
  nowPct: number,
  entryPct: number,
): StructureZone {
  if (verdict === "CHASING" || action === "AVOID") return "chasing";
  if (action === "TRIM") return "expensive";
  if (action === "BUY") return nowPct <= entryPct + 1 ? "deep" : "discount";
  return "fair"; // WAIT / anything else = not a buy today
}

// Nudge the colored-slice boundaries so the "now" marker lands inside the zone the AI called,
// while entry/fair price markers keep their true positions.
function alignZoneBoundaries(bounds: number[], zi: number, nowPct: number): number[] {
  const gap = 1.5;
  const out = bounds.slice();
  for (let i = zi - 1; i >= 0; i--) {
    out[i] = Math.min(out[i], (i === zi - 1 ? nowPct : out[i + 1]) - gap);
  }
  for (let i = zi; i < out.length; i++) {
    out[i] = Math.max(out[i], (i === zi ? nowPct : out[i - 1]) + gap);
  }
  return out.map((value) => clamp(value, 3, 97));
}


function addBackZone(verdict: ValuationVerdictResponse) {
  const { addBackLow, addBackHigh } = verdict.thePlay;
  if (addBackLow != null && addBackHigh != null) return `${moneyLabel(addBackLow, verdict.currency)}-${moneyLabel(addBackHigh, verdict.currency)}`;
  if (addBackLow != null) return moneyLabel(addBackLow, verdict.currency);
  if (addBackHigh != null) return moneyLabel(addBackHigh, verdict.currency);
  return "—";
}

function addBackSub(verdict: ValuationVerdictResponse) {
  const { addBackLow, addBackHigh } = verdict.thePlay;
  const book = verdict.metrics.bookValuePerShare;
  if (book == null || book <= 0 || addBackLow == null || addBackHigh == null) return "";
  return `≈ ${(addBackLow / book).toFixed(2)}–${(addBackHigh / book).toFixed(2)}x book`;
}

function moneyLabel(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const decimals = Number.isInteger(value) ? 0 : 2;
  const fixed = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = value < 0 ? "-" : "";
  if (currency === "THB") return `${sign}฿${fixed}`;
  if (currency === "USD") return `${sign}$${fixed}`;
  return formatCurrency(value, currency);
}
