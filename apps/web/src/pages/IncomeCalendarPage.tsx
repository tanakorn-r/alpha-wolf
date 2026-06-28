import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { loadMarketCalendar, type MarketCalendarEvent } from "../lib/api";
import { formatMoney, formatShortDate } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type RegionFilter = "all" | "us" | "th";
const regionOptions: Array<{ value: RegionFilter; label: string }> = [
  { value: "us", label: "USA" },
  { value: "th", label: "Thai" },
  { value: "all", label: "All stocks" },
];

export function IncomeCalendarPage() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [region, setRegion] = useState<RegionFilter>("us");
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const cells = useMemo(() => calendarCells(month), [month]);

  const calendarQuery = useQuery({
    queryKey: ["market-calendar", monthKey, region],
    queryFn: () => loadMarketCalendar({ month: monthKey, region }),
  });

  const events = calendarQuery.data?.events ?? [];
  const summary = calendarQuery.data?.summary;
  const monthEvents = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  return (
    <div className="grid gap-4 text-[#ececee] xl:grid-cols-[1fr_340px]">
      <section className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#161619]">
        <div className="border-b border-[#2a2a31] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" disabled={calendarQuery.isFetching} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee] disabled:opacity-60">←</button>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Live stock calendar</div>
                <h2 className="mt-1 text-lg font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
              </div>
              <button type="button" disabled={calendarQuery.isFetching} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee] disabled:opacity-60">→</button>
            </div>
            <div className="flex gap-1 rounded-[10px] border border-[#2a2a31] bg-[#0e0e10] p-1">
              {regionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={calendarQuery.isFetching}
                  onClick={() => setRegion(option.value)}
                  className={`flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-[13px] font-medium capitalize disabled:opacity-60 ${region === option.value ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}
                >
                  {calendarQuery.isFetching && region === option.value ? <LoadingSpinner size={12} /> : null}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {calendarQuery.isFetching && !calendarQuery.isPending ? <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8c8c95]"><LoadingSpinner size={12} />Refreshing dividend calendar…</div> : null}

          <div className="mt-3 text-[11px] text-[#5a5a62]">
            Calendar opens with one market first to avoid hammering the upstream feed. Switch to `All stocks` only when you want the wider view.
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
            <div key={day} className="p-2 text-center text-[10px] uppercase tracking-wider text-[#5a5a62]">
              {day}
            </div>
          ))}
        </div>

        {calendarQuery.isPending ? (
          <div className="flex min-h-[620px] items-center justify-center gap-3 text-sm text-[#8c8c95]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />
            Loading market calendar…
          </div>
        ) : calendarQuery.isError ? (
          <div className="flex min-h-[620px] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-sm text-[#f2575c]">Calendar service is unavailable right now.</div>
            <button type="button" disabled={calendarQuery.isFetching} onClick={() => calendarQuery.refetch()} className="flex items-center gap-2 rounded-lg border border-[#f2575c] px-3 py-2 text-xs text-[#f2575c] disabled:opacity-60">{calendarQuery.isFetching ? <LoadingSpinner size={12} /> : null}Retry</button>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((cell, index) => {
              const dayEvents = cell ? monthEvents.filter((event) => Number(event.date.slice(8, 10)) === cell) : [];
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
                            onClick={() => openDetail(event.symbol)}
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

      <aside className="space-y-4">
        <div className="rounded-xl border border-[#285f48] bg-[#173528] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#3ecf8e]">Holding dividend events</div>
          <div className="mt-2 font-mono text-3xl font-semibold">{summary?.holdingEvents ?? 0}</div>
          <div className="mt-1 text-xs text-[#82b99f]">{formatMoney(summary?.paymentsTotal)} expected from dividend payments on held names</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="All events" value={String(summary?.totalEvents ?? 0)} />
          <MiniStat label="US" value={String(summary?.usEvents ?? 0)} />
          <MiniStat label="Thai" value={String(summary?.thEvents ?? 0)} />
          <MiniStat label="Month" value={month.toLocaleDateString(undefined, { month: "short" })} />
        </div>

        <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Month events</h3>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">{region === "all" ? "All regions" : region === "us" ? "USA only" : "Thai only"}</span>
          </div>
          <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {monthEvents.map((event) => (
              <button
                key={`${event.date}-${event.symbol}-${event.kind}`}
                onClick={() => openDetail(event.symbol)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${event.isHolding ? "border-[#285f48] bg-[#173528]/55" : "border-[#2a2a31] bg-[#0e0e10]"}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${eventDotTone(event)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold">{event.symbol} <span className="text-[#8c8c95]">{event.name}</span></div>
                      {event.isHolding ? <span className="rounded-full bg-[#3ecf8e]/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3ecf8e]">Holding</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-[#8c8c95]">{formatShortDate(event.date)} · {event.marketLabel} · {eventLabel(event)}</div>
                    {event.note ? <div className="mt-1 text-xs text-[#bcbcc2]">{event.note}</div> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!monthEvents.length && !calendarQuery.isPending && !calendarQuery.isError ? <p className="mt-6 text-sm text-[#5a5a62]">No stock calendar events for this filter in the selected month.</p> : null}
        </div>
      </aside>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#5a5a62]">{label}</div>
      <div className="mt-2 font-mono text-xl font-semibold">{value}</div>
    </div>
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

function eventLabel(event: MarketCalendarEvent) {
  if (event.kind === "payment" && typeof event.amount === "number") return `Payment ${formatMoney(event.amount)}`;
  if (event.kind === "ex-dividend") return "Ex-dividend";
  if (event.kind === "payment") return "Dividend payment";
  return event.kind;
}

function eventCellTone(event: MarketCalendarEvent) {
  if (event.isHolding) return "bg-[#3ecf8e] text-[#06120c]";
  if (event.kind === "payment") return "bg-[#254a70] text-[#9bc8ff]";
  return "bg-[#463c1c] text-[#f5c451]";
}

function eventDotTone(event: MarketCalendarEvent) {
  if (event.isHolding) return "bg-[#3ecf8e]";
  if (event.kind === "payment") return "bg-[#74a4ff]";
  return "bg-[#f5c451]";
}

function calendarCells(month: Date): Array<number | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, index) => index + 1), ...Array((7 - (first + days) % 7) % 7).fill(null)];
}
