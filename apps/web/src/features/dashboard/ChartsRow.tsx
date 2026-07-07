import { AllocationChart, DcaPerformanceChart } from "../../components/charts/PortfolioCharts";
import type { Dashboard } from "./useDashboard";

export function ChartsRow({ dash }: { dash: Dashboard }) {
  if (!dash.portfolio) return null;
  return (
    <section className="grid gap-[14px] lg:grid-cols-2">
      <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-[18px]">
        <h2 className="font-semibold">Contribution performance</h2>
        <p className="mt-1 text-xs text-[#8c8c95]">Portfolio path with actual buy dates and capital added</p>
        <div className="mt-3 h-52"><DcaPerformanceChart data={dash.portfolio} /></div>
      </div>
      <div className="rounded-xl border border-[#2a2a31] bg-[#161619] p-[18px]">
        <h2 className="font-semibold">Allocation</h2>
        <p className="mt-1 text-xs text-[#8c8c95]">Live position value by sector</p>
        <div className="mt-3 h-52"><AllocationChart data={dash.portfolio} /></div>
      </div>
    </section>
  );
}
