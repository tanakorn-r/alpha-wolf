import type { ReactNode } from "react";

export type DrawerMetricTone = "good" | "warn" | "amber" | "bad" | "neutral";

export function DrawerMetric({ label, value, tone = "neutral", detail, badge, className = "" }: {
  label: string;
  value: ReactNode;
  tone?: DrawerMetricTone;
  detail?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  const color = tone === "good" ? "#3ecf8e" : tone === "warn" ? "#74a4ff" : tone === "amber" ? "#f5c451" : tone === "bad" ? "#f2575c" : "#ececee";
  return (
    <div className={`min-w-0 rounded-[var(--aw-radius-control)] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: tone === "neutral" ? "#5a5a62" : color }} />
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: tone === "neutral" ? "#8c8c95" : color }}>{label}</span>
        </div>
        {badge}
      </div>
      <div className="mt-1 min-w-0 break-words font-mono text-[16px] font-bold leading-tight" style={{ color }}>{value}</div>
      {detail ? <div className="mt-1 text-[10px] leading-[1.35] text-[#8c8c95]">{detail}</div> : null}
    </div>
  );
}
