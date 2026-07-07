import type { MarketCalendarEvent } from "../../lib/api";
import { formatMoney } from "../../lib/format";

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RegionFilter = "all" | "us" | "th";

export const regionOptions: Array<{ value: RegionFilter; label: string }> = [
  { value: "us", label: "USA" },
  { value: "th", label: "Thai" },
  { value: "all", label: "All stocks" },
];

export function eventLabel(event: MarketCalendarEvent) {
  if (event.kind === "payment" && typeof event.amount === "number") return `Payment ${formatMoney(event.amount)}`;
  if (event.kind === "ex-dividend") return "Ex-dividend";
  if (event.kind === "payment") return "Dividend payment";
  return event.kind;
}

export function eventCellTone(event: MarketCalendarEvent) {
  if (event.isHolding) return "bg-[#3ecf8e] text-[#06120c]";
  if (event.kind === "payment") return "bg-[#254a70] text-[#9bc8ff]";
  return "bg-[#463c1c] text-[#f5c451]";
}

export function eventDotTone(event: MarketCalendarEvent) {
  if (event.isHolding) return "bg-[#3ecf8e]";
  if (event.kind === "payment") return "bg-[#74a4ff]";
  return "bg-[#f5c451]";
}

export function calendarCells(month: Date): Array<number | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, index) => index + 1), ...Array((7 - (first + days) % 7) % 7).fill(null)];
}
