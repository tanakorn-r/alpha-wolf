import type { AgentBadge } from "../../lib/api";
import { LoadingSpinner } from "../LoadingSpinner";

export function AgentActionButton({
  agent,
  fallbackName = "Agent",
  label,
  sublabel = "Choose Action Sheet →",
  onClick,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
}: {
  agent?: AgentBadge | null;
  fallbackName?: string;
  label?: string;
  sublabel?: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const color = agent?.color || "#3ecf8e";
  const name = agent?.name || fallbackName;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={`${label ?? `Ask ${name}`}, ${sublabel}`}
      className={`group relative inline-flex h-11 overflow-hidden rounded-[10px] p-px transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 ${className}`}
      style={{ background: `linear-gradient(120deg, ${color}, #57a8ff 52%, #c77dff)`, outlineColor: color }}
    >
      <span className="flex h-full w-full items-center gap-2.5 rounded-[9px] bg-[#0d0f10] px-2.5 pr-3.5 transition-colors group-hover:bg-[#13161a]">
        <span className="grid h-7 w-7 flex-none place-items-center overflow-hidden rounded-[7px] border bg-black/20 font-mono text-[9px] font-black" style={{ borderColor: `${color}66`, color }}>
          {loading ? <LoadingSpinner size={12} /> : agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent?.mono || name.slice(0, 1)}
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-[11.5px] font-extrabold leading-[1.05] text-[#ececee]">{label ?? `Ask ${name}`}</span>
          <span className="mt-1 block truncate text-[8.5px] font-bold uppercase tracking-[0.08em]" style={{ color }}>{sublabel}</span>
        </span>
      </span>
    </button>
  );
}
