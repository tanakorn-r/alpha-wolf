import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../lib/format";
import { loadPortfolio, type PortfolioDashboard } from "../lib/api";
import { useWolfStore } from "../store/useWolfStore";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function IncomeCalendarPage() {
  const openDetail = useWolfStore((state) => state.openDetail);
  const [portfolio, setPortfolio] = useState<PortfolioDashboard | null>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  useEffect(() => { loadPortfolio().then(setPortfolio); }, []);
  const cells = useMemo(() => calendarCells(month), [month]);
  const events = [...(portfolio?.incomeEvents ?? []).map((event) => ({ ...event, label: event.kind })), ...(portfolio?.dcaOrders ?? []).map((order) => ({ date: order.scheduledFor, symbol: order.symbol, kind: "dca", label: `DCA ${formatMoney(order.amount)}`, amount: -order.amount }))];
  const monthEvents = events.filter((event) => sameMonth(event.date, month));
  const income = monthEvents.filter((event) => event.kind === "payment").reduce((sum, event) => sum + (event.amount ?? 0), 0);

  return (
    <div className="grid gap-4 text-[#ececee] xl:grid-cols-[1fr_280px]">
      <section className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#161619]">
        <div className="flex items-center justify-between border-b border-[#2a2a31] p-4"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="text-[#8c8c95]">←</button><h2 className="font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="text-[#8c8c95]">→</button></div>
        <div className="grid grid-cols-7 border-b border-[#2a2a31]">{weekdays.map((day) => <div key={day} className="p-2 text-center text-[10px] uppercase tracking-wider text-[#5a5a62]">{day}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((cell, index) => <div key={index} className={`min-h-28 border-b border-r border-[#23232a] p-2 ${cell ? "" : "bg-[#121214]"}`}>{cell ? <><div className="font-mono text-xs text-[#8c8c95]">{cell}</div><div className="mt-2 space-y-1">{monthEvents.filter((event) => Number(event.date.slice(8,10)) === cell).map((event) => <button key={`${event.date}-${event.symbol}-${event.kind}`} type="button" onClick={() => openDetail(event.symbol)} className={`block w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-semibold ${event.kind === "payment" ? "bg-[#3ecf8e] text-[#06120c]" : event.kind === "dca" ? "bg-[#254a70] text-[#9bc8ff]" : "bg-[#463c1c] text-[#f5c451]"}`}>{event.symbol} · {event.label}</button>)}</div></> : null}</div>)}</div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-[#285f48] bg-[#173528] p-4"><div className="text-[10px] uppercase tracking-wider text-[#3ecf8e]">Income this month</div><div className="mt-2 font-mono text-3xl font-semibold">{formatMoney(income)}</div><div className="mt-1 text-xs text-[#82b99f]">Based on reported payment dates</div></div>
        <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-4"><h3 className="font-semibold">Month events</h3><div className="mt-4 space-y-3">{monthEvents.sort((a,b) => a.date.localeCompare(b.date)).map((event) => <button key={`${event.date}-${event.symbol}-${event.kind}`} onClick={() => openDetail(event.symbol)} className="flex w-full items-center gap-3 text-left"><span className={`h-2 w-2 rounded-full ${event.kind === "payment" ? "bg-[#3ecf8e]" : event.kind === "dca" ? "bg-[#74a4ff]" : "bg-[#f5c451]"}`} /><div className="flex-1"><div className="text-sm font-semibold">{event.symbol}</div><div className="text-xs text-[#8c8c95]">{event.date} · {event.label}</div></div></button>)}</div>{!monthEvents.length ? <p className="mt-6 text-sm text-[#5a5a62]">No income or DCA events this month.</p> : null}</div>
      </aside>
    </div>
  );
}

function calendarCells(month: Date): Array<number | null> { const first=new Date(month.getFullYear(),month.getMonth(),1).getDay(), days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(); return [...Array(first).fill(null), ...Array.from({length:days},(_,i)=>i+1), ...Array((7-(first+days)%7)%7).fill(null)]; }
function sameMonth(value: string, month: Date) { const date=new Date(`${value}T00:00:00`); return date.getFullYear()===month.getFullYear() && date.getMonth()===month.getMonth(); }
