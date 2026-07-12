import { Money } from "../../components/Money";
import { MetricCard } from "../../components/ui/Surface";
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
    <section className="grid grid-cols-1 gap-[10px] min-[420px]:grid-cols-2 min-[800px]:grid-cols-4">
      <MetricCard
        label="Total value"
        value={<Money value={totalValue} />}
        detail={holdings.length ? `Today ${signed(dayChange)} · ${formatPercent(dayChangePct)}` : undefined}
        detailTone={tone(dayChange)}
        compact
      />
      <MetricCard label="Invested (cost)" value={<Money value={summary?.invested} />} detail={holdings.length ? `${holdings.length} position${holdings.length === 1 ? "" : "s"}` : undefined} compact />
      <MetricCard label="Total gain / loss" value={<Money value={gainLoss} />} detail={formatPercent(summary?.gainLossPct)} tone={tone(gainLoss)} detailTone={tone(gainLoss)} compact />
      <MetricCard label="Annual income" value={<Money value={annualIncome} />} detail={`${forwardYield}% forward yield`} compact />
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
