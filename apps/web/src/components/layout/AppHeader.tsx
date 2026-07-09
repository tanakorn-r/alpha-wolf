import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { AgentPickerModal } from "../agents/AgentPickerModal";
import { loadAgents } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";

export function AppHeader() {
  const location = useLocation();
  const [agentOpen, setAgentOpen] = useState(false);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const setActiveAgent = useWolfStore((state) => state.setActiveAgent);
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];
  const isHuntAi = location.pathname === "/hunt-ai";
  const page = location.pathname === "/scanner"
    ? { title: "DCA Scanner", subtitle: "Search any stock, then tap for an AI buy / wait verdict" }
    : location.pathname === "/daily-brief"
      ? { title: "Daily Brief", subtitle: "What moved, what pays, what needs action" }
    : location.pathname === "/live-trade"
      ? { title: "Live Trade", subtitle: "TradingView chart plus live US screener reads" }
    : isHuntAi
      ? { title: "Hunt AI", subtitle: "Daily signals, entry zones and position sizing — updated every morning" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "When your dividend money actually lands" }
      : { title: "Strategy Dashboard", subtitle: "Everything happening with your money, in one view" };

  return (
    <header className="aw-header sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-[#2a2a31] px-7 pb-[18px] pt-[22px]">
      <div className="min-w-0">
        <h1 className="m-0 text-[21px] font-bold tracking-[-0.4px] text-[#ececee]">{page.title}</h1>
        <p className="mt-[3px] max-w-[760px] truncate text-[13px] text-[#8c8c95]">{page.subtitle}</p>
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-2.5">
        {activeAgent ? (
          <button type="button" onClick={() => setAgentOpen(true)} className="flex h-[38px] items-center gap-2 rounded-[8px] border border-[#2a2a31] bg-[#161619] px-2.5 text-left text-[#bcbcc2] hover:border-[#5a5a62]" aria-label={`Choose agent, active ${activeAgent.name}`}>
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-[6px] border font-mono text-[9.5px] font-extrabold" style={{ color: activeAgent.color, borderColor: `${activeAgent.color}55`, background: `${activeAgent.color}18` }}>
              {activeAgent.avatarUrl ? <img src={activeAgent.avatarUrl} alt="" className="h-full w-full object-cover" /> : activeAgent.mono}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-[8.5px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">{activeAgent.premium ? "Pro Agent" : "Agent"}</span>
              <span className="block max-w-[118px] truncate text-[11.5px] font-bold leading-[1.1] text-[#ececee]">{activeAgent.name}</span>
            </span>
            <span className="text-[10px] text-[#5a5a62]">⌄</span>
          </button>
        ) : null}
        {isHuntAi ? (
          <>
          <div className="flex h-[38px] overflow-hidden rounded-[8px] border border-[#2a2a31] bg-[#161619] p-1 font-mono text-[11px] font-semibold text-[#bcbcc2]">
            <span className="rounded-[6px] px-2.5 py-1.5">$ USD</span>
            <span className="rounded-[6px] px-2.5 py-1.5">฿ THB</span>
          </div>
          <span className="font-mono text-[11px] text-[#5a5a62]">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).replace(",", " ·")}</span>
          </>
        ) : (
          <span className="font-mono text-[11px] text-[#5a5a62]">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
        )}
      </div>
      {agentOpen ? (
        <AgentPickerModal
          activeAgentId={activeAgentId}
          onClose={() => setAgentOpen(false)}
          onUse={(agentId) => {
            setActiveAgent(agentId);
            setAgentOpen(false);
          }}
        />
      ) : null}
    </header>
  );
}
