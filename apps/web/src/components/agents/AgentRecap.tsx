import type { AgentBadge } from "../../lib/api";

export function AgentRecap({
  agent,
  recap,
  fit,
  reason,
  quoteOnly = false,
  className = "mt-4",
}: {
  agent?: AgentBadge | null;
  recap?: string | null;
  fit?: "aligned" | "neutral" | "against" | null;
  reason?: string | null;
  quoteOnly?: boolean;
  className?: string;
}) {
  if (!recap) return null;
  const meta =
    fit === "aligned"
      ? { fallbackColor: "#3ecf8e", label: "Fits my strategy" }
      : fit === "against"
        ? { fallbackColor: "#f2575c", label: "Not my setup" }
        : { fallbackColor: "#f5c451", label: "OK, not my ideal setup" };
  const color = agent?.color ?? meta.fallbackColor;
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--aw-radius-control)] border px-3.5 py-3 shadow-[0_18px_54px_rgba(0,0,0,0.28)] ${className}`}
      style={{
        borderColor: `${color}66`,
        background: `radial-gradient(circle at 6% 0%, ${color}2b, transparent 34%), radial-gradient(circle at 92% 15%, ${color}1c, transparent 30%), linear-gradient(135deg, ${color}12, rgba(14,14,16,0.82) 56%, rgba(14,14,16,0.96))`,
        boxShadow: `0 0 0 1px ${color}18 inset, 0 18px 54px rgba(0,0,0,0.32), 0 0 42px ${color}12`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>{agent?.name ?? "Agent"} {quoteOnly ? "says" : "recap"}</span>
        <span className="rounded-[5px] border px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ borderColor: `${color}55`, color, background: `${color}14` }}>{meta.label}</span>
      </div>
      {quoteOnly ? (
        <p className="mt-2 text-[14px] font-medium italic leading-[1.6] text-[#ececee]">“{reason ?? recap}”</p>
      ) : (
        <>
          <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[#ececee]">{recap}</p>
          {reason ? <p className="mt-1 text-[11px] italic leading-[1.5] text-[#8c8c95]">“{reason}”</p> : null}
        </>
      )}
    </div>
  );
}
