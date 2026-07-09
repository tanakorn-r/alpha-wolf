import { EmptyPanel, LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { AgentByline, AgentSignoff } from "../../components/agents/AgentByline";
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
    <div className="flex flex-col gap-4">
      <section className="rounded-[13px] border border-[#2a2a31] bg-[#161619] p-[18px]">
        <AgentByline agent={timing.agent} label="Timing agent" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[1080px]">
            <div className="text-[15px] font-bold tracking-[-0.2px] text-[#ececee]">{timing.headline}</div>
            <p className="mt-[6px] max-w-[1050px] text-[12.5px] leading-[1.6] text-[#bcbcc2]">{timing.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] border border-[#2a2a31] bg-[#0e0e10] px-[10px] py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-[#8c8c95]">
              {timing.narrativeSource === "openai" ? "AI read" : "Calculated"}
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
              Last sync {formatAnalyzedAt(analyzedAt)}
            </span>
            <PremiumAiButton label={refreshing ? "Refreshing" : "Refresh"} sublabel="Timing" disabled={refreshing} loading={refreshing} onClick={onRefresh} size="xs" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 min-[760px]:grid-cols-3">
          <PlainAnswer label="Today" value={currentMonthLabel()} detail={timing.price != null ? `Price now ${formatCurrency(timing.price, timing.currency)}` : "Current month"} />
          <PlainAnswer label="Best wait" value={wait} detail={timing.nextBuy.label ? `Buy window ${timing.nextBuy.label}` : "Wait for entry price"} />
          <PlainAnswer label="Price check" value={priceCheck(timing)} detail={priceCheckDetail(timing)} />
        </div>
        <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
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
        {timing.recap ? <AgentRecap timing={timing} /> : null}
        <AgentSignoff agent={timing.agent} />
      </section>
      <div className="text-center font-mono text-[10.5px] text-[#5a5a62]">Buy Timing cached {formatAnalyzedAt(analyzedAt)}.</div>

      <section className="rounded-[13px] border border-[#2a2a31] bg-[#161619] p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-[15px] font-bold">Month map</div>
          <div className="text-[12px] text-[#5a5a62]">{cycleLabel(timing)}</div>
        </div>
        <MonthMap timing={timing} />
        <CycleClock timing={timing} />
        <PriceContextRow timing={timing} />
      </section>

      <div className="grid gap-3 min-[820px]:grid-cols-4">
        <StatBox label="Cycles tested" value={`${timing.stats.cyclesHit} / ${timing.stats.cyclesTested} hit`} color="#3ecf8e" />
        <StatBox label="Avg post-ex dip" value={dipText} color="#f2575c" />
        <StatBox label="Full recovery" value={timing.stats.fullRecoverySessions != null ? `${timing.stats.fullRecoverySessions} sessions` : "No clean sample"} color="#ececee" />
        <StatBox label="Edge vs random buy" value={timing.stats.edgeVsRandomBuyPct != null ? `${signed(timing.stats.edgeVsRandomBuyPct)}%` : "Not enough data"} color="#3ecf8e" />
      </div>

      <section className="rounded-[13px] border border-[#2a2a31] bg-[#161619] p-[18px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      <section className="rounded-[13px] border border-[#2a2a31] bg-[#161619] p-[18px]">
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

function AgentRecap({ timing }: { timing: BuyTimingResponse }) {
  const fit = timing.agentFit ?? "neutral";
  const meta =
    fit === "aligned"
      ? { color: "#3ecf8e", label: "Fits my strategy" }
      : fit === "against"
        ? { color: "#f2575c", label: "Not my setup" }
        : { color: "#f5c451", label: "OK, not my ideal setup" };
  return (
    <div className="mt-4 rounded-[12px] border px-4 py-[14px]" style={{ borderColor: `${meta.color}50`, background: `${meta.color}0f` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: meta.color }}>{timing.agent?.name ?? "Agent"} recap</span>
        <span className="rounded-[5px] border px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ borderColor: `${meta.color}55`, color: meta.color, background: `${meta.color}14` }}>{meta.label}</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold leading-[1.55] text-[#ececee]">{timing.recap}</p>
      {timing.agentFitReason ? <p className="mt-1.5 text-[11.5px] italic leading-[1.55] text-[#8c8c95]">“{timing.agentFitReason}”</p> : null}
    </div>
  );
}

function PlainAnswer({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-[#2a2a31] bg-[#111113] px-4 py-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">{label}</div>
      <div className="mt-1 text-[18px] font-extrabold tracking-[-0.3px] text-[#ececee]">{value}</div>
      <div className="mt-1 text-[11px] text-[#8c8c95]">{detail}</div>
    </div>
  );
}

function WindowBox({ tone, eyebrow, title, body }: { tone: "buy" | "trim"; eyebrow: string; title: string; body: string }) {
  const color = tone === "buy" ? "#3ecf8e" : "#f5c451";
  return (
    <div className="rounded-[12px] border px-4 py-[14px]" style={{ borderColor: `${color}50`, background: tone === "buy" ? "rgba(62,207,142,0.07)" : "rgba(245,196,81,0.06)" }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{eyebrow}</div>
      <div className="mt-2 font-mono text-[18px] font-extrabold tracking-[-0.3px] text-[#ececee]">{title}</div>
      <div className="mt-1.5 text-[11px] text-[#8c8c95]">{body}</div>
    </div>
  );
}

function CycleClock({ timing }: { timing: BuyTimingResponse }) {
  const line = timing.timeline;
  // Real geometry: buy zone is the post-ex reversal dip (just right of the next ex-div), trim zone
  // is the pre-dividend run-up (just left of it). Fall back to the old fixed layout if unmapped.
  const trim = line?.trimZone;
  const buy = line?.buyZone;
  const trimLeft = clamp(trim?.startPct ?? 78, 0, 100);
  const trimWidth = clamp((trim?.endPct ?? 88) - trimLeft, 2, 100);
  const buyLeft = clamp(buy?.startPct ?? 88, 0, 100);
  const buyWidth = clamp((buy?.endPct ?? 100) - buyLeft, 2, 100);
  const todayPct = clamp(line?.todayPct ?? timing.cycle.positionPct ?? 50, 0, 100);
  const exPct = clamp(line?.nextExPct ?? 100, 0, 100);
  return (
    <div className="relative mt-9 h-[150px]">
      <div className="absolute left-0 right-0 top-[64px] h-[15px] overflow-hidden rounded-full border border-[#2a2a31] bg-[#0e0e10]">
        <div className="absolute inset-y-0 bg-[#f5c451]/22" style={{ left: `${trimLeft}%`, width: `${trimWidth}%` }} />
        <div className="absolute inset-y-0 bg-[#3ecf8e]/28" style={{ left: `${buyLeft}%`, width: `${buyWidth}%` }} />
      </div>
      <ZoneLabel top={2} left={trimLeft + trimWidth / 2} color="#f5c451" title="Trim" range={zoneRange(trim?.start, trim?.end)} />
      <ZoneLabel top={30} left={buyLeft + buyWidth / 2} color="#3ecf8e" title="Buy dip" range={zoneRange(buy?.start, buy?.end)} />
      <CycleMarker left={0} color="#f2575c" label={line?.start ? formatShortDate(line.start) : timing.cycle.lastExDate ? formatShortDate(timing.cycle.lastExDate) : "EX-DIV"} align="left" />
      <CycleMarker left={exPct} color="#f2575c" label={timing.cycle.nextExDate ? `EX ${formatShortDate(timing.cycle.nextExDate)}` : "NEXT EX-DIV"} align="center" />
      <div className="absolute top-[18px] z-10 flex -translate-x-1/2 flex-col items-center" style={{ left: `${todayPct}%` }}>
        <div className="rounded-[5px] bg-[#ececee] px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.07em] text-[#0e0e10]">Today</div>
        <div className="h-[58px] w-[2px] bg-[#ececee]" />
      </div>
    </div>
  );
}

function ZoneLabel({ top, left, color, title, range }: { top: number; left: number; color: string; title: string; range: string | null }) {
  return (
    <div className="absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-center" style={{ top: `${top}px`, left: `${clamp(left, 10, 90)}%` }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color }}>{title}{range ? <span className="ml-1 font-mono lowercase tracking-normal opacity-90">{range}</span> : null}</div>
    </div>
  );
}

function PriceContextRow({ timing }: { timing: BuyTimingResponse }) {
  const context = timing.priceContext;
  if (!context || context.low == null || context.high == null) return null;
  const pct = clamp(context.currentPct ?? 50, 0, 100);
  const vsAvg = context.vsAvgPct;
  const zone = pct >= 85 ? "near 5-yr high" : pct <= 30 ? "lower part of 5-yr range" : "mid 5-yr range";
  return (
    <div className="mt-6 rounded-[10px] border border-[#2a2a31] bg-[#111113] px-5 py-4">
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

function zoneRange(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const from = formatShortDate(start);
  const to = new Date(`${end}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  const fromMonth = from.split(" ")[0];
  const toMonth = to.split(" ")[0];
  return fromMonth === toMonth ? `${from}–${to.split(" ")[1]}` : `${from} – ${to}`;
}

function MonthMap({ timing }: { timing: BuyTimingResponse }) {
  const months = rollingMonths();
  const buyIndex = timing.nextBuy.start ? months.findIndex((month) => sameMonth(month.date, timing.nextBuy.start ?? "")) : -1;
  const trimIndex = timing.nextTrim.start ? months.findIndex((month) => sameMonth(month.date, timing.nextTrim.start ?? "")) : -1;
  return (
    <div className="mt-6">
      <div className="grid grid-cols-6 gap-2 min-[900px]:grid-cols-12">
        {months.map((month, index) => {
          const isToday = index === 0;
          const isBuy = index === buyIndex;
          const isTrim = index === trimIndex;
          const bg = isBuy ? "rgba(62,207,142,0.18)" : isTrim ? "rgba(245,196,81,0.16)" : isToday ? "rgba(236,236,238,0.08)" : "#101012";
          const border = isBuy ? "#3ecf8e" : isTrim ? "#f5c451" : isToday ? "#ececee" : "#2a2a31";
          const color = isBuy ? "#3ecf8e" : isTrim ? "#f5c451" : isToday ? "#ececee" : "#8c8c95";
          return (
            <div key={month.key} className="min-h-[74px] rounded-[8px] border px-2 py-2" style={{ background: bg, borderColor: border }}>
              <div className="font-mono text-[12px] font-bold" style={{ color }}>{month.label}</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{isToday ? "Today" : isBuy ? "Buy" : isTrim ? "Trim" : ""}</div>
              <div className="mt-1 text-[10px] text-[#666670]">{index === 0 ? "now" : `+${index} mo`}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-[#8c8c95]">
        <span><span className="text-[#ececee]">Today:</span> {formatDate(todayIso())}</span>
        <span><span className="text-[#3ecf8e]">Buy:</span> {timing.nextBuy.start ? `${formatDate(timing.nextBuy.start)} (${waitText(timing.nextBuy.opensInDays)})` : "wait for entry price"}</span>
        <span><span className="text-[#f5c451]">Trim:</span> {timing.nextTrim.start ? formatDate(timing.nextTrim.start) : "not mapped yet"}</span>
      </div>
    </div>
  );
}

function CycleMarker({ left, color, label, align = "center" }: { left: number; color: string; label: string; align?: "left" | "center" | "right" }) {
  const alignClass = align === "left" ? "items-start" : align === "right" ? "items-end -translate-x-full" : "items-center -translate-x-1/2";
  return (
    <div className={`absolute top-[48px] flex flex-col ${alignClass}`} style={{ left: `${left}%` }}>
      <div className="h-[28px] w-[2px]" style={{ background: color }} />
      <div className="mt-2 whitespace-nowrap font-mono text-[10px] font-semibold" style={{ color }}>{label}</div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[12px] border border-[#2a2a31] bg-[#161619] px-4 py-[14px]">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#8c8c95]">{label}</div>
      <div className="mt-2 font-mono text-[18px] font-extrabold tracking-[-0.3px]" style={{ color }}>{value}</div>
    </div>
  );
}

function SeasonalityChart({ values, cheapestMonth, peakMonth }: { values: Array<{ month: string; returnPct: number }>; cheapestMonth: string; peakMonth: string }) {
  const max = Math.max(...values.map((value) => Math.abs(value.returnPct)), 1);
  return (
    <div className="grid h-[170px] grid-cols-12 items-end gap-2">
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
    <div className="rounded-[8px] border border-[#2a2a31] bg-[#111113] px-4 py-3">
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

function rollingMonths() {
  const start = new Date();
  start.setDate(1);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start);
    date.setMonth(start.getMonth() + index);
    return {
      date,
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString(undefined, { month: "short" }),
    };
  });
}

function sameMonth(month: Date, iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth();
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}
