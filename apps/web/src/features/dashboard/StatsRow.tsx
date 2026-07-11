import { Money } from "../../components/Money";
import { formatMoneyBaht, formatPercent } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function StatsRow({ dash }: { dash: Dashboard }) {
  const summary = dash.summary;
  const holdings = dash.portfolio?.holdings ?? [];
  const totalValue = summary?.totalValue ?? 0;

  // Today's move, weighted by each position's value (holding.value + changePct are day figures).
  const dayChange = holdings.reduce((sum, holding) => sum + (holding.value * (holding.changePct ?? 0)) / 100, 0);
  const prevValue = totalValue - dayChange;
  const dayChangePct = prevValue > 0 ? (dayChange / prevValue) * 100 : 0;

  const gainLoss = summary?.gainLoss ?? 0;
  const forwardYield = summary?.forwardYield ?? 0;
  const annualIncome = (totalValue * forwardYield) / 100;

  return (
    <section className="grid grid-cols-1 gap-[10px] min-[420px]:grid-cols-2 min-[720px]:gap-[14px] xl:grid-cols-4">
      <Stat
        label="Total value"
        value={<Money value={totalValue} />}
        sub={holdings.length ? `Today ${signed(dayChange)} · ${formatPercent(dayChangePct)}` : undefined}
        subTone={tone(dayChange)}
      />
      <Stat label="Invested (cost)" value={<Money value={summary?.invested} />} sub={holdings.length ? `${holdings.length} position${holdings.length === 1 ? "" : "s"}` : undefined} />
      <Stat label="Total gain / loss" value={<Money value={gainLoss} />} sub={formatPercent(summary?.gainLossPct)} tone={tone(gainLoss)} subTone={tone(gainLoss)} />
      <Stat label="Annual income" value={<Money value={annualIncome} />} sub={`${forwardYield}% forward yield`} />
    </section>
  );
}

function signed(value: number) {
  const text = formatMoneyBaht(Math.abs(value));
  return value < 0 ? `−${text}` : `+${text}`;
}

function tone(value: number): "good" | "bad" | undefined {
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return undefined;
}

function Stat({ label, value, sub, tone, subTone }: { label: string; value: React.ReactNode; sub?: string; tone?: "good" | "bad"; subTone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2a2a31] bg-[#161619] px-4 py-3.5 min-[720px]:px-[18px] min-[720px]:py-4">
      <div className="text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">{label}</div>
      <div className={`mt-[7px] min-w-0 break-words font-mono text-[21px] font-semibold min-[720px]:text-[25px] ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : ""}`}>{value}</div>
      {sub ? <div className={`mt-px font-mono text-xs ${subTone === "good" ? "text-[#3ecf8e]" : subTone === "bad" ? "text-[#f2575c]" : "text-[#8c8c95]"}`}>{sub}</div> : null}
    </div>
  );
}
