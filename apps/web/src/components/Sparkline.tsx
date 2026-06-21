import { buildChartPath } from "../lib/chart";

export function Sparkline({ values, color, width = 64, height = 22 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} viewBox="0 0 100 100" />;
  return (
    <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" className="block">
      <path d={buildChartPath(values)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
