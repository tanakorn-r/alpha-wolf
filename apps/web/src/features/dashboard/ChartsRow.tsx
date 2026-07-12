import { AllocationChart, DcaPerformanceChart } from "../../components/charts/PortfolioCharts";
import type { Dashboard } from "./useDashboard";

export function ChartsRow({ dash }: { dash: Dashboard }) {
  if (!dash.portfolio) return null;
  return (
    <section className="grid gap-[14px] lg:grid-cols-2">
      <div className="rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] p-4">
        <h2 className="font-semibold">Contribution performance</h2>
        <p className="mt-1 text-xs text-[#8c8c95]">Portfolio path with actual buy dates and capital added</p>
        <div className="mt-2 h-36"><DcaPerformanceChart data={dash.portfolio} /></div>
      </div>
      <div className="rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)] p-4">
        <h2 className="font-semibold">Allocation</h2>
        <p className="mt-1 text-xs text-[#8c8c95]">Live position value by sector</p>
        <div className="mt-2 h-36"><AllocationChart data={dash.portfolio} /></div>
      </div>
    </section>
  );
}
