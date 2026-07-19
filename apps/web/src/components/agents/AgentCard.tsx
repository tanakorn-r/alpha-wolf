import type { CSSProperties, ReactNode } from "react";
import type { AgentBadge } from "../../lib/api";
import { AgentByline } from "./AgentByline";

export function AgentCard({
  agent,
  label,
  children,
  className = "",
  accent,
  detail,
}: {
  agent?: AgentBadge | null;
  label?: string;
  children: ReactNode;
  className?: string;
  accent?: string;
  detail?: string;
}) {
  const color = accent ?? agent?.color ?? "#3ecf8e";
  const style = {
    "--agent-accent": color,
    borderColor: `${color}58`,
    background: `linear-gradient(135deg, ${color}14, rgba(19,19,23,0.92) 55%, rgba(14,14,16,0.98))`,
  } as CSSProperties;

  return (
    <section className={`@container relative overflow-hidden rounded-[var(--aw-radius-card)] border p-5 ${className}`} style={style}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--agent-accent),transparent)] opacity-70" />
      <AgentByline agent={agent} label={label} detail={detail} />
      {children}
    </section>
  );
}
