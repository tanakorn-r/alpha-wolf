import type { ReactNode } from "react";

export type AdvancedInsightTone = "green" | "blue" | "amber" | "purple" | "gold" | "neutral";

export function AdvancedInsightCard({ label, title, detail, badge, tone = "neutral" }: {
  label: string;
  title: ReactNode;
  detail: ReactNode;
  badge?: ReactNode;
  tone?: AdvancedInsightTone;
}) {
  const color = tone === "green" ? "#3ecf8e" : tone === "blue" ? "#74a4ff" : tone === "amber" ? "#f5c451" : tone === "purple" ? "#c77dff" : tone === "gold" ? "#d9b85f" : "#8c8c95";

  return (
    <article className="min-w-0 rounded-[var(--aw-radius-control)] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color }}>{label}</span>
        {badge ? <span className="flex-none rounded-[var(--aw-radius-chip)] border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.03em]" style={{ color, borderColor: `${color}55`, background: `${color}10` }}>{badge}</span> : null}
      </div>
      <h4 className="mt-2 break-words font-mono text-[15px] font-bold leading-[1.25]" style={{ color }}>{title}</h4>
      <div className="mt-1.5 text-[11.5px] leading-[1.55] text-[#bcbcc2]">{detail}</div>
    </article>
  );
}
