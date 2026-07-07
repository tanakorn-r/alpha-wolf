import { LoadingPanel, RetryPanel } from "../../components/ui/panels";
import { formatCurrency, formatMoneyBaht, formatPercent } from "../../lib/format";
import { useWolfStore } from "../../store/useWolfStore";
import type { BriefFilter, BriefStatus, BriefTone, DecisionPanel, DailyBrief, HoldingBriefRow } from "./useDailyBrief";

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
  const openDetail = useWolfStore((state) => state.openDetail);

  if (brief.loading) return <LoadingPanel title="Building your Daily Brief..." body="Reading your holdings, live detail cards, and dividend calendar." />;
  if (brief.failed) return <RetryPanel label="Daily Brief could not load your portfolio." onRetry={brief.retry} />;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-[#2a2a31] bg-[#121214] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[12px] border border-[#1f6e50] bg-[#10231b] text-[24px] font-black text-[#3ecf8e]">A</div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8c8c95]">Your holdings brief</div>
              <h2 className="mt-1 text-[24px] font-bold tracking-[-0.02em] text-[#ececee]">{brief.counts.needs_you} holdings need a decision today.</h2>
              <p className="mt-1 max-w-[860px] text-[13.5px] leading-[1.5] text-[#9b9ba3]">{brief.summary}</p>
            </div>
          </div>
          <div className="grid min-w-[300px] grid-cols-3 gap-3">
            <CountStat label={statusCopy.needs_you.countLabel} value={brief.counts.needs_you} color={statusCopy.needs_you.color} />
            <CountStat label={statusCopy.watch.countLabel} value={brief.counts.watch} color={statusCopy.watch.color} />
            <CountStat label={statusCopy.hold.countLabel} value={brief.counts.hold} color={statusCopy.hold.color} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => brief.setFilter(item.key)}
              className={`rounded-[8px] border px-3 py-2 text-[13px] font-semibold transition ${brief.filter === item.key ? "border-[#3ecf8e] bg-[#10231b] text-[#ececee]" : "border-[#2a2a31] bg-[#121214] text-[#8c8c95] hover:text-[#ececee]"}`}
            >
              <span>{item.label}</span>
              <span className="ml-2 font-mono text-[12px] text-[#6f6f78]">{brief.counts[item.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Meta label="Portfolio" value={formatMoneyBaht(brief.stats?.totalValue)} />
          <Meta label="P/L" value={`${brief.totalPl >= 0 ? "+" : "-"}${formatMoneyBaht(Math.abs(brief.totalPl))}`} color={brief.totalPl >= 0 ? "#3ecf8e" : "#ff5f68"} />
          <Meta label="Source" value={brief.detailsFetching ? "live details" : "holdings only"} color={brief.detailsFetching ? "#74a4ff" : "#9b9ba3"} />
          {brief.calendarFailed ? <Meta label="Calendar" value="partial" color="#f5c451" /> : null}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        {brief.visibleRows.length ? brief.visibleRows.map((row) => (
          <DecisionCard key={row.symbol} row={row} onOpen={() => openDetail(row.symbol)} />
        )) : (
          <div className="rounded-[14px] border border-[#2a2a31] bg-[#121214] px-5 py-12 text-center text-[13px] text-[#8c8c95]">No holdings in this filter.</div>
        )}
      </section>
    </div>
  );
}

function DecisionCard({ row, onOpen }: { row: HoldingBriefRow; onOpen: () => void }) {
  const status = statusCopy[row.status];
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#2a2a31] bg-[#121214]">
      <div className="grid gap-4 px-5 py-4 min-[1180px]:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[20px] font-bold text-[#ececee]">{row.symbol}</span>
            <span className="min-w-0 truncate text-[13px] text-[#8c8c95]">{row.name}</span>
            <span className="rounded-[6px] border border-[#303039] px-2 py-0.5 text-[10px] text-[#8c8c95]">{row.strategy}</span>
            <span className="rounded-[7px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: status.color, background: `${status.color}18` }}>{status.label}</span>
            {row.detailLoading ? <span className="rounded-[7px] border border-[#303039] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#74a4ff]">updating</span> : null}
          </div>

          <div className="mt-4 grid gap-4 min-[900px]:grid-cols-[220px_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="font-mono text-[28px] font-bold leading-none text-[#ececee]">{formatCurrency(row.price, row.currency ?? "USD")}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                <span className={row.todayPct >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{formatPercent(row.todayPct)} today</span>
                <span className={row.gainLossPct >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{formatPercent(row.gainLossPct)} on position</span>
              </div>
              <Sparkline points={row.history.map((point) => point.close)} tone={row.todayPct >= 0 ? "good" : "bad"} />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold leading-tight text-[#ececee]">{row.headline}</div>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-[#bcbcc2]">{row.whatToDo}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#8c8c95]">
                <span>You hold <b className="font-mono text-[#d7d7dc]">{formatShares(row.shares)} sh</b></span>
                <span className={row.gainLoss >= 0 ? "text-[#3ecf8e]" : "text-[#ff5f68]"}>{row.gainLoss >= 0 ? "+" : "-"}{formatMoneyBaht(Math.abs(row.gainLoss))}</span>
                <span>{formatMoneyBaht(row.value)}</span>
                <span>Yield {row.yieldPct != null ? `${row.yieldPct.toFixed(2)}%` : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-[10px] border border-[#26262c] bg-[#0e0e10] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#777780]">AI rating</div>
              <div className="mt-1 font-mono text-[34px] font-bold leading-none text-[#ececee]">{row.rating}</div>
              <div className="mt-1 font-mono text-[12px] text-[#8c8c95]">/100</div>
            </div>
            <span className="rounded-[9px] border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: toneColor(row.actionTone), borderColor: `${toneColor(row.actionTone)}55`, background: `${toneColor(row.actionTone)}16` }}>{row.actionLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#24242a]">
            <div className="h-full rounded-full" style={{ width: `${row.rating}%`, background: `linear-gradient(90deg, #3ecf8e, ${toneColor(row.actionTone)})` }} />
          </div>
        </div>
      </div>

      <div className="border-t border-[#24242a] bg-[#171217] px-5 py-3">
        <span className="mr-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff5f68]">What to do</span>
        <span className="text-[13.5px] leading-[1.5] text-[#d7d7dc]">{row.whatToDo}</span>
      </div>

      <div className="grid border-t border-[#24242a] min-[900px]:grid-cols-4">
        <DecisionPanelView panel={row.nextMove} />
        <DecisionPanelView panel={row.watchFor} />
        <DecisionPanelView panel={row.news} />
        <DecisionPanelView panel={row.sellTrigger} />
      </div>

      <div className="flex items-center justify-between border-t border-[#24242a] px-5 py-3 text-[12px] text-[#8c8c95]">
        <span>Full analysis, chart, and research stack for {row.symbol}</span>
        <button type="button" onClick={onOpen} className="font-semibold text-[#3ecf8e] hover:text-[#74e3b1]">Open →</button>
      </div>
    </article>
  );
}

function DecisionPanelView({ panel }: { panel: DecisionPanel }) {
  const color = toneColor(panel.tone);
  return (
    <div className="min-h-[132px] border-t border-[#24242a] px-5 py-4 min-[900px]:border-l min-[900px]:border-t-0 first:min-[900px]:border-l-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f6f78]">{panel.label}</div>
        {panel.meta ? <span className="rounded-[6px] bg-[#202026] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{panel.meta}</span> : null}
      </div>
      <div className="mt-3 text-[15px] font-bold leading-tight" style={{ color }}>{panel.title}</div>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[#9b9ba3]">{panel.body}</p>
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

function CountStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[28px] font-bold leading-none" style={{ color }}>{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f6f78]">{label}</div>
    </div>
  );
}

function Meta({ label, value, color = "#ececee" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[#26262c] bg-[#121214] px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f6f78]">{label}</span>
      <span className="font-mono text-[12px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function toneColor(tone: BriefTone) {
  if (tone === "good") return "#3ecf8e";
  if (tone === "bad") return "#ff5f68";
  if (tone === "warn") return "#f5c451";
  return "#8c8c95";
}

function formatShares(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
