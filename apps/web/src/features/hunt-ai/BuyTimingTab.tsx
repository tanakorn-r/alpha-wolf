import { EmptyPanel, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { AgentSignoff } from "../../components/agents/AgentByline";
import { AgentRecap } from "../../components/agents/AgentRecap";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import type { BuyTimingResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { clamp, formatAnalyzedAt } from "./lib";
import type { HuntAi } from "./useHuntAi";

export function BuyTimingTab({ hunt }: { hunt: HuntAi }) {
  const timing = hunt.timing;
  const activeSymbol = hunt.watchlist.activeTicker;
  const row = timing.rows.find((item) => item.symbol === activeSymbol) ?? timing.rows[0];

  if (timing.loading) return <LoadingPanel title="Loading buy timing..." body="Reading dividend rhythm and price windows." />;
  if (!timing.rows.length || !row) return <EmptyPanel title="Pick a stock first" body="Buy Timing follows the selected Hunt watchlist ticker." />;
  if (row.pending) return <LoadingPanel title={`Mapping ${row.symbol} timing...`} body="Measuring real ex-dividend dips and seasonal returns." />;
  if (row.failed || !row.timing) return <RetryPanel label={`Could not load ${row.symbol} timing data.`} onRetry={row.retry} />;

  return <TimingPage timing={row.timing} analyzedAt={row.analyzedAt} refreshing={row.fetching} onRefresh={row.retry} />;
}

function TimingPage({ timing, analyzedAt, refreshing, onRefresh }: { timing: BuyTimingResponse; analyzedAt: string; refreshing?: boolean; onRefresh: () => void }) {
  const entryBand = formatEntryBand(timing);
  const dipText = pct(timing.stats.avgPostExDipPct);
  const hitRate = timing.postExDipPattern.hitRate != null ? `${timing.postExDipPattern.hitRate.toFixed(0)}% hit rate` : "thin sample";
  const trimBody = timing.cycle.nextExDate ? `inferred next ex-div ${formatDate(timing.cycle.nextExDate)}` : "waiting for a confirmed next ex-dividend date";
  const wait = timing.action === "BUY" ? "Now" : waitText(timing.nextBuy.opensInDays);

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
          </div>
          <PremiumAiButton label={refreshing ? "Refreshing" : "Refresh"} sublabel="Timing" disabled={refreshing} loading={refreshing} onClick={onRefresh} size="xs" />
        </div>
        <AgentRecap agent={timing.agent} recap={timing.recap ?? timing.summary} fit={timing.agentFit} reason={timing.agentFitReason} className="" />
        <div className="mt-3 grid gap-2.5 min-[760px]:grid-cols-3">
          <PlainAnswer label="Today" value={currentMonthLabel()} detail={timing.price != null ? `Price now ${formatCurrency(timing.price, timing.currency)}` : "Current month"} />
          <PlainAnswer label="Best wait" value={wait} detail={timing.nextBuy.label ? `Buy window ${timing.nextBuy.label}` : "Wait for entry price"} />
          <PlainAnswer label="Price check" value={priceCheck(timing)} detail={priceCheckDetail(timing)} />
        </div>
        <div className="mt-3 grid gap-2.5 min-[900px]:grid-cols-2">
          <WindowBox
            tone="buy"
            eyebrow={`Next buy point · ${opensText(timing.nextBuy.opensInDays)}`}
            title={timing.nextBuy.label ?? "Await ex-div date"}
            body={`${dipText} avg post-ex dip · entry band ${entryBand}`}
          />
          <WindowBox
            tone="trim"
            eyebrow={`Next sell / trim point · ${opensText(timing.nextTrim.opensInDays)}`}
            title={timing.nextTrim.label ?? "No trim window yet"}
            body={trimBody}
          />
        </div>
        <AgentSignoff agent={timing.agent} />
      </section>
      <div className="text-center font-mono text-[10px] text-[#5a5a62]">Buy Timing cached {formatAnalyzedAt(analyzedAt)}.</div>

      <section className="rounded-[10px] border border-[#2a2a31] bg-[#161619] p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-[15px] font-bold">Buy / trim by month</div>
          <div className="text-[12px] text-[#5a5a62]">{cycleLabel(timing)} · blended with 5-yr seasonality</div>
        </div>
        <MonthlyBuyMap timing={timing} />
        <PriceContextRow timing={timing} />
      </section>

      <div className="grid gap-2.5 min-[820px]:grid-cols-4">
        <StatBox label="Cycles tested" value={`${timing.stats.cyclesHit} / ${timing.stats.cyclesTested} hit`} color="#3ecf8e" />
        <StatBox label="Avg post-ex dip" value={dipText} color="#f2575c" />
        <StatBox label="Full recovery" value={timing.stats.fullRecoverySessions != null ? `${timing.stats.fullRecoverySessions} sessions` : "No clean sample"} color="#ececee" />
        <StatBox label="Edge vs random buy" value={timing.stats.edgeVsRandomBuyPct != null ? `${signed(timing.stats.edgeVsRandomBuyPct)}%` : "Not enough data"} color="#3ecf8e" />
      </div>

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
      <div className="mt-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#ececee]">{value}</div>
      <div className="mt-1 text-[11px] text-[#8c8c95]">{detail}</div>
    </div>
  );
}

function WindowBox({ tone, eyebrow, title, body }: { tone: "buy" | "trim"; eyebrow: string; title: string; body: string }) {
  const color = tone === "buy" ? "#3ecf8e" : "#f5c451";
  return (
    <div className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: `${color}50`, background: tone === "buy" ? "rgba(62,207,142,0.07)" : "rgba(245,196,81,0.06)" }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{eyebrow}</div>
      <div className="mt-1.5 font-mono text-[16px] font-extrabold tracking-[-0.2px] text-[#ececee]">{title}</div>
      <div className="mt-1.5 text-[11px] text-[#8c8c95]">{body}</div>
    </div>
  );
}

function MonthlyBuyMap({ timing }: { timing: BuyTimingResponse }) {
  const map = timing.monthlyMap;
  if (!map || !map.length) return <div className="mt-4 text-[12px] text-[#5a5a62]">Monthly buy/trim map needs a fresh sync.</div>;
  return (
    <div className="mt-5">
      <div className="grid grid-cols-6 gap-1.5 min-[720px]:grid-cols-12">
        {map.map((month) => <MonthCell key={month.month} month={month} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#8c8c95]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ecf8e]" /> Buy month</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f2575c]" /> Trim month</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f5c451]" /> Ex-dividend</span>
        <span className="ml-auto">Higher fill = stronger signal</span>
      </div>
    </div>
  );
}

type MonthCellData = NonNullable<BuyTimingResponse["monthlyMap"]>[number];

function MonthCell({ month }: { month: MonthCellData }) {
  const tone = cellTone(month.action, Math.min(1, Math.abs(month.score) / 100));
  return (
    <div
      className="relative flex flex-col items-center gap-1 rounded-[8px] border px-1 py-2.5"
      style={{ background: tone.bg, borderColor: month.isCurrent ? "#ececee" : tone.border }}
      title={`${month.month}: ${month.action} (score ${signed(month.score)}) · ${month.note}`}
    >
      {month.isCurrent ? (
        <span className="absolute -top-[7px] rounded-[4px] bg-[#ececee] px-1 py-[1px] text-[7px] font-bold uppercase tracking-[0.06em] text-[#0e0e10]">now</span>
      ) : null}
      {month.isExMonth ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f5c451]" /> : null}
      <span className="text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: tone.fg }}>{month.action === "HOLD" ? "—" : month.action}</span>
      <span className="font-mono text-[12px] font-bold text-[#ececee]">{month.month}</span>
      <span className="font-mono text-[9px] text-[#8c8c95]">{signed(month.returnPct)}%</span>
    </div>
  );
}

function cellTone(action: MonthCellData["action"], intensity: number) {
  const alpha = 0.1 + intensity * 0.42;
  if (action === "BUY") return { fg: "#3ecf8e", bg: `rgba(62,207,142,${alpha})`, border: "rgba(62,207,142,0.42)" };
  if (action === "TRIM") return { fg: "#f2575c", bg: `rgba(242,87,92,${alpha})`, border: "rgba(242,87,92,0.42)" };
  return { fg: "#8c8c95", bg: "rgba(90,90,98,0.10)", border: "#2a2a31" };
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

