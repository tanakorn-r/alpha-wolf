import { EmptyPanel, LoadingPanel } from "../../components/ui/panels";
import { AgentSignoff } from "../../components/agents/AgentByline";
import { AgentRecap } from "../../components/agents/AgentRecap";
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

  return <ValuationVerdict verdict={signals.verdict} analyzedAt={signals.analyzedAt} fetching={signals.fetching} onRun={signals.run} onOpen={() => signals.openDetail(signals.ticker)} />;
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
  const title = state === "loading" ? "Reading valuation structure..." : state === "error" ? "Valuation run failed." : "Ready for AI verdict.";
  const body =
    state === "loading"
      ? "Checking current price, book value, yield, stretch, and add-back anchors."
      : state === "error"
        ? "The last run could not complete. Retry the verdict from the same desk card."
        : "Run the valuation desk before committing cash.";
  const buttonLabel = state === "loading" || fetching ? "Running" : state === "error" ? "Retry Verdict" : "AI Verdict";

  if (state === "loading") {
    return <PremiumLoading title={agentLoadingTitle(agentId, "valuation", ticker)} subject={ticker} agentId={agentId} task="valuation" />;
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#2a2a31] bg-[#161619]">
      <div className="border-b border-[#2a2a31] bg-[#1a1a1e] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-[11px]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[11px]">
            <span className="font-mono text-[16px] font-extrabold text-[#ececee]">{ticker}</span>
            <span className="min-w-0 text-[11px] text-[#8c8c95]">Selected ticker · SET</span>
            <span className="rounded-[5px] border border-[#2a2a31] bg-[#0e0e10] px-[10px] py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#8c8c95]">
              Awaiting verdict
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

      <div className="flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.2px] text-[#ececee]">Are you chasing? <span className="text-[#8c8c95]">{title}</span></h2>
          <p className="mt-[6px] max-w-[1320px] text-[12.5px] leading-[1.6] text-[#bcbcc2]">{body}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-2.5">
          <div className="flex flex-none flex-col gap-0.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">Right now · Today</div>
            <div className="text-[18px] font-extrabold tracking-[-0.3px] text-[#8c8c95]">WAIT</div>
          </div>
          <div className="min-w-[180px] flex-1 text-[12.5px] leading-[1.55] text-[#bcbcc2]">
            No buy signal is shown until the AI verdict has run.
          </div>
          <div className="flex flex-none gap-3.5">
            <MiniMetric label="Entry" value="—" note="pending" color="#8c8c95" />
            <MiniMetric label="Conviction" value="—" note="/ 100" color="#8c8c95" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ValuationVerdict({ verdict, analyzedAt, fetching, onRun, onOpen }: { verdict: ValuationVerdictResponse; analyzedAt: string; fetching: boolean; onRun: () => void; onOpen: () => void }) {
  const band = buildStructureBand(verdict);
  const theme = verdictTheme(verdict.verdict, verdict.rightNow.action, band.currentZone);
  const zone = zoneMeta(band.currentZone);
  return (
    <div className="flex flex-col gap-2.5">
      <section className="overflow-hidden rounded-[10px] border bg-[#161619]" style={{ borderColor: theme.cardBorder }}>
        <div className="p-[1.5px]" style={{ background: theme.frame }}>
        <div className="flex flex-wrap items-center gap-2.5 bg-[#1a1a1e] px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-[11px]">
            <span className="font-mono text-[16px] font-extrabold text-[#ececee]">{verdict.symbol}</span>
            <span className="min-w-0 text-[11px] text-[#8c8c95]">{verdict.name}</span>
            <span className="rounded-[5px] border px-[10px] py-[3px] text-[10px] font-bold tracking-[0.04em]" style={{ borderColor: zone.border, color: zone.color, background: zone.bg }}>
              {verdictLabel(verdict.verdict, verdict.rightNow.action, band.currentZone)}
            </span>
          </div>
          <span className="ml-auto flex-none font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
            Last sync {formatAnalyzedAt(analyzedAt)}
          </span>
          <PremiumAiButton label={fetching ? "Running" : "Refresh"} sublabel="Valuation" disabled={fetching} loading={fetching} onClick={onRun} size="xs" />
        </div>
        </div>

        <div className="flex flex-col gap-2.5 p-3.5">
          <AgentRecap agent={verdict.agent} recap={verdict.recap ?? verdict.narrative} fit={verdict.agentFit} reason={verdict.agentFitReason} className="" />
          <MetricGrid verdict={verdict} theme={theme} />
          <StructureBand band={band} />
          <Evidence verdict={verdict} theme={theme} />
          <AgentSignoff agent={verdict.agent} />
        </div>
      </section>
      <div className="pb-0.5 text-center font-mono text-[10px] text-[#5a5a62]">
        AI valuation · cached {formatAnalyzedAt(analyzedAt)} · supplied fundamentals only · not financial advice
      </div>
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
      <MiniMetric label="Conviction" value={String(verdict.rightNow.conviction)} note="/ 100" color={theme.accent} />
      </div>
    </div>
  );
}

function MetricGrid({ verdict, theme }: { verdict: ValuationVerdictResponse; theme: VerdictTheme }) {
  const metrics = verdict.metrics;
  return (
    <div className="grid gap-2.5 min-[760px]:grid-cols-2 min-[1120px]:grid-cols-4">
      <MetricCard label="Current price" value={formatNullableMoney(metrics.currentPrice, verdict.currency)} note={metrics.ytdPct != null ? `${signed(metrics.ytdPct)}% YTD` : "live price"} color="#ececee" />
      <MetricCard label="Book value / sh" value={formatNullableMoney(metrics.bookValuePerShare, verdict.currency)} note="fair-value anchor" color="#ececee" />
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
        <ZoneLabel left={band.deepDiscountLabelLeft} color="#3ecf8e" label="DEEP VALUE" />
        <ZoneLabel left={band.discountLabelLeft} color="#78e6b8" label="DCA DISCOUNT" />
        <ZoneLabel left={band.fairLabelLeft} color="#f5c451" label="FAIR VALUE" />
        <ZoneLabel left={band.expensiveLabelLeft} color="#ff8c91" label="EXPENSIVE" />
        <ZoneLabel left={band.chasingLabelLeft} color="#f2575c" label="CHASE TRAP" />
        <BandMarker left={band.entryPct} color="#3ecf8e" label={band.entryLabel} align="below" />
        <BandMarker left={band.fairPct} color="#8c8c95" label={band.fairLabel} align="below" />
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

function Evidence({ verdict, theme }: { verdict: ValuationVerdictResponse; theme: VerdictTheme }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#5a5a62]">What the AI sees</div>
      <div className="flex flex-col gap-[6px]">
        {verdict.whatAiSees.map((line, index) => (
          <div key={index} className="flex items-start gap-2 text-[12px] leading-[1.55] text-[#bcbcc2]">
            <span className="flex-none font-mono" style={{ color: index === 1 ? "#3ecf8e" : theme.accent }}>→</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

function verdictLabel(verdict: ValuationVerdictResponse["verdict"], action?: ValuationVerdictResponse["rightNow"]["action"], zone?: StructureZone) {
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

// The zone is the AI's call, not geometry. Whatever the agent decided (its verdict + right-now
// action) is the single source of truth for the badge, colors, and the marker — so "wait" can
// never render under a green "discount" badge again.
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
