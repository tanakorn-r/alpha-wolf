import type { ReactNode } from "react";
import type { AgentBadge } from "../../lib/api";
import { Ring } from "../../lib/ring";
import { PremiumAiButton } from "../PremiumAiButton";
import { AgentCard } from "./AgentCard";
import { AgentSignoff } from "./AgentByline";

export type AgentCallMetric = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  color?: string;
};

function scoreBand(score: number) {
  if (score >= 80) return "Very high";
  if (score >= 60) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

export function AgentCall({
  agent,
  label,
  score,
  scoreLabel = "confidence",
  signal,
  headline,
  summary,
  metrics = [],
  bullets = [],
  meta,
  onRerun,
  children,
  accent,
  signoff,
  density = "default",
  bylineDetail,
}: {
  agent?: AgentBadge | null;
  label: string;
  score?: number | null;
  scoreLabel?: string;
  signal: ReactNode;
  headline: ReactNode;
  summary?: ReactNode;
  metrics?: AgentCallMetric[];
  bullets?: ReactNode[];
  meta?: ReactNode;
  onRerun?: () => void;
  children?: ReactNode;
  accent?: string;
  signoff?: string | false;
  density?: "default" | "compact";
  bylineDetail?: string;
}) {
  const color = accent ?? agent?.color ?? "#3ecf8e";
  const safeScore = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const roundedScore = safeScore === null ? null : Math.round(safeScore);
  const band = safeScore === null ? null : scoreBand(safeScore);

  return (
    <AgentCard agent={agent} label={label} detail={bylineDetail} accent={color} className={`shadow-[0_28px_80px_rgba(0,0,0,0.28)] ${density === "compact" ? "!p-4" : ""}`}>
      <div className={`absolute ${density === "compact" ? "right-4 top-4" : "right-5 top-4"} max-[720px]:relative max-[720px]:right-auto max-[720px]:top-auto max-[720px]:mb-4`}>
        {safeScore !== null ? (
          <div
            className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.08] bg-[#0e0e10]/90 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
            aria-label={`${scoreLabel}: ${roundedScore} out of 100, ${band}`}
            title={`Higher means stronger ${scoreLabel.toLowerCase()}.`}
          >
            <div className={`relative flex-none ${density === "compact" ? "h-10 w-10" : "h-12 w-12"}`}>
              <Ring score={safeScore} color={color} size={density === "compact" ? 40 : 48} stroke={density === "compact" ? 5 : 6} />
              <div className={`absolute inset-0 grid place-items-center font-mono font-bold ${density === "compact" ? "text-[13px]" : "text-[15px]"}`} style={{ color }}>{roundedScore}</div>
            </div>
            <div className="min-w-[104px] max-w-[150px]">
              <div className="truncate text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#8c8c95]">{scoreLabel}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[12px] font-bold text-[#ececee]">{roundedScore}/100</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.04em]" style={{ color }}>{band}</span>
              </div>
              <div className="mt-0.5 text-[8px] text-[#5f5f68]">Higher = stronger</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="max-w-[860px] pr-[210px] max-[720px]:pr-0">
        <span className="inline-flex rounded-[var(--aw-radius-chip)] border-[1.5px] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.05em]" style={{ color, borderColor: color, background: `${color}0d` }}>
          {signal}
        </span>
        <h2 className={`${density === "compact" ? "mt-2 text-[17px]" : "mt-3 text-[19px]"} font-bold leading-[1.25] tracking-[-0.3px] text-[#ececee]`}>{headline}</h2>
        {summary ? <div className={`${density === "compact" ? "mt-1.5 text-[12.5px] leading-[1.55]" : "mt-2 text-[13.5px] leading-[1.65]"} text-[#bcbcc2]`}>{summary}</div> : null}
      </div>

      {metrics.length ? (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#8c8c95]">{metric.label}</div>
              <div className="mt-1.5 font-mono text-[17px] font-semibold" style={{ color: metric.color ?? "#ececee" }}>{metric.value}</div>
              {metric.note ? <div className="mt-1 text-[10.5px] leading-[1.45] text-[#5a5a62]">{metric.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {bullets.length ? (
        <div className={`${density === "compact" ? "mt-3 gap-1.5" : "mt-5 gap-2.5"} grid`}>
          {bullets.map((bullet, index) => (
            <div key={index} className={`flex gap-2.5 leading-[1.55] text-[#cfcfd4] ${density === "compact" ? "text-[12px]" : "text-[13px]"}`}>
              <span style={{ color }}>●</span><span>{bullet}</span>
            </div>
          ))}
        </div>
      ) : null}

      {children}

      {meta || onRerun ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: `${color}30` }}>
          <div className="font-mono text-[10.5px] text-[#5a5a62]">{meta}</div>
          {onRerun ? <PremiumAiButton label="Re-run" sublabel="Agent" onClick={onRerun} size="xs" /> : null}
        </div>
      ) : null}
      {signoff !== false ? <AgentSignoff agent={agent} text={signoff || undefined} /> : null}
    </AgentCard>
  );
}
