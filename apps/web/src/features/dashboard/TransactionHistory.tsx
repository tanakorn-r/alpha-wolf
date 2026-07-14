import { Money } from "../../components/Money";
import { formatShortDate } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function TransactionHistory({ dash }: { dash: Dashboard }) {
  const transactions = [...(dash.portfolio?.transactions ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
  if (!transactions.length) return null;
  return (
    <section className="overflow-hidden rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)]">
      <div className="flex items-center justify-between border-b border-[#2a2a31] px-4 py-3">
        <div><h2 className="font-semibold">Transaction history</h2><p className="mt-0.5 text-[10.5px] text-[#8c8c95]">Auditable buys, sales, fees, and realized results</p></div>
        <span className="font-mono text-xs text-[#8c8c95]">{transactions.length} records</span>
      </div>
      <div className="divide-y divide-[#23232a]">
        {transactions.slice(0, 20).map((item) => {
          const sell = item.kind === "SELL";
          return (
            <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
              <span className={`rounded-[5px] border px-2 py-1 font-mono text-[9px] font-bold ${sell ? "border-[#f2575c]/35 bg-[#f2575c]/10 text-[#f2575c]" : "border-[#3ecf8e]/35 bg-[#3ecf8e]/10 text-[#3ecf8e]"}`}>{item.kind}</span>
              <div className="min-w-0"><div className="font-mono text-[12px] font-semibold">{item.symbol} · {item.shares.toLocaleString("en-US", { maximumFractionDigits: 6 })} units</div><div className="mt-0.5 text-[10px] text-[#6f6f78]">{formatShortDate(item.occurredAt)}{item.fees ? ` · fees included` : ""}{item.source === "OPENING_BALANCE" ? " · migrated opening lot" : ""}</div></div>
              <div className="text-right"><div className="font-mono text-[12px]"><Money value={item.amount} /></div>{sell && item.realizedPnl != null ? <div className={`mt-0.5 font-mono text-[10px] ${item.realizedPnl >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>P/L <Money value={item.realizedPnl} /></div> : null}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
