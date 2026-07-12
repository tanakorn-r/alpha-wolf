import { formatMoney, formatShortDate } from "../../lib/format";
import { MetricCard } from "../../components/ui/Surface";
import { eventDotTone, eventLabel } from "./calendarModel";
import type { DividendHunt } from "./useDividendHunt";

export function CalendarSide({ hunt }: { hunt: DividendHunt }) {
  return (
    <aside className="min-w-0 space-y-4">
      <div className="rounded-[var(--aw-radius-card)] border border-[#285f48] bg-[#173528] p-4">
        <div className="text-[10px] uppercase tracking-wider text-[#3ecf8e]">Holding dividend events</div>
        <div className="mt-2 font-mono text-3xl font-semibold">{hunt.summary?.holdingEvents ?? 0}</div>
        <div className="mt-1 text-xs text-[#82b99f]">{formatMoney(hunt.summary?.paymentsTotal)} expected from dividend payments on held names</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="All events" value={String(hunt.summary?.totalEvents ?? 0)} />
        <MiniStat label="US" value={String(hunt.summary?.usEvents ?? 0)} />
        <MiniStat label="Thai" value={String(hunt.summary?.thEvents ?? 0)} />
        <MiniStat label="Month" value={hunt.monthShortLabel} />
      </div>

      <div className="rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Month events</h3>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">{hunt.regionLabel}</span>
        </div>
        <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
          {hunt.monthEvents.map((event) => (
            <button
              key={`${event.date}-${event.symbol}-${event.kind}`}
              onClick={() => hunt.openDetail(event.symbol)}
              className={`w-full rounded-[var(--aw-radius-control)] border px-3 py-3 text-left transition-colors hover:border-[#3ecf8e] ${event.isHolding ? "border-[#285f48] bg-[#173528]/55" : "border-[#2a2a31] bg-[#0e0e10]"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${eventDotTone(event)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-1 text-sm font-semibold">
                      <span className="flex-none">{event.symbol}</span>
                      <span className="min-w-0 truncate text-[#8c8c95]">{event.name}</span>
                    </div>
                    {event.isHolding ? <span className="rounded-full bg-[#3ecf8e]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3ecf8e]">Holding</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-[#8c8c95]">{formatShortDate(event.date)} · {event.marketLabel} · {eventLabel(event)}</div>
                  {event.note ? <div className="mt-1 text-xs text-[#bcbcc2]">{event.note}</div> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
        {!hunt.monthEvents.length && !hunt.isPending && !hunt.isError ? (
          <p className="mt-6 text-sm text-[#5a5a62]">No stock calendar events for this filter in the selected month.</p>
        ) : null}
      </div>
    </aside>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}
