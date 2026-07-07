import { formatMoney } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function IncomeList({ dash }: { dash: Dashboard }) {
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Upcoming income</h2>
        <span className="text-xs text-[#8c8c95]">Live calendar</span>
      </div>
      <div className="mt-4 space-y-3">
        {dash.portfolio?.incomeEvents.map((event) => (
          <div key={`${event.date}-${event.symbol}-${event.kind}`} className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${event.kind === "payment" ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`} />
            <div className="flex-1">
              <div className="text-sm font-semibold">{event.symbol} · {event.kind}</div>
              <div className="text-xs text-[#8c8c95]">{event.date}</div>
            </div>
            <span className="font-mono text-xs text-[#3ecf8e]">{event.amount ? `+${formatMoney(event.amount)}` : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
