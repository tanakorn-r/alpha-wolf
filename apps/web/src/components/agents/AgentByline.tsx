import type { AgentBadge } from "../../lib/api";

export function AgentByline({ agent, label = "Agent analysis", className = "mb-3" }: { agent?: AgentBadge | null; label?: string; className?: string }) {
  if (!agent) return null;
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5 ${className}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[9px] font-extrabold" style={{ color: agent.color, borderColor: `${agent.color}55`, background: `${agent.color}18` }}>
        {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : agent.mono}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5a5a62]">{label}</span>
      <span className="text-[11px] font-semibold" style={{ color: agent.color }}>{agent.name}</span>
      {agent.premium ? <span className="rounded-full border border-[#f5c451]/35 px-1.5 py-[1px] text-[8px] font-bold uppercase text-[#f5c451]">Pro</span> : null}
    </div>
  );
}

export function AgentSignoff({ agent, text }: { agent?: AgentBadge | null; text?: string }) {
  if (!agent && !text) return null;
  return (
    <div className="mt-4 text-right font-mono text-[11px]" style={{ color: agent?.color ?? "#5a5a62" }}>
      {text ?? `— ${agent?.name}`}
    </div>
  );
}
