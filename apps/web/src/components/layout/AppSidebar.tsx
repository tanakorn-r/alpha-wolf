import { NavLink } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { formatMoneyAs, formatPercent } from "../../lib/format";
import { useWolfStore } from "../../store/useWolfStore";
import { NavIcon, type NavIconKind } from "./NavIcon";

const items: Array<{ to: string; label: string; kind: NavIconKind }> = [
  { to: "/", label: "Dashboard", kind: "dashboard" },
  { to: "/scanner", label: "DCA Scanner", kind: "search" },
  { to: "/analyst", label: "AI Analyst", kind: "analyst" },
  { to: "/calendar", label: "Income Calendar", kind: "discover" }
];

export function AppSidebar() {
  const portfolioValue = useWolfStore((state) => state.portfolioValue);
  const portfolioGainPct = useWolfStore((state) => state.portfolioGainPct);
  const currency = useWolfStore((state) => state.currency);

  return (
    <aside className="aw-sidebar sticky top-0 flex h-screen w-[236px] flex-none flex-col border-r border-[#2a2a31] px-4 py-5">
      <div className="flex items-center gap-2.5 px-2 pb-[22px] pt-1">
        <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-[10px] border border-[#2a2a31] bg-[#08090b]">
          <img src={alphaWolfIcon} alt="Alpha Wolf" className="h-full w-full object-cover" />
        </div>
        <div>
          <div className="text-base font-bold tracking-[-0.2px]"><span className="text-[#3ecf8e]">Alpha</span><span className="text-[#ececee]">Wolf</span></div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#5a5a62]">strategy desk</div>
        </div>
      </div>

      <nav className="flex flex-col gap-[3px]">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `relative flex items-center gap-[11px] rounded-lg px-[11px] py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-[#1c1c20] text-[#ececee] before:absolute before:bottom-[9px] before:left-0 before:top-[9px] before:w-[2.5px] before:rounded-sm before:bg-[#3ecf8e]" : "text-[#8c8c95] hover:bg-[#1c1c20] hover:text-[#ececee]"}`}
          >
            <NavIcon kind={item.kind} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <p className="mt-[9px] px-[11px] text-[10.5px] leading-[1.5] text-[#5a5a62]">Tap any stock anywhere to open its Deep Research card.</p>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3.5 py-[13px]">
          <div className="mb-[5px] text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">Portfolio</div>
          <div className="font-mono text-[21px] font-semibold tracking-[-0.5px] text-[#ececee]">{formatMoneyAs(portfolioValue, currency)}</div>
          <div className={`mt-0.5 font-mono text-xs ${portfolioGainPct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(portfolioGainPct)}</div>
        </div>
        <div className="flex items-center gap-2 px-1.5 text-xs text-[#8c8c95]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ecf8e]" />AI runs only when you ask</div>
      </div>
    </aside>
  );
}
