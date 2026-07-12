import type { AgentBadge } from "../../lib/api";

export function AgentByline({ agent, label = "Agent analysis", detail, className = "mb-3" }: { agent?: AgentBadge | null; label?: string; detail?: string; className?: string }) {
  if (!agent) return null;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-[9px] border font-mono text-[9px] font-extrabold" style={{ color: agent.color, borderColor: `${agent.color}55`, background: `${agent.color}18` }}>
        {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent.mono}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold text-[#ececee]">{agent.name}{detail ? <span className="font-medium text-[#5a5a62]"> · {label}</span> : null}</span>
        <span className="block text-[10px] font-semibold" style={{ color: detail ? "#8c8c95" : agent.color }}>{detail ?? label}</span>
      </span>
      {agent.premium ? <span className="rounded-[var(--aw-radius-chip)] border border-[#f5c451]/35 px-1.5 py-[1px] text-[8px] font-bold uppercase text-[#f5c451]">Pro</span> : null}
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
