import { useEffect, useState } from "react";
import { EmptyPanel, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { AgentCall } from "../../components/agents/AgentCall";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import type { BuyTimingResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { clamp, formatAnalyzedAt } from "./lib";
import { agentLoadingTitle, PremiumLoading } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function BuyTimingTab({ hunt }: { hunt: HuntAi }) {
  const timing = hunt.timing;
  const activeSymbol = hunt.watchlist.activeTicker;
  const row = timing.rows.find((item) => item.symbol === activeSymbol) ?? timing.rows[0];
  const [forcedLoading, setForcedLoading] = useState<{ symbol: string; startedAt: number } | null>(null);
  const rowSymbol = row?.symbol;
  const requestLoading = Boolean(row?.pending || row?.fetching);
  const forcedLoadingMatches = Boolean(rowSymbol && forcedLoading?.symbol === rowSymbol);

  useEffect(() => {
    if (!forcedLoading) return;
    if (!rowSymbol || forcedLoading.symbol !== rowSymbol) {
      setForcedLoading(null);
      return;
    }
    if (requestLoading) return;
    const remaining = Math.max(0, 700 - (Date.now() - forcedLoading.startedAt));
    const timer = window.setTimeout(() => setForcedLoading(null), remaining);
    return () => window.clearTimeout(timer);
  }, [forcedLoading, requestLoading, rowSymbol]);

  const runWithLoading = (run: () => void) => {
    if (!row) return;
    setForcedLoading({ symbol: row.symbol, startedAt: Date.now() });
    run();
  };

  if (timing.loading) return <LoadingPanel title="Loading buy timing..." body="Reading dividend rhythm and price windows." />;
  if (!timing.rows.length || !row) return <EmptyPanel title="Pick a stock first" body="Buy Timing follows the selected Hunt watchlist ticker." />;
  if (requestLoading || forcedLoadingMatches) return <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "timing", row.symbol)} subject={row.symbol} agentId={hunt.activeAgentId} task="timing" />;
  if (row.failed) return <RetryPanel label={row.error || `Could not load ${row.symbol} timing data.`} onRetry={() => runWithLoading(row.retry)} />;
  if (!row.timing) return <TimingStart symbol={row.symbol} fetching={row.fetching} onRun={() => runWithLoading(row.run)} />;

  return <TimingPage timing={row.timing} analyzedAt={row.analyzedAt} onRefresh={() => runWithLoading(row.retry)} />;
}

function TimingStart({ symbol, fetching, onRun }: { symbol: string; fetching: boolean; onRun: () => void }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#1a1a1e] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[15px] font-extrabold text-[#ececee]">{symbol}</div>
        <div className="mt-0.5 text-[11px] text-[#8c8c95]">Run the selected Agent&apos;s buy timing analysis when you are ready.</div>
      </div>
      <PremiumAiButton label={fetching ? "Analyzing" : "AI Buy Timing"} sublabel="Timing" disabled={fetching} loading={fetching} onClick={onRun} size="xs" />
    </section>
  );
}

function TimingPage({ timing, analyzedAt, onRefresh }: { timing: BuyTimingResponse; analyzedAt: string; onRefresh: () => void }) {
  const hitRate = timing.postExDipPattern.hitRate != null ? `${timing.postExDipPattern.hitRate.toFixed(0)}% hit rate` : "thin sample";
  const strategyQuote = timing.strategyQuote ?? timing.agentFitReason ?? timing.summary ?? timing.headline;
  const bullets = [
    <><b>Capital plan — </b>{overallPlanSummary(timing)}</>,
    <><b>Increase size — </b>{compactCopy(timing.buyCondition ?? "Increase only when the Agent's company and industry evidence strengthens.")}</>,
    <><b>Reduce only if — </b>{compactCopy(timing.reduceCondition ?? timing.thesisBreaker ?? "Reduce when the Agent's controlling thesis or risk rule fails.")}</>,
  ];

  return (
    <div className="flex flex-col gap-3">
      <AgentCall
        agent={timing.agent}
        label={`Overall strategy for ${timing.symbol}`}
        score={timing.perspectiveScore}
        scoreLabel="philosophy fit"
        signal={`${strategyMandate(timing.agent?.id)} · ${fitSignal(timing.agentFit)}`}
        headline={overallStrategyHeadline(timing)}
        summary={<span>“{strategyQuote}”</span>}
        bullets={bullets}
        accent={timing.agent?.color}
        meta={`AI-generated ${formatAnalyzedAt(analyzedAt)} · historical evidence · not financial advice`}
        onRerun={onRefresh}
        signoff={false}
        density="compact"
      />

      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#686870]">1 · Executable strategy</div>
            <div className="mt-1 text-[15px] font-bold">{timing.agentMonthlyPlan?.length ? `${timing.agent?.name ?? "Agent"}'s monthly plan` : "Seasonality evidence by month"}</div>
          </div>
          <div className="text-[12px] text-[#5a5a62]">{cycleLabel(timing)} · {timing.agentMonthlyPlan?.length ? "seasonality is evidence, not a promise" : "evidence only — not an Agent order"}</div>
        </div>
        <MonthlyBuyMap timing={timing} />
        <PriceContextRow timing={timing} />
      </section>

      <BacktestStats timing={timing} />

      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold">5-year seasonality · avg monthly return</div>
            <div className="mt-1 text-[12px] text-[#5a5a62]">Measured from historical monthly closes, not generated.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-[7px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 px-3 py-1 text-[11px] font-bold text-[#3ecf8e]">Cheapest: {timing.cheapestMonth ?? "n/a"}</span>
            <span className="rounded-[7px] border border-[#f5c451]/30 bg-[#f5c451]/10 px-3 py-1 text-[11px] font-bold text-[#f5c451]">Peaks: {timing.peakMonth ?? "n/a"}</span>
          </div>
        </div>
        <SeasonalityChart values={timing.seasonality} cheapestMonth={timing.cheapestMonth ?? ""} peakMonth={timing.peakMonth ?? ""} />
      </section>

      <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Calculation drivers</div>
        <div className="grid gap-3 text-[12.5px] text-[#bcbcc2] min-[760px]:grid-cols-3">
          <Driver label="Post-ex pattern" value={`${hitRate} · sample ${timing.postExDipPattern.sampleSize}`} />
          <Driver label="Current setup" value={`${timing.action} · ${priceCheckDetail(timing)}`} />
          <Driver label="Price now" value={timing.price != null ? formatCurrency(timing.price, timing.currency) : "n/a"} />
        </div>
      </section>
    </div>
  );
}

function compactCopy(value: string, maxLength = 155) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const preview = text.slice(0, maxLength + 1);
  const sentenceEnd = preview.lastIndexOf(". ");
  if (sentenceEnd >= 72) return preview.slice(0, sentenceEnd + 1);

  const wordEnd = text.slice(0, maxLength).lastIndexOf(" ");
  return `${text.slice(0, wordEnd >= 80 ? wordEnd : maxLength).trim()}…`;
}

function overallPlanSummary(timing: BuyTimingResponse) {
  const plan = timing.agentMonthlyPlan;
  if (!plan?.length) return compactCopy(timing.nextMove ?? timing.summary);

  const funded = plan.filter((month) => (month.action === "BUY" || month.action === "ADD_SMALL") && month.buyBudgetPct > 0);
  const holds = plan.filter((month) => month.action === "HOLD");
  const exits = plan.filter((month) => (month.action === "TRIM" || month.action === "SELL") && month.trimPositionPct > 0);
  const tactical = ["rex", "kai"].includes(timing.agent?.id ?? "");

  if (tactical) {
    const entryText = funded.length ? `Enter tactically in ${monthList(funded.map((month) => month.month))}` : "Keep tactical cash available until the setup confirms";
    const exitText = exits.length ? `reduce or exit in ${monthList(exits.map((month) => month.month))}` : "exit when the live trade rule fails";
    return compactCopy(`${entryText}; ${exitText}.`);
  }

  const parts = [funded.length ? `Keep capital working in ${funded.length} of 12 months` : "Keep new capital reserved"];
  if (holds.length) parts.push(holds.length <= 4 ? `pause new money in ${monthList(holds.map((month) => month.month))}` : `pause new money in ${holds.length} months`);

  const largestSize = funded.reduce((largest, month) => Math.max(largest, month.buyBudgetPct), 0);
  const largestMonths = funded.filter((month) => month.buyBudgetPct === largestSize).map((month) => month.month);
  if (largestMonths.length && largestMonths.length <= 3) parts.push(`make ${monthList(largestMonths)} the largest installment${largestMonths.length > 1 ? "s" : ""}`);
  if (exits.length) parts.push(`plan reductions in ${monthList(exits.map((month) => month.month))}`);
  return compactCopy(`${parts.join("; ")}.`);
}

function monthList(months: string[]) {
  if (months.length <= 1) return months[0] ?? "none";
  if (months.length === 2) return `${months[0]} and ${months[1]}`;
  return `${months.slice(0, -1).join(", ")}, and ${months.at(-1)}`;
}

function MonthlyBuyMap({ timing }: { timing: BuyTimingResponse }) {
  const sizedAgentPlan = timing.agentMonthlyPlan?.length === 12 && timing.agentMonthlyPlan.every((month) => typeof month.buyBudgetPct === "number" && typeof month.trimPositionPct === "number");
  const evidenceOnly = !sizedAgentPlan;
  const map = sizedAgentPlan ? timing.agentMonthlyPlan : timing.narrativeSource === "openai" ? null : timing.monthlyMap;
  if (!map || !map.length) return <div className="mt-4 text-[12px] text-[#5a5a62]">Monthly buy/trim map needs a fresh sync.</div>;
  return (
    <div className="mt-5">
      <div className="grid grid-cols-6 gap-1.5 min-[720px]:grid-cols-12">
        {map.map((month) => <MonthCell key={month.month} month={month} year={timing.comparisonYear ?? new Date().getFullYear()} evidenceOnly={evidenceOnly} tacticalSizing={["rex", "kai"].includes(timing.agent?.id ?? "")} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#8c8c95]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ecf8e]" /> {evidenceOnly ? "Favorable evidence" : "Buy / add"}</span>
        <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${evidenceOnly ? "bg-[#f5c451]" : "bg-[#f2575c]"}`} /> {evidenceOnly ? "Caution evidence" : "Trim / sell"}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f5c451]" /> Ex-dividend</span>
        <span>Avg = historical monthly average · {timing.comparisonYear ?? new Date().getFullYear()} = actual return / current MTD</span>
        <span className="ml-auto">{evidenceOnly ? "Refresh to generate the selected Agent’s executable plan" : ["rex", "kai"].includes(timing.agent?.id ?? "") ? "Tactical buy % = available strategy cash" : "Buy % sizes this month; high-conviction strategic owners may also redeploy reserve"}</span>
      </div>
    </div>
  );
}

type MonthCellData = NonNullable<BuyTimingResponse["agentMonthlyPlan"]>[number] | NonNullable<BuyTimingResponse["monthlyMap"]>[number];

function MonthCell({ month, year, evidenceOnly = false, tacticalSizing = false }: { month: MonthCellData; year: number; evidenceOnly?: boolean; tacticalSizing?: boolean }) {
  const size = "buyBudgetPct" in month ? month.buyBudgetPct || month.trimPositionPct : Math.abs(month.score);
  const tone = evidenceOnly && month.action === "TRIM" ? { fg: "#f5c451", bg: "rgba(245,196,81,0.14)", border: "rgba(245,196,81,0.42)" } : cellTone(month.action, Math.min(1, size / 100));
  const sizeLabel = "buyBudgetPct" in month && month.buyBudgetPct > 0 ? `${month.buyBudgetPct}% ${tacticalSizing ? "cash" : "monthly"}` : "trimPositionPct" in month && month.trimPositionPct > 0 ? `${month.trimPositionPct}% position` : null;
  const actual = month.currentYearReturnPct;
  const alignment = actual == null || month.returnPct === 0 ? "not available" : Math.sign(actual) === Math.sign(month.returnPct) ? "aligned" : "diverged";
  return (
    <div
      className="relative flex flex-col items-center gap-1 rounded-[8px] border px-1 py-2.5"
      style={{ background: tone.bg, borderColor: month.isCurrent ? "#ececee" : tone.border }}
      title={`${month.month}: ${evidenceOnly ? "evidence only" : month.action}${sizeLabel ? ` ${sizeLabel}` : ""} · ${"reason" in month ? month.reason : month.note} · historical avg ${signed(month.returnPct)}% · ${year} ${actual == null ? "not available" : `${signed(actual)}% (${alignment})`}`}
    >
      {month.isCurrent ? (
        <span className="absolute -top-[7px] rounded-[4px] bg-[#ececee] px-1 py-[1px] text-[7px] font-bold uppercase tracking-[0.06em] text-[#0e0e10]">now</span>
      ) : null}
      {month.isExMonth ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f5c451]" /> : null}
      <span className="text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: tone.fg }}>{evidenceOnly ? (month.action === "BUY" ? "FAVORABLE" : month.action === "TRIM" ? "CAUTION" : "NEUTRAL") : month.action === "HOLD" ? "HOLD" : month.action === "ADD_SMALL" ? "ADD" : month.action}</span>
      <span className="font-mono text-[12px] font-bold text-[#ececee]">{month.month}</span>
      {sizeLabel ? <span className="text-[8px] font-semibold text-[#bcbcc2]">{sizeLabel}</span> : null}
      <span className="font-mono text-[8.5px] text-[#8c8c95]">Avg {signed(month.returnPct)}%</span>
      <span className="font-mono text-[8.5px]" style={{ color: actual == null ? "#5a5a62" : actual >= 0 ? "#3ecf8e" : "#f2575c" }}>Y{year} {actual == null ? "—" : `${signed(actual)}%`}</span>
    </div>
  );
}

function cellTone(action: MonthCellData["action"], intensity: number) {
  const alpha = 0.1 + intensity * 0.42;
  if (action === "BUY" || action === "ADD_SMALL") return { fg: "#3ecf8e", bg: `rgba(62,207,142,${alpha})`, border: "rgba(62,207,142,0.42)" };
  if (action === "TRIM" || action === "SELL") return { fg: "#f2575c", bg: `rgba(242,87,92,${alpha})`, border: "rgba(242,87,92,0.42)" };
  return { fg: "#8c8c95", bg: "rgba(90,90,98,0.10)", border: "#2a2a31" };
}

function fitSignal(fit?: BuyTimingResponse["agentFit"] | null) {
  if (fit === "aligned") return "ALIGNED";
  if (fit === "against") return "CONFLICT";
  return "MIXED";
}

function strategyMandate(agentId?: string | null) {
  const mandates: Record<string, string> = {
    vera: "VALUE OWNER",
    ben: "LONG-TERM OWNER",
    sam: "INCOME OWNER",
    rex: "SWING PLAN",
    kai: "MOMENTUM PLAN",
    nadia: "QUANT ALLOCATION",
    alphawolf: "HYBRID PLAN",
  };
  return mandates[agentId ?? ""] ?? "CAPITAL PLAN";
}

function overallStrategyHeadline(timing: BuyTimingResponse) {
  const symbol = timing.symbol;
  const agentId = timing.agent?.id ?? "";
  if (timing.agentFit === "against") {
    return `Keep ${symbol} outside this ${strategyMandate(agentId).toLowerCase()} until the core thesis changes`;
  }
  const headlines: Record<string, string> = {
    vera: `Build ${symbol} selectively as a valuation-led owner`,
    ben: `Own ${symbol} for long-term compounding`,
    sam: `Build ${symbol} around durable income`,
    rex: `Trade ${symbol} as a defined swing`,
    kai: `Trade ${symbol} only with confirmed momentum`,
    nadia: `Allocate to ${symbol} through measured edge and risk`,
    alphawolf: `Blend ownership and timing for ${symbol}`,
  };
  return headlines[agentId] ?? `Follow a disciplined capital plan for ${symbol}`;
}

function PriceContextRow({ timing }: { timing: BuyTimingResponse }) {
  const context = timing.priceContext;
  if (!context || context.low == null || context.high == null) return null;
  const pct = clamp(context.currentPct ?? 50, 0, 100);
  const vsAvg = context.vsAvgPct;
  const years = context.years ?? 5;
  const zone = pct >= 85 ? `near ${years}-yr high` : pct <= 30 ? `lower part of ${years}-yr range` : `mid ${years}-yr range`;
  return (
    <div className="mt-4 rounded-[10px] border border-[#2a2a31] bg-[#111113] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Where price sits in its {context.years ?? 5}-year range</div>
        <div className="text-[12px]" style={{ color: pct >= 85 ? "#f2575c" : pct <= 30 ? "#3ecf8e" : "#8c8c95" }}>
          {zone}{vsAvg != null ? ` · ${signed(vsAvg)}% vs ${years}-yr avg` : ""}
        </div>
      </div>
      <div className="relative mt-4 h-[8px] rounded-full bg-[linear-gradient(90deg,#3ecf8e33,#2a2a31,#f2575c33)]">
        <div className="absolute top-[-4px] h-[16px] w-[2px] bg-[#ececee]" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-[#666670]">
        <span>{formatCurrency(context.low, timing.currency)} low</span>
        <span>{context.avgPrice != null ? `${formatCurrency(context.avgPrice, timing.currency)} avg` : ""}</span>
        <span>{formatCurrency(context.high, timing.currency)} high</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, color, emphasized = false }: { label: string; value: string; color: string; emphasized?: boolean }) {
  return (
    <div
      className="rounded-[10px] border bg-[#161619] px-3 py-3"
      style={emphasized ? { borderColor: `${color}66`, backgroundColor: `${color}0D` } : { borderColor: "#2a2a31" }}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: emphasized ? color : "#8c8c95" }}>{label}</div>
      <div className="mt-2 font-mono text-[18px] font-extrabold tracking-[-0.3px]" style={{ color }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[8px] border border-white/[0.07] bg-[#111113] px-2.5 py-2" title={hint}>
      <div className="text-[8px] font-bold uppercase tracking-[0.06em] text-[#686870]">{label}</div>
      <div className="mt-1 font-mono text-[12px] font-bold text-[#cfcfd4]">{value}</div>
    </div>
  );
}

function BacktestStats({ timing }: { timing: BuyTimingResponse }) {
  const result = timing.backtest;
  if (!result) return null;
  if (!timing.agentMonthlyPlan?.length) {
    return <div className="rounded-[var(--aw-radius-card)] border border-[#f5c451]/25 bg-[#f5c451]/[0.06] px-4 py-3 text-[11px] leading-[1.55] text-[#d5c28c]"><b className="text-[#f5c451]">Agent backtest unavailable.</b> The visible calendar is mechanical seasonality/dividend evidence, not an executable Agent plan, so its generic BUY/TRIM simulation is intentionally hidden. Refresh to generate the selected Agent’s plan.</div>;
  }
  const cashPct = result.endingValue > 0 ? (result.endingCash / result.endingValue) * 100 : 0;
  const endingExposure = Math.max(0, 100 - cashPct);
  const exposure = result.averageStockExposurePct;
  const normalizedReturn = result.exposureNormalizedReturnPct;
  const normalizedEdge = normalizedReturn == null ? null : normalizedReturn - result.alwaysBuyReturnPct;
  const battlefield = result.battlefield;
  const battlefieldVerdict = battlefield?.verdict ?? (normalizedEdge == null ? "MATCH" : normalizedEdge > 0 ? "WIN" : "LOSS");
  const battlefieldColor = battlefieldVerdict === "WIN" ? "#3ecf8e" : battlefieldVerdict === "LOSS" ? "#f2575c" : "#ececee";
  const primaryValue = battlefield?.primaryValue ?? normalizedReturn;
  const benchmarkValue = battlefield?.benchmarkValue ?? result.alwaysBuyReturnPct;
  const edgeValue = battlefield?.edgeValue ?? normalizedEdge;
  const metricUnit = battlefield?.unit ?? "percent";
  const metricValue = (value: number | null | undefined) => value == null ? "—" : metricUnit === "ratio" ? `${value.toFixed(2)}x` : `${signed(value)}%`;
  const edgeLabel = battlefield
    ? `${battlefieldVerdict === "WIN" ? "Won" : battlefieldVerdict === "LOSS" ? "Lost" : "Matched"} · ${battlefield.label}`
    : battlefieldVerdict === "WIN" ? "AI beat DCA" : battlefieldVerdict === "LOSS" ? "AI trailed DCA" : "AI matched DCA";
  const exposureGivenUp = Math.max(0, 100 - exposure);
  const drawdownSaved = result.alwaysBuyMaxDrawdownPct - result.strategyMaxDrawdownPct;
  const returnGivenUp = result.alwaysBuyReturnPct - result.strategyReturnPct;
  const agentDividendPct = result.totalContributed > 0 ? result.agentDividendsReceived / result.totalContributed * 100 : 0;
  const dcaDividendPct = result.totalContributed > 0 ? result.alwaysBuyDividendsReinvested / result.totalContributed * 100 : 0;
  const weakProtection = exposureGivenUp >= 20 && drawdownSaved < exposureGivenUp * 0.25;
  const limitedSample = result.observedMonths < 36;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">{result.years}-year monthly-plan backtest</div>
        <div className="text-[10px] text-[#5a5a62]">In-sample simulation · historical result, not a forecast</div>
      </div>
      {limitedSample ? (
        <div className="mb-2 rounded-[9px] border border-[#f5c451]/25 bg-[#f5c451]/[0.06] px-3 py-2.5 text-[10.5px] leading-[1.5] text-[#d5c28c]">
          <b className="text-[#f5c451]">Limited history: only {result.observedMonths} months.</b> Calendar-month averages may contain just one observation, so this comparison is descriptive—not reliable evidence of timing skill.
        </div>
      ) : null}
      <div className="grid gap-2.5 min-[820px]:grid-cols-4">
        <StatBox
          label={battlefield?.primaryMetricLabel ?? "AI return · 100% exposure"}
          value={metricValue(primaryValue)}
          color={primaryValue == null ? "#ececee" : primaryValue >= 0 ? "#3ecf8e" : "#f2575c"}
        />
        <StatBox label={battlefield?.benchmarkLabel ?? "DCA return · 100% exposure"} value={metricValue(benchmarkValue)} color="#ececee" />
        <StatBox
          label={edgeLabel}
          value={edgeValue == null ? "—" : metricUnit === "ratio" ? `${signed(edgeValue)}x` : `${signed(edgeValue)} pts`}
          color={battlefieldColor}
          emphasized={edgeValue != null}
        />
        <StatBox label="AI average exposure" value={`${exposure.toFixed(0)}%`} color={exposure < 50 ? "#f5c451" : "#ececee"} />
      </div>
      <div className="mt-2 grid gap-1.5 min-[620px]:grid-cols-3">
        <MiniStat
          label="Actual funded-plan return"
          value={`${signed(result.strategyReturnPct)}%`}
          hint="The return actually produced by the monthly plan, including months when capital remained in cash."
        />
        <MiniStat
          label="Money-weighted · annual"
          value={result.strategyMoneyWeightedReturnPct == null ? "—" : `${signed(result.strategyMoneyWeightedReturnPct)}%`}
          hint="XIRR from each dated monthly contribution and the ending account value."
        />
        <MiniStat
          label="Cash left at the end"
          value={`${cashPct.toFixed(0)}%`}
          hint="Remaining cash reserve divided by the final account value."
        />
      </div>
      <div className="mt-2 text-[10px] leading-[1.5] text-[#5a5a62]">
        {battlefield ? <><b className="text-[#8c8c95]">Battlefield: {battlefield.objective}</b> {battlefield.explanation} </> : null}
        Exposure-normalized return remains an estimate—actual plan return divided by average stock exposure—not a simulated fully invested portfolio. {`The plan deployed in ${result.investedMonths} of ${result.observedMonths} months. For owners, a “25%” buy invests one quarter of that month's delegated contribution, while 75%/100% may redeploy reserve. Rex and Kai size the available tactical cash instead.`}
      </div>
      {(result.agentDividendsReceived > 0 || result.alwaysBuyDividendsReinvested > 0) ? (
        <div className="mt-2 rounded-[9px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.05] px-3 py-2.5 text-[10.5px] leading-[1.55] text-[#a9a9b2]">
          <b className="text-[#3ecf8e]">Dividends added {result.strategyDividendReturnBoostPct.toFixed(1)} points to the Agent’s return.</b> Without dividends the plan returned {signed(result.strategyReturnWithoutDividendsPct)}%; with dividends it returned {signed(result.strategyReturnPct)}%. The Agent received dividends equal to {agentDividendPct.toFixed(1)}% of contributed capital and {(result.agentDividendsReinvested ?? 0) > 0 ? "reinvested them according to its long-term mandate" : "kept them as tactical cash reserve"}. DCA reinvestment added {result.alwaysBuyDividendReturnBoostPct.toFixed(1)} return points.
        </div>
      ) : null}
      <div className={`mt-2 rounded-[9px] border px-3 py-3 ${weakProtection ? "border-[#f2575c]/30 bg-[#f2575c]/[0.07]" : "border-[#f5c451]/20 bg-[#f5c451]/[0.06]"}`}>
        <div className={`text-[9.5px] font-bold uppercase tracking-[0.06em] ${weakProtection ? "text-[#f2575c]" : "text-[#f5c451]"}`}>
          {weakProtection ? "Weak protection — too much upside sacrificed" : "The real cost of downside protection"}
        </div>
        <div className="mt-1.5 text-[13px] font-bold leading-[1.45] text-[#ececee]">
          This plan averaged {exposure.toFixed(0)}% stock exposure across all {result.observedMonths} months and ended {endingExposure.toFixed(0)}% invested / {cashPct.toFixed(0)}% cash. It reduced the worst drawdown by {Math.max(0, drawdownSaved).toFixed(1)} percentage points.
        </div>
        <div className="mt-1 text-[10.5px] leading-[1.55] text-[#a9a9b2]">
          Normal DCA fell {result.alwaysBuyMaxDrawdownPct.toFixed(1)}% peak-to-trough versus {result.strategyMaxDrawdownPct.toFixed(1)}% for the Agent. {returnGivenUp > 0 ? `That modest protection cost ${returnGivenUp.toFixed(1)} percentage points of return.` : "The Agent did not sacrifice return in this history."} {weakProtection ? `Keeping ${exposureGivenUp.toFixed(0)}% out of the stock for so little drawdown relief was an inefficient use of cash.` : "The reserve provided measurable protection, but the return trade-off still matters."}
        </div>
      </div>
    </section>
  );
}

function SeasonalityChart({ values, cheapestMonth, peakMonth }: { values: Array<{ month: string; returnPct: number }>; cheapestMonth: string; peakMonth: string }) {
  const max = Math.max(...values.map((value) => Math.abs(value.returnPct)), 1);
  return (
    <div className="grid h-[140px] grid-cols-12 items-end gap-1.5">
      {values.map((value) => {
        const positive = value.returnPct >= 0;
        const height = 18 + (Math.abs(value.returnPct) / max) * 72;
        const color = positive ? "#2f8b63" : "#a23e44";
        const isCheapest = value.month === cheapestMonth;
        const isPeak = value.month === peakMonth;
        return (
          <div key={value.month} className="flex h-full flex-col items-center justify-end gap-2">
            <div className="font-mono text-[11px]" style={{ color: positive ? "#3ecf8e" : "#f2575c" }}>{signed(value.returnPct)}</div>
            <div className="w-full rounded-t-[5px]" style={{ height: `${height}%`, background: color, opacity: isCheapest || isPeak ? 1 : 0.88 }} />
            <div className="text-[10px] font-semibold" style={{ color: isCheapest ? "#3ecf8e" : isPeak ? "#f5c451" : "#8c8c95" }}>{value.month}</div>
          </div>
        );
      })}
    </div>
  );
}

function Driver({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#2a2a31] bg-[#111113] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[#666670]">{label}</div>
      <div className="mt-1 font-medium text-[#ececee]">{value}</div>
    </div>
  );
}

function cycleLabel(timing: BuyTimingResponse) {
  if (!timing.cycle.cycleDays) return "No clear dividend calendar yet";
  if (timing.cycle.confidence === "estimated_annual") return "Estimated from the last dividend month";
  return `${timing.cycle.cycleDays}-day dividend rhythm from history`;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function priceCheck(timing: BuyTimingResponse) {
  if (timing.entryBand.isAtOrBelowEntry) return "Low enough";
  if (timing.entryBand.gapPct == null) return "Use entry";
  return "Too high";
}

function priceCheckDetail(timing: BuyTimingResponse) {
  const gap = timing.entryBand.gapPct;
  const upside = timing.entryBand.upsideLeftPct;
  if (gap == null && upside == null) return "Calendar is context; entry price decides";
  const gapText = gap == null ? "entry n/a" : `entry ${signed(gap)}% from now`;
  const upsideText = upside == null ? "upside n/a" : `upside ${signed(upside)}%`;
  if (timing.entryBand.isAtOrBelowEntry) return `${gapText}, ${upsideText}`;
  return `wait for red/pullback: ${gapText}, ${upsideText}`;
}
