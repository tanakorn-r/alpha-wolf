import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export const surfaceClasses = {
  card: "rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)]",
  inset: "rounded-[var(--aw-radius-control)] border border-[var(--aw-border)] bg-[var(--aw-canvas)]",
  frame: "rounded-[var(--aw-radius-frame)] border border-[var(--aw-border)] bg-[var(--aw-surface)]",
} as const;

export function SectionHeading({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a5a62]">{eyebrow}</div> : null}
        <h2 className="text-[18px] font-bold tracking-[-0.25px] text-[#ececee]">{title}</h2>
        {body ? <p className="mt-1 text-[12.5px] leading-[1.55] text-[#8c8c95]">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, detail, tone = "default", compact = false, detailTone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "default" | "good" | "bad" | "warn"; compact?: boolean; detailTone?: "default" | "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "#3ecf8e" : tone === "bad" ? "#f2575c" : tone === "warn" ? "#f5c451" : "#ececee";
  const detailColor = detailTone === "good" ? "#3ecf8e" : detailTone === "bad" ? "#f2575c" : detailTone === "warn" ? "#f5c451" : "#8c8c95";
  return (
    <Surface className={`min-w-0 ${compact ? "px-3.5 py-3" : "px-4 py-3.5"}`}>
      <div className={`${compact ? "text-[9.5px]" : "text-[10.5px]"} font-semibold uppercase tracking-[0.06em] text-[#8c8c95]`}>{label}</div>
      <div className={`${compact ? "mt-1 text-[20px]" : "mt-1.5 text-[23px]"} min-w-0 break-words font-mono font-semibold`} style={{ color }}>{value}</div>
      {detail ? <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: detailColor }}>{detail}</div> : null}
    </Surface>
  );
}

export function Surface<T extends ElementType = "section">({
  as,
  tone = "card",
  className = "",
  children,
  ...props
}: {
  as?: T;
  tone?: keyof typeof surfaceClasses;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Component = as ?? "section";
  return <Component className={`${surfaceClasses[tone]} ${className}`} {...props}>{children}</Component>;
}
