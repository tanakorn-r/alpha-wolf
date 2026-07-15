import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadMarketCalendar } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { calendarCells, type RegionFilter } from "./calendarModel";
import { formatLocalDate } from "../../lib/locale";

export type DividendHunt = ReturnType<typeof useDividendHunt>;

const CALENDAR_STALE_TIME = 3_600_000;
const CALENDAR_GC_TIME = 86_400_000;

function monthKeyFor(date: Date, offset: number) {
  const shifted = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function useDividendHunt() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [region, setRegion] = useState<RegionFilter>("us");
  const monthKey = monthKeyFor(month, 0);
  const cells = useMemo(() => calendarCells(month), [month]);

  const calendarQuery = useQuery({
    queryKey: ["market-calendar", monthKey, region],
    queryFn: () => loadMarketCalendar({ month: monthKey, region }),
    staleTime: CALENDAR_STALE_TIME,
    gcTime: CALENDAR_GC_TIME,
  });

  // Prefetch the adjacent months in the background so the </> arrows feel instant
  // instead of blocking on a fresh network call every click.
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const key = monthKeyFor(month, offset);
      void queryClient.prefetchQuery({
        queryKey: ["market-calendar", key, region],
        queryFn: () => loadMarketCalendar({ month: key, region }),
        staleTime: CALENDAR_STALE_TIME,
      });
    }
  }, [month, region, queryClient]);

  const events = calendarQuery.data?.events ?? [];
  const monthEvents = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol)),
    [events],
  );

  return {
    month,
    monthLabel: formatLocalDate(month, { month: "long", year: "numeric" }),
    monthShortLabel: formatLocalDate(month, { month: "short" }),
    region,
    regionLabel: region === "all" ? "All regions" : region === "us" ? "USA only" : "Thai only",
    cells,
    monthEvents,
    summary: calendarQuery.data?.summary,
    isPending: calendarQuery.isPending,
    isError: calendarQuery.isError,
    isFetching: calendarQuery.isFetching,
    isRefreshing: calendarQuery.isFetching && !calendarQuery.isPending,
    openDetail,
    setRegion,
    prevMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); },
    nextMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); },
    retry() { void calendarQuery.refetch(); },
    eventsForDay(day: number) { return monthEvents.filter((event) => Number(event.date.slice(8, 10)) === day); },
  };
}
