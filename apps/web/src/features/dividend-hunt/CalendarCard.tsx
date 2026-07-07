import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PillTabs } from "../../components/ui/PillTabs";
import { eventCellTone, eventLabel, regionOptions, weekdays } from "./calendarModel";
import type { DividendHunt } from "./useDividendHunt";

export function CalendarCard({ hunt }: { hunt: DividendHunt }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#161619]">
      <div className="border-b border-[#2a2a31] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NavButton label="←" disabled={hunt.isFetching} onClick={hunt.prevMonth} />
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Live dividend calendar</div>
              <h2 className="mt-1 text-lg font-semibold">{hunt.monthLabel}</h2>
            </div>
            <NavButton label="→" disabled={hunt.isFetching} onClick={hunt.nextMonth} />
          </div>
          <PillTabs value={hunt.region} options={regionOptions} onChange={hunt.setRegion} disabled={hunt.isFetching} />
        </div>

        {hunt.isRefreshing ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8c8c95]"><LoadingSpinner size={12} />Refreshing dividend calendar…</div>
        ) : null}

        <div className="mt-3 text-[11px] text-[#5a5a62]">
          The calendar opens with one market first to avoid hammering the upstream feed. Switch to All stocks when you want the wider view.
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <LegendBadge color="bg-[#3ecf8e]" label="Holding dividend" />
          <LegendBadge color="bg-[#f5c451]" label="Ex-dividend" />
          <LegendBadge color="bg-[#74a4ff]" label="Dividend payment" />
          <LegendBadge color="bg-[#5a5a62]" label="Other market names" />
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#2a2a31]">
        {weekdays.map((day) => (
          <div key={day} className="p-2 text-center text-[10px] uppercase tracking-wider text-[#5a5a62]">{day}</div>
        ))}
      </div>

      {hunt.isPending ? (
        <div className="flex min-h-[620px] items-center justify-center gap-3 text-sm text-[#8c8c95]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />
          Loading market calendar…
        </div>
      ) : hunt.isError ? (
        <div className="flex min-h-[620px] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-sm text-[#f2575c]">Calendar service is unavailable right now.</div>
          <button type="button" disabled={hunt.isFetching} onClick={hunt.retry} className="flex items-center gap-2 rounded-lg border border-[#f2575c] px-3 py-2 text-xs text-[#f2575c] disabled:opacity-60">
            {hunt.isFetching ? <LoadingSpinner size={12} /> : null}Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {hunt.cells.map((cell, index) => {
            const dayEvents = cell ? hunt.eventsForDay(cell) : [];
            return (
              <div key={index} className={`min-h-32 border-b border-r border-[#23232a] p-2 ${cell ? "" : "bg-[#121214]"}`}>
                {cell ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-xs text-[#8c8c95]">{cell}</div>
                      {dayEvents.some((item) => item.isHolding) ? <span className="rounded-full bg-[#3ecf8e]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#3ecf8e]">Yours</span> : null}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 4).map((event) => (
                        <button
                          key={`${event.date}-${event.symbol}-${event.kind}`}
                          type="button"
                          onClick={() => hunt.openDetail(event.symbol)}
                          className={`block w-full truncate rounded-md px-2 py-1 text-left text-[10px] font-semibold ${eventCellTone(event)}`}
                        >
                          {event.symbol} · {eventLabel(event)}
                        </button>
                      ))}
                      {dayEvents.length > 4 ? <div className="px-1 text-[10px] text-[#8c8c95]">+{dayEvents.length - 4} more</div> : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NavButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg border border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee] disabled:opacity-60">
      {label}
    </button>
  );
}

function LegendBadge({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#0e0e10] px-3 py-1.5 text-[11px] text-[#8c8c95]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
