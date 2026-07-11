import { EmptyPanel, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { AgentSignoff } from "../../components/agents/AgentByline";
import { AgentRecap } from "../../components/agents/AgentRecap";
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

  if (timing.loading) return <LoadingPanel title="Loading buy timing..." body="Reading dividend rhythm and price windows." />;
  if (!timing.rows.length || !row) return <EmptyPanel title="Pick a stock first" body="Buy Timing follows the selected Hunt watchlist ticker." />;
  if (row.pending) return <PremiumLoading title={agentLoadingTitle(hunt.activeAgentId, "timing", row.symbol)} subject={row.symbol} agentId={hunt.activeAgentId} task="timing" />;
  if (row.failed) return <RetryPanel label={`Could not load ${row.symbol} timing data.`} onRetry={row.retry} />;
  if (!row.timing) return <TimingStart symbol={row.symbol} fetching={row.fetching} onRun={row.run} />;

  return <TimingPage timing={row.timing} analyzedAt={row.analyzedAt} refreshing={row.fetching} onRefresh={row.retry} />;
}

function TimingStart({ symbol, fetching, onRun }: { symbol: string; fetching: boolean; onRun: () => void }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#2a2a31] bg-[#1a1a1e] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[15px] font-extrabold text-[#ececee]">{symbol}</div>
        <div className="mt-0.5 text-[11px] text-[#8c8c95]">Run the selected Agent&apos;s buy timing analysis when you are ready.</div>
      </div>
      <PremiumAiButton label={fetching ? "Analyzing" : "AI Buy Timing"} sublabel="Timing" disabled={fetching} loading={fetching} onClick={onRun} size="xs" />
    </section>
  );
}

function TimingPage({ timing, analyzedAt, refreshing, onRefresh }: { timing: BuyTimingResponse; analyzedAt: string; refreshing?: boolean; onRefresh: () => void }) {
  const entryBand = formatEntryBand(timing);
  const dipText = pct(timing.stats.avgPostExDipPct);
  const hitRate = timing.postExDipPattern.hitRate != null ? `${timing.postExDipPattern.hitRate.toFixed(0)}% hit rate` : "thin sample";
  const wait = timing.action === "BUY" ? "Now" : waitText(timing.nextBuy.opensInDays);
  const hasAgentPlan = timing.narrativeSource === "openai" && Boolean(timing.todayInstruction);

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] border border-[#2a2a31] bg-[#0e0e10] px-[10px] py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-[#8c8c95]">
              {timing.narrativeSource === "openai" ? "AI read" : "Calculated"}
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
              Last sync {formatAnalyzedAt(analyzedAt)}
            </span>
            {timing.narrativeSource === "openai" && timing.perspectiveScore != null ? (
              <span className="rounded-[5px] border border-[#c77dff]/35 bg-[#c77dff]/10 px-[8px] py-[3px] font-mono text-[10px] font-bold text-[#c77dff]">
                {timing.agent?.name ?? "Agent"} {timing.perspectiveScore}/100
              </span>
            ) : null}
          </div>
          <PremiumAiButton label={refreshing ? "Refreshing" : "Refresh"} sublabel="Timing" disabled={refreshing} loading={refreshing} onClick={onRefresh} size="xs" />
        </div>
        <AgentRecap agent={timing.agent} recap={timing.recap ?? timing.summary} fit={timing.agentFit} reason={timing.agentFitReason} className="" />
        <div className="mt-3 grid gap-2.5 min-[760px]:grid-cols-3">
          <PlainAnswer label="Today" value={timing.action} detail={timing.todayInstruction ?? (timing.price != null ? `Price now ${formatCurrency(timing.price, timing.currency)}` : currentMonthLabel())} />
          <PlainAnswer label="Next move" value={timing.nextMove ?? wait} detail={timing.nextMoveTiming ?? (timing.nextBuy.label ? `Buy window ${timing.nextBuy.label}` : "Wait for entry price")} />
          <PlainAnswer label="Current setup fit" value={fitLabel(timing.agentFit) ?? priceCheck(timing)} detail={timing.perspectiveReason ?? priceCheckDetail(timing)} />
        </div>
        <div className="mt-3 grid gap-2.5 min-[900px]:grid-cols-2">
          <WindowBox
            tone="buy"
            eyebrow={hasAgentPlan ? "Buy / add only when" : `Next buy point · ${opensText(timing.nextBuy.opensInDays)}`}
            title={hasAgentPlan ? timing.buyCondition! : timing.nextBuy.label ?? "Await ex-div date"}
            body={hasAgentPlan ? `${timing.agent?.name ?? "Agent"} decision rule` : `${dipText} avg post-ex dip · entry band ${entryBand}`}
          />
          <WindowBox
            tone="trim"
            eyebrow={hasAgentPlan ? "Reduce / exit when" : `Next sell / trim point · ${opensText(timing.nextTrim.opensInDays)}`}
            title={hasAgentPlan ? timing.reduceCondition! : timing.nextTrim.label ?? "No trim window yet"}
            body={hasAgentPlan ? `${timing.agent?.name ?? "Agent"} risk rule` : timing.cycle.nextExDate ? `inferred next ex-div ${formatDate(timing.cycle.nextExDate)}` : "waiting for a confirmed next ex-dividend date"}
          />
        </div>
        <AgentSignoff agent={timing.agent} />
      </section>
      <div className="text-center font-mono text-[10px] text-[#5a5a62]">Buy Timing cached {formatAnalyzedAt(analyzedAt)}.</div>

      <section className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-[15px] font-bold">{timing.agentMonthlyPlan?.length ? `${timing.agent?.name ?? "Agent"}'s monthly plan` : "Buy / trim by month"}</div>
          <div className="text-[12px] text-[#5a5a62]">{cycleLabel(timing)} · seasonality is evidence, not a promise</div>
        </div>
        <MonthlyBuyMap timing={timing} />
        <PriceContextRow timing={timing} />
      </section>

      <BacktestStats timing={timing} />

      <section className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3.5">
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

      <section className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3.5">
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

function PlainAnswer({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[9px] border border-[#2a2a31] bg-[#111113] px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">{label}</div>
      <div className="mt-1 text-[13px] font-bold leading-[1.4] text-[#ececee]">{value}</div>
      <div className="mt-1 text-[11px] leading-[1.45] text-[#8c8c95]">{detail}</div>
    </div>
  );
}

function WindowBox({ tone, eyebrow, title, body }: { tone: "buy" | "trim"; eyebrow: string; title: string; body: string }) {
  const color = tone === "buy" ? "#3ecf8e" : "#f5c451";
  return (
    <div className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: `${color}50`, background: tone === "buy" ? "rgba(62,207,142,0.07)" : "rgba(245,196,81,0.06)" }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{eyebrow}</div>
      <div className="mt-1.5 text-[13px] font-bold leading-[1.45] text-[#ececee]">{title}</div>
      <div className="mt-1.5 text-[10.5px] text-[#8c8c95]">{body}</div>
    </div>
  );
}

function MonthlyBuyMap({ timing }: { timing: BuyTimingResponse }) {
  const sizedAgentPlan = timing.agentMonthlyPlan?.length === 12 && timing.agentMonthlyPlan.every((month) => typeof month.buyBudgetPct === "number" && typeof month.trimPositionPct === "number");
  const map = sizedAgentPlan ? timing.agentMonthlyPlan : timing.narrativeSource === "openai" ? null : timing.monthlyMap;
  if (!map || !map.length) return <div className="mt-4 text-[12px] text-[#5a5a62]">Monthly buy/trim map needs a fresh sync.</div>;
  return (
    <div className="mt-5">
      <div className="grid grid-cols-6 gap-1.5 min-[720px]:grid-cols-12">
        {map.map((month) => <MonthCell key={month.month} month={month} year={timing.comparisonYear ?? new Date().getFullYear()} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#8c8c95]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ecf8e]" /> Buy / add</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f2575c]" /> Trim / sell</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f5c451]" /> Ex-dividend</span>
        <span>Avg = historical monthly average · {timing.comparisonYear ?? new Date().getFullYear()} = actual return / current MTD</span>
        <span className="ml-auto">Each buy uses that % of the whole available cash pool—not one month’s deposit</span>
      </div>
    </div>
  );
}

type MonthCellData = NonNullable<BuyTimingResponse["agentMonthlyPlan"]>[number] | NonNullable<BuyTimingResponse["monthlyMap"]>[number];

function MonthCell({ month, year }: { month: MonthCellData; year: number }) {
  const size = "buyBudgetPct" in month ? month.buyBudgetPct || month.trimPositionPct : Math.abs(month.score);
  const tone = cellTone(month.action, Math.min(1, size / 100));
  const sizeLabel = "buyBudgetPct" in month && month.buyBudgetPct > 0 ? `${month.buyBudgetPct}% of pool` : "trimPositionPct" in month && month.trimPositionPct > 0 ? `${month.trimPositionPct}% position` : null;
  const actual = month.currentYearReturnPct;
  const alignment = actual == null || month.returnPct === 0 ? "not available" : Math.sign(actual) === Math.sign(month.returnPct) ? "aligned" : "diverged";
  return (
    <div
      className="relative flex flex-col items-center gap-1 rounded-[8px] border px-1 py-2.5"
      style={{ background: tone.bg, borderColor: month.isCurrent ? "#ececee" : tone.border }}
      title={`${month.month}: ${month.action}${sizeLabel ? ` ${sizeLabel}` : ""} · ${"reason" in month ? month.reason : month.note} · historical avg ${signed(month.returnPct)}% · ${year} ${actual == null ? "not available" : `${signed(actual)}% (${alignment})`}`}
    >
      {month.isCurrent ? (
        <span className="absolute -top-[7px] rounded-[4px] bg-[#ececee] px-1 py-[1px] text-[7px] font-bold uppercase tracking-[0.06em] text-[#0e0e10]">now</span>
      ) : null}
      {month.isExMonth ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f5c451]" /> : null}
      <span className="text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: tone.fg }}>{month.action === "HOLD" ? "HOLD" : month.action === "ADD_SMALL" ? "ADD" : month.action}</span>
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

function fitLabel(fit?: BuyTimingResponse["agentFit"] | null) {
  if (fit === "aligned") return "Buy setup fits";
  if (fit === "against") return "Do not buy now";
  if (fit === "neutral") return "Partial setup only";
  return null;
}

function PriceContextRow({ timing }: { timing: BuyTimingResponse }) {
  const context = timing.priceContext;
  if (!context || context.low == null || context.high == null) return null;
  const pct = clamp(context.currentPct ?? 50, 0, 100);
  const vsAvg = context.vsAvgPct;
  const zone = pct >= 85 ? "near 5-yr high" : pct <= 30 ? "lower part of 5-yr range" : "mid 5-yr range";
  return (
    <div className="mt-4 rounded-[10px] border border-[#2a2a31] bg-[#111113] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8c8c95]">Where price sits in its {context.years ?? 5}-year range</div>
        <div className="text-[12px]" style={{ color: pct >= 85 ? "#f2575c" : pct <= 30 ? "#3ecf8e" : "#8c8c95" }}>
          {zone}{vsAvg != null ? ` · ${signed(vsAvg)}% vs 5-yr avg` : ""}
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

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3 py-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">{label}</div>
      <div className="mt-2 font-mono text-[18px] font-extrabold tracking-[-0.3px]" style={{ color }}>{value}</div>
    </div>
  );
}

function BacktestStats({ timing }: { timing: BuyTimingResponse }) {
  const result = timing.backtest;
  if (!result) return null;
  const edgeColor = result.edgePct >= 0 ? "#3ecf8e" : "#f2575c";
  const cashPct = result.endingValue > 0 ? (result.endingCash / result.endingValue) * 100 : 0;
  const endingExposure = Math.max(0, 100 - cashPct);
  const exposure = result.averageStockExposurePct;
  const exposureGivenUp = Math.max(0, 100 - exposure);
  const drawdownSaved = result.alwaysBuyMaxDrawdownPct - result.strategyMaxDrawdownPct;
  const returnGivenUp = result.alwaysBuyReturnPct - result.strategyReturnPct;
  const fullExposureEquivalent = exposure > 0 ? result.strategyReturnPct / (exposure / 100) : null;
  const agentDividendPct = result.totalContributed > 0 ? result.agentDividendsReceived / result.totalContributed * 100 : 0;
  const dcaDividendPct = result.totalContributed > 0 ? result.alwaysBuyDividendsReinvested / result.totalContributed * 100 : 0;
  const weakProtection = exposureGivenUp >= 20 && drawdownSaved < exposureGivenUp * 0.25;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">5-year monthly-plan backtest</div>
        <div className="text-[10px] text-[#5a5a62]">In-sample simulation · historical result, not a forecast</div>
      </div>
      <div className="grid gap-2.5 min-[820px]:grid-cols-4">
        <StatBox label="Plan return" value={`${signed(result.strategyReturnPct)}%`} color={result.strategyReturnPct >= 0 ? "#3ecf8e" : "#f2575c"} />
        <StatBox label="Buy every month" value={`${signed(result.alwaysBuyReturnPct)}%`} color={result.alwaysBuyReturnPct >= 0 ? "#ececee" : "#f2575c"} />
        <StatBox label="Vs always invested" value={`${signed(result.edgePct)}%`} color={edgeColor} />
        <StatBox label="Cash left at the end" value={`${cashPct.toFixed(0)}%`} color={cashPct > 20 ? "#f5c451" : "#ececee"} />
      </div>
      <div className="mt-2 text-[10px] leading-[1.5] text-[#5a5a62]">
        {result.edgePct < 0 && cashPct > 5
          ? `Full DCA won this history partly because the Agent finished with ${cashPct.toFixed(0)}% in cash. The plan deployed in ${result.investedMonths} of ${result.observedMonths} months; delayed cash missed part of the stock's rise.`
          : `The plan deployed in ${result.investedMonths} of ${result.observedMonths} months. Held shares revalue across the full history, while unused and trimmed money remains available cash.`} {`“25% of pool” is applied repeatedly to all cash available at that month-end, so later buys also consume money left by earlier HOLD months. The ending ${cashPct.toFixed(0)}% is the remaining cash divided by the final account value—not the unused share of one monthly deposit.`}
      </div>
      {(result.agentDividendsReceived > 0 || result.alwaysBuyDividendsReinvested > 0) ? (
        <div className="mt-2 rounded-[9px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.05] px-3 py-2.5 text-[10.5px] leading-[1.55] text-[#a9a9b2]">
          <b className="text-[#3ecf8e]">Dividends added {result.strategyDividendReturnBoostPct.toFixed(1)} points to the Agent’s return.</b> Without dividends the plan returned {signed(result.strategyReturnWithoutDividendsPct)}%; with accumulated dividends it returned {signed(result.strategyReturnPct)}%. The Agent received dividends equal to {agentDividendPct.toFixed(1)}% of contributed capital and kept them in its pool for later buys. DCA reinvestment added {result.alwaysBuyDividendReturnBoostPct.toFixed(1)} return points. Gross payments are larger than return benefit because contributions arrived gradually and some dividend cash waited before deployment.
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
        {fullExposureEquivalent != null ? (
          <div className="mt-2 border-t border-white/[0.07] pt-2 text-[10.5px] leading-[1.55] text-[#a9a9b2]">
            <b className="text-[#ececee]">Capital-efficiency estimate:</b> the Agent earned {signed(result.strategyReturnPct)}% at {exposure.toFixed(0)}% average exposure. Scaled roughly to full exposure, that is <b className={fullExposureEquivalent >= result.alwaysBuyReturnPct ? "text-[#3ecf8e]" : "text-[#f5c451]"}>{signed(fullExposureEquivalent)}%</b> versus DCA’s {signed(result.alwaysBuyReturnPct)}%. This is a sizing estimate—not a simulated result—and full loading would also amplify losses and drawdown.
          </div>
        ) : null}
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

function formatEntryBand(timing: BuyTimingResponse) {
  const low = timing.entryBand.low;
  const high = timing.entryBand.high;
  if (low == null && high == null) return "n/a";
  if (low != null && high != null && low !== high) return `${formatCurrency(low, timing.currency)}-${formatCurrency(high, timing.currency)}`;
  return formatCurrency(low ?? high ?? 0, timing.currency);
}

function cycleLabel(timing: BuyTimingResponse) {
  if (!timing.cycle.cycleDays) return "No clear dividend calendar yet";
  if (timing.cycle.confidence === "estimated_annual") return "Estimated from the last dividend month";
  return `${timing.cycle.cycleDays}-day dividend rhythm from history`;
}

function opensText(days?: number | null) {
  if (days == null) return "date not confirmed";
  if (days < 0) return "open now";
  if (days === 0) return "opens today";
  return `opens in ${days} days`;
}

function pct(value?: number | null) {
  return value == null ? "n/a" : `${value.toFixed(1)}%`;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function waitText(days?: number | null) {
  if (days == null) return "Watch entry";
  if (days <= 0) return "Now";
  if (days < 31) return `${days} days`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
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

function currentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
