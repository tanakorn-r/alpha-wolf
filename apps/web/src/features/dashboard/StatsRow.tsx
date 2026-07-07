import { Money } from "../../components/Money";
import { formatPercent } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function StatsRow({ dash }: { dash: Dashboard }) {
  const summary = dash.summary;
  return (
    <section className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
      <Stat label="Total value" value={<Money value={summary?.totalValue} />} />
      <Stat label="Invested (cost)" value={<Money value={summary?.invested} />} />
      <Stat label="Total gain / loss" value={<Money value={summary?.gainLoss} />} sub={formatPercent(summary?.gainLossPct)} tone={(summary?.gainLoss ?? 0) >= 0 ? "good" : "bad"} />
      <Stat label="Dividends YTD" value={<Money value={summary?.dividendsYtd} />} sub={`${summary?.forwardYield ?? 0}% forward yield`} />
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] px-[18px] py-4">
      <div className="text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">{label}</div>
      <div className={`mt-[7px] font-mono text-[25px] font-semibold tracking-[-0.5px] ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : ""}`}>{value}</div>
      {sub ? <div className="mt-px font-mono text-xs text-[#8c8c95]">{sub}</div> : null}
    </div>
  );
}
