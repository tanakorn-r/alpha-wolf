import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { loadAgents, type AgentProfile } from "../../lib/api";

type Props = {
  activeAgentId: string;
  onUse: (agentId: string) => void;
  onClose: () => void;
};

export function AgentPickerModal({ activeAgentId, onUse, onClose }: Props) {
  const { data: agents = [], isLoading } = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const [profileId, setProfileId] = useState(activeAgentId);
  const profile = useMemo(() => agents.find((agent) => agent.id === profileId) ?? agents.find((agent) => agent.id === activeAgentId) ?? agents[0], [activeAgentId, agents, profileId]);

  function useAgent(agentId: string) {
    onUse(agentId);
    setProfileId(agentId);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[14px] border border-[#34343c] bg-[#111114] shadow-2xl">
        <div className="flex flex-none items-center justify-between border-b border-[#2a2a31] bg-[#161619] px-5 py-3.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5a5a62]">AlphaWolf</div>
            <h2 className="mt-1 text-[18px] font-extrabold tracking-[-0.2px] text-[#ececee]">Choose your agent</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#2a2a31] bg-[#0e0e10] text-[18px] leading-none text-[#8c8c95] hover:border-[#5a5a62] hover:text-[#ececee]" aria-label="Close agent picker">
            ×
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-[13px] text-[#8c8c95]">Loading agent profiles...</div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden min-[860px]:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid content-start gap-3 overflow-y-auto p-4 min-[620px]:grid-cols-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  active={agent.id === activeAgentId}
                  selected={agent.id === profile?.id}
                  onProfile={() => setProfileId(agent.id)}
                  onUse={() => useAgent(agent.id)}
                />
              ))}
            </div>
            {profile ? <AgentProfileView agent={profile} active={profile.id === activeAgentId} onUse={() => useAgent(profile.id)} /> : null}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function AgentCard({ agent, active, selected, onProfile, onUse }: { agent: AgentProfile; active: boolean; selected: boolean; onProfile: () => void; onUse: () => void }) {
  return (
    <button
      type="button"
      onClick={onProfile}
      className="min-h-[142px] rounded-[11px] border bg-[#161619] p-3.5 text-left transition-colors hover:border-[#5a5a62]"
      style={{ borderColor: active || selected ? agent.color : "#2a2a31", background: active ? `${agent.color}12` : "#161619" }}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[14px] font-extrabold text-[#ececee]">{agent.name}</div>
            {active ? <span className="rounded-[5px] px-2 py-[2px] text-[9px] font-bold uppercase" style={{ background: `${agent.color}1f`, color: agent.color }}>Active</span> : null}
            {agent.premium ? <span className="rounded-[5px] border border-[#f5c451]/40 bg-[#f5c451]/10 px-2 py-[2px] text-[9px] font-bold uppercase text-[#f5c451]">Pro</span> : null}
          </div>
          <div className="mt-[2px] text-[11px] font-semibold" style={{ color: agent.color }}>{agent.title} · {agent.years}y</div>
          <div className="mt-[6px] text-[11px] leading-[1.45] text-[#8c8c95]">{agent.tagline}</div>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[11.5px] leading-[1.5] text-[#bcbcc2]">{agent.bio}</p>
      <div className="mt-2.5 flex justify-end">
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onUse();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onUse();
            }
          }}
          className="rounded-[7px] border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em]"
          style={{ borderColor: `${agent.color}55`, color: active ? "#0e0e10" : agent.color, background: active ? agent.color : `${agent.color}12` }}
        >
          {active ? "Using" : "Use"}
        </span>
      </div>
    </button>
  );
}

function AgentProfileView({ agent, active, onUse }: { agent: AgentProfile; active: boolean; onUse: () => void }) {
  const styleEntries = Object.entries(agent.style) as Array<[keyof AgentProfile["style"], number]>;
  return (
    <aside className="min-h-0 overflow-y-auto border-t border-[#2a2a31] bg-[#0e0e10] p-4 min-[860px]:border-l min-[860px]:border-t-0">
      <div className="rounded-[13px] p-[1.5px]" style={{ background: `linear-gradient(135deg,${agent.color},#2a2a31 45%,${agent.color}66)` }}>
        <div className="rounded-[11px] bg-[#161619] p-3.5">
          <div className="flex items-start gap-3">
            <AgentAvatar agent={agent} size="xl" />
            <div>
              <div className="text-[17px] font-extrabold tracking-[-0.2px] text-[#ececee]">{agent.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold" style={{ color: agent.color }}>
                <span>{agent.title} · {agent.years} years</span>
                {agent.premium ? <span className="rounded-[5px] border border-[#f5c451]/40 bg-[#f5c451]/10 px-2 py-[2px] text-[9px] font-bold uppercase text-[#f5c451]">Premium</span> : null}
              </div>
              <div className="mt-2 text-[12px] leading-[1.5] text-[#bcbcc2]">{agent.bio}</div>
            </div>
          </div>
          <blockquote className="mt-3 rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 text-[12px] italic leading-[1.5] text-[#ececee]">
            {agent.belief}
          </blockquote>
        </div>
      </div>

      <div className="mt-3.5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">Trading style</div>
        <div className="grid gap-2">
          {styleEntries.map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[10.5px]">
                <span className="font-semibold text-[#bcbcc2]">{label}</span>
                <span className="font-mono font-bold" style={{ color: agent.color }}>{value}</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-[#252529]">
                <div className="h-full rounded-full" style={{ width: `${value}%`, background: agent.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">Knowledge</div>
        <div className="flex flex-wrap gap-2">
          {agent.knows.map((item) => (
            <span key={item} className="rounded-[7px] border border-[#2a2a31] bg-[#161619] px-2.5 py-1.5 text-[10.5px] text-[#bcbcc2]">{item}</span>
          ))}
        </div>
      </div>

      <button type="button" onClick={onUse} className="mt-4 w-full rounded-[9px] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#0e0e10]" style={{ background: agent.color }}>
        {active ? "Active agent" : `Use ${agent.name}`}
      </button>
    </aside>
  );
}

function AgentAvatar({ agent, size }: { agent: AgentProfile; size: "lg" | "xl" }) {
  const className = size === "xl" ? "h-14 w-14 rounded-[14px] text-[16px]" : "h-11 w-11 rounded-[12px] text-[13px]";
  return (
    <div className={`flex flex-none items-center justify-center overflow-hidden border font-mono font-extrabold ${className}`} style={{ color: agent.color, borderColor: `${agent.color}55`, background: `${agent.color}18` }}>
      {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent.mono}
    </div>
  );
}
