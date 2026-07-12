import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { AgentPickerModal } from "../agents/AgentPickerModal";
import { loadAgents } from "../../lib/api";
import { useWolfStore } from "../../store/useWolfStore";
import { GoogleAccount } from "../auth/GoogleAccount";

export function AppHeader() {
  const location = useLocation();
  const [agentOpen, setAgentOpen] = useState(false);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const setActiveAgent = useWolfStore((state) => state.setActiveAgent);
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0];
  if (location.pathname === "/") return null;
  const isHuntAi = location.pathname === "/hunt-ai";
  const page = location.pathname === "/scanner"
    ? { title: "DCA Scanner", subtitle: "Search any stock, then tap for an AI buy / wait verdict" }
    : location.pathname === "/daily-brief"
      ? { title: "Daily Brief", subtitle: "Ask your AI what deserves attention today" }
    : location.pathname === "/live-trade"
      ? { title: "Live Trade", subtitle: "TradingView chart plus live US screener reads" }
    : isHuntAi
      ? { title: "Hunt AI", subtitle: "Daily signals, entry zones and position sizing — updated every morning" }
    : location.pathname === "/calendar"
      ? { title: "Income Calendar", subtitle: "When your dividend money actually lands" }
      : { title: "Strategy Dashboard", subtitle: "Everything happening with your money, in one view" };

  return (
    <header className="aw-header sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-[#2a2a31] bg-[#0e0e10] px-6 pb-3.5 pt-4 max-[719px]:items-center max-[719px]:gap-2 max-[719px]:px-4 max-[719px]:py-2.5 max-[719px]:pt-[calc(0.625rem_+_env(safe-area-inset-top))]">
      <div className="min-w-0">
        <h1 className="m-0 truncate text-[20px] font-bold tracking-[-0.3px] text-[#ececee] max-[719px]:text-[15px]">{page.title}</h1>
        <p className="mt-[3px] max-w-[760px] truncate text-[13px] text-[#8c8c95] max-[719px]:hidden">{page.subtitle}</p>
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-2.5 max-[719px]:gap-1.5">
        {activeAgent ? (
          <button type="button" onClick={() => setAgentOpen(true)} className="flex h-[38px] items-center gap-2 rounded-[8px] border border-[#2a2a31] bg-[#161619] px-2.5 text-left text-[#bcbcc2] hover:border-[#5a5a62] max-[719px]:h-[30px] max-[719px]:px-1.5" aria-label={`Choose agent, active ${activeAgent.name}`}>
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-[6px] border font-mono text-[9.5px] font-extrabold max-[719px]:h-5 max-[719px]:w-5" style={{ color: activeAgent.color, borderColor: `${activeAgent.color}55`, background: `${activeAgent.color}18` }}>
              {activeAgent.avatarUrl ? <img src={activeAgent.avatarUrl} alt="" className="h-full w-full object-cover" /> : activeAgent.mono}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-[8.5px] font-bold uppercase tracking-[0.14em] text-[#5a5a62]">{activeAgent.premium ? "Pro Agent" : "Agent"}</span>
              <span className="block max-w-[118px] truncate text-[11.5px] font-bold leading-[1.1] text-[#ececee]">{activeAgent.name}</span>
            </span>
            <span className="text-[10px] text-[#5a5a62] max-[719px]:hidden">⌄</span>
          </button>
        ) : null}
        <GoogleAccount />
        <span className="font-mono text-[11px] text-[#5a5a62] max-[719px]:hidden">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
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
