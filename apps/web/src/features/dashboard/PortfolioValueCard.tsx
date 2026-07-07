import { ReferenceDot, ReferenceLine } from "recharts";
import { PortfolioPerformanceChart } from "../../components/charts/PortfolioCharts";
import { formatShortDate } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function PortfolioValueCard({ dash }: { dash: Dashboard }) {
  if (!dash.portfolio) return null;
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619] px-[18px] pb-[14px] pt-[18px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">Portfolio value</h2>
          <div className="mt-1 text-[11px] text-[#8c8c95]">
            Investing since <span className="font-mono text-[#74a4ff]">{formatShortDate(dash.firstBuyDate)}</span>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-[#8c8c95]">
            <Legend color="#3ecf8e" label="Value" />
            <Legend color="#5a5a62" label="Cost basis" dashed />
            <Legend color="#3ecf8e" label="Capital added" dot />
          </div>
        </div>
        <button type="button" onClick={dash.holdingForm.show} className="rounded-lg border border-[#34343c] px-3 py-2 text-xs hover:border-[#3ecf8e]">
          Edit holdings
        </button>
      </div>
      <div className="relative mt-1 h-[300px]">
        <PortfolioPerformanceChart data={dash.portfolio} loading={false} error={dash.isError} onRetry={dash.refresh}>
          {dash.firstBuyDate ? (
            <>
              <ReferenceLine x={dash.firstBuyDate} stroke="#74a4ff" strokeDasharray="4 4" />
              <ReferenceDot
                x={dash.firstBuyDate}
                y={dash.portfolio.chart[0]?.value}
                r={4}
                fill="#74a4ff"
                stroke="#0e0e10"
                strokeWidth={2}
                label={{ value: "First buy", position: "insideTopLeft", fill: "#74a4ff", fontSize: 10 }}
              />
            </>
          ) : null}
        </PortfolioPerformanceChart>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={dot ? "h-2 w-2 rounded-full" : "h-0 w-3 border-t-2"} style={{ background: dot ? color : undefined, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </span>
  );
}
