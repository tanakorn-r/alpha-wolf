import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMarketCalendar } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { calendarCells, type RegionFilter } from "./calendarModel";

export type DividendHunt = ReturnType<typeof useDividendHunt>;

export function useDividendHunt() {
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
  const monthEvents = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol)),
    [events],
  );

  return {
    month,
    monthLabel: month.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    monthShortLabel: month.toLocaleDateString(undefined, { month: "short" }),
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
