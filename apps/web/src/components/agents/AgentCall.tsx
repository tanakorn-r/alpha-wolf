import type { ReactNode } from "react";
import type { AgentBadge, MarketDataTrust } from "../../lib/api";
import { DataTrustBadge } from "../DataTrustBadge";
import { Ring } from "../../lib/ring";
import { AgentActionButton } from "./AgentActionButton";
import { AgentCard } from "./AgentCard";
import { AgentSignoff } from "./AgentByline";
import { actionPositionLabel, actionPositionTone } from "../../lib/actionPosition";

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
  scoreMode = "strength",
  scoreNote,
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
  dataTrust,
}: {
  agent?: AgentBadge | null;
  label: string;
  score?: number | null;
  scoreLabel?: string;
  scoreMode?: "strength" | "action";
  scoreNote?: ReactNode;
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
  dataTrust?: MarketDataTrust | null;
}) {
  const color = accent ?? agent?.color ?? "#3ecf8e";
  const safeScore = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const roundedScore = safeScore === null ? null : Math.round(safeScore);
  const band = safeScore === null ? null : scoreBand(safeScore);
  const action = safeScore === null ? null : actionPositionLabel(safeScore);
  const actionColor = safeScore === null ? color : actionPositionTone(safeScore);
  const visibleBullets = bullets.slice(0, 3);
  const hiddenBullets = bullets.slice(3);

  return (
    <AgentCard agent={agent} label={label} detail={bylineDetail} accent={color} className={`shadow-[0_28px_80px_rgba(0,0,0,0.28)] ${density === "compact" ? "!p-4" : ""}`}>
      <div className={`mt-4 grid min-w-0 items-start gap-4 ${safeScore !== null ? "@min-[720px]:grid-cols-[minmax(0,1fr)_214px]" : ""}`}>
      <div className="min-w-0 @min-[720px]:col-start-2 @min-[720px]:row-start-1 @min-[720px]:justify-self-end">
        {safeScore !== null && scoreMode === "action" ? (
          <div
            className="aw-agent-score-panel w-full min-[720px]:w-[214px] rounded-[12px] border border-white/[0.08] bg-[#0e0e10]/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
            aria-label={`${scoreLabel}: ${action}. Position ${roundedScore} out of 100, from sell to buy.`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#8c8c95]">{scoreLabel}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: actionColor }}>{action}</div>
            </div>
            <div className="relative mt-3 h-2 rounded-full bg-[linear-gradient(90deg,#f2575c_0%,#f5c451_50%,#3ecf8e_100%)]">
              <span
                className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#ececee] shadow-[0_0_0_3px_rgba(14,14,16,0.8)]"
                style={{ left: `${safeScore}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[8px] font-semibold uppercase tracking-[0.04em] text-[#6f6f78]">
              <span>Sell</span><span>Hold</span><span>Buy</span>
            </div>
            {scoreNote ? <div className="mt-1.5 text-[8.5px] text-[#6f6f78]">{scoreNote}</div> : null}
          </div>
        ) : safeScore !== null ? (
          <div
            className="aw-agent-score-panel flex w-full items-center gap-2.5 rounded-[12px] border border-white/[0.08] bg-[#0e0e10]/90 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)] min-[720px]:w-auto"
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

      <div className="min-w-0 max-w-[860px] @min-[720px]:col-start-1 @min-[720px]:row-start-1">
        <span className="inline-flex rounded-[var(--aw-radius-chip)] border-[1.5px] px-3 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.05em]" style={{ color, borderColor: color, background: `${color}0d` }}>
          {signal}
        </span>
        <h2 className={`${density === "compact" ? "mt-2 text-[17px]" : "mt-3 text-[19px]"} font-bold leading-[1.25] tracking-[-0.3px] text-[#ececee]`}>{headline}</h2>
        {summary ? <div className={`${density === "compact" ? "mt-1.5 text-[12.5px] leading-[1.55]" : "mt-2 text-[13.5px] leading-[1.65]"} line-clamp-3 text-[#bcbcc2]`}>{summary}</div> : null}
      </div>
      </div>

      {metrics.length ? (
        <div className="mt-5 grid gap-2.5 @min-[520px]:grid-cols-2 @min-[780px]:grid-cols-3">
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
          {visibleBullets.map((bullet, index) => (
            <div key={index} className={`flex gap-2.5 leading-[1.55] text-[#cfcfd4] ${density === "compact" ? "text-[12px]" : "text-[13px]"}`}>
              <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} /><span className="line-clamp-2">{bullet}</span>
            </div>
          ))}
          {hiddenBullets.length ? <details className="mt-1 rounded-[8px] border border-white/[0.06] bg-black/10 px-3 py-2"><summary className="cursor-pointer text-[9.5px] font-bold" style={{ color }}>Show {hiddenBullets.length} more insight{hiddenBullets.length === 1 ? "" : "s"}</summary><div className="mt-2 grid gap-2">{hiddenBullets.map((bullet, index) => <div key={index} className={`flex gap-2.5 leading-[1.55] text-[#b8b8c0] ${density === "compact" ? "text-[11px]" : "text-[12px]"}`}><span style={{ color }}>•</span><span>{bullet}</span></div>)}</div></details> : null}
        </div>
      ) : null}

      {children}

      {dataTrust !== undefined ? <DataTrustBadge trust={dataTrust} className="mt-4" /> : null}

      {meta || onRerun ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: `${color}30` }}>
          <div className="font-mono text-[10.5px] text-[#5a5a62]">{meta}</div>
          {onRerun ? <AgentActionButton agent={agent} label="Refresh" sublabel="Re-run Agent" onClick={onRerun} className="h-9" /> : null}
        </div>
      ) : null}
      {signoff !== false ? <AgentSignoff agent={agent} text={signoff || undefined} /> : null}
    </AgentCard>
  );
}
