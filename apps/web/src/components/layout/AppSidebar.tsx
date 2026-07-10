import { useState } from "react";
import { NavLink } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { Money } from "../Money";
import { formatPercent, THB_PER_USD } from "../../lib/format";
import { useWolfStore } from "../../store/useWolfStore";
import { NavIcon, type NavIconKind } from "./NavIcon";

const items: Array<{ to: string; label: string; kind: NavIconKind }> = [
  { to: "/", label: "Dashboard", kind: "dashboard" },
  { to: "/scanner", label: "Stock Hunt", kind: "search" },
  { to: "/calendar", label: "Dividend Hunt", kind: "discover" }
];

export function AppSidebar() {
  const portfolioValue = useWolfStore((state) => state.portfolioValue);
  const portfolioGainPct = useWolfStore((state) => state.portfolioGainPct);
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const addCashReserve = useWolfStore((state) => state.addCashReserve);
  const [adjusting, setAdjusting] = useState(false);
  const [fundsBaht, setFundsBaht] = useState("");

  function submitFunds(event: React.FormEvent) {
    event.preventDefault();
    const baht = Number(fundsBaht);
    if (baht > 0) addCashReserve(baht / THB_PER_USD); // store is USD base; input is THB
    setFundsBaht("");
    setAdjusting(false);
  }
  return (
    <aside className="aw-sidebar fixed inset-y-0 left-0 z-20 flex flex-none flex-col border-r border-[#2a2a31] px-3.5 py-4 max-[719px]:hidden">
      <div className="flex items-center gap-2.5 px-2 pb-4 pt-0.5">
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-[9px] border border-[#2a2a31] bg-[#08090b]">
          <img src={alphaWolfIcon} alt="Alpha Wolf" className="h-full w-full object-cover" />
        </div>
        <div>
          <div className="text-[15px] font-bold tracking-[-0.2px]"><span className="text-[#3ecf8e]">Alpha</span><span className="text-[#ececee]">Wolf</span></div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#5a5a62]">wolf strategy desk</div>
        </div>
      </div>

      <nav className="flex flex-col gap-[2px]">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `relative flex items-center gap-[10px] rounded-lg px-[10px] py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-[#1c1c20] text-[#ececee] before:absolute before:bottom-[8px] before:left-0 before:top-[8px] before:w-[2.5px] before:rounded-sm before:bg-[#3ecf8e]" : "text-[#8c8c95] hover:bg-[#1c1c20] hover:text-[#ececee]"}`}
          >
            <NavIcon kind={item.kind} />
            {item.label}
          </NavLink>
        ))}

        {/* Hunt AI — canonical premium AI workspace */}
        <NavLink
          to="/hunt-ai"
          className={({ isActive }) => `group relative mt-1 block cursor-pointer overflow-hidden rounded-[12px] bg-[linear-gradient(120deg,#3ecf8e_0%,#57a8ff_28%,#a78bfa_58%,#ff6bcb_78%,#ffd166_100%)] bg-[length:220%_220%] bg-[position:0%_50%] p-[1.5px] transition-[background-position,opacity,transform] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_50%] ${isActive ? "opacity-100" : "opacity-85 hover:opacity-100"}`}
        >
          <div className="relative flex items-center gap-2 overflow-hidden rounded-[10.5px] bg-[#101113] px-2 py-1.5 transition-colors duration-300 group-hover:bg-[#131519]">
            <span className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(157,123,255,0.10))] opacity-70 transition-opacity group-hover:opacity-100" />
            <span className="relative grid h-7 w-7 flex-none place-items-center overflow-hidden rounded-[8px] border border-[#27363b] bg-[linear-gradient(145deg,rgba(62,207,142,0.14),rgba(157,123,255,0.13))] transition-colors group-hover:border-[#556075]">
              <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover opacity-95" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block bg-gradient-to-r from-[#3ecf8e] via-[#74a4ff] to-[#c77dff] bg-clip-text text-[13px] font-black leading-tight text-transparent">Hunt AI</span>
              <span className="block truncate text-[9.5px] font-medium text-[#8c8c95] transition-colors group-hover:text-[#a6a6af]">Premium desk</span>
            </span>
            <span className="relative rounded-[5px] border border-[#c77dff]/30 bg-[#c77dff]/10 px-[5px] py-px text-[7.5px] font-bold text-[#d9b8ff]">PRO</span>
          </div>
        </NavLink>
      </nav>
      <p className="mt-2 px-[10px] text-[10px] leading-[1.45] text-[#5a5a62]">Wolf rule: open any stock before you commit cash.</p>

      <div className="mt-auto flex flex-col gap-2.5">
        <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3 py-3">
          <div className="mb-[5px] text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">Portfolio</div>
          <div className="font-mono text-[19px] font-semibold tracking-[-0.5px] text-[#ececee]"><Money value={portfolioValue} secondaryClassName="text-[10px] font-normal text-[#5a5a62]" /></div>
          <div className={`mt-0.5 font-mono text-xs ${portfolioGainPct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(portfolioGainPct)}</div>

          <div className="mt-2.5 border-t border-[#2a2a31] pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.5px] text-[#8c8c95]">Cash to invest</span>
              <button type="button" onClick={() => setAdjusting((open) => !open)} className="rounded-[5px] border border-[#2a2a31] px-1.5 py-px text-[10px] font-medium text-[#8c8c95] transition-colors hover:border-[#3ecf8e] hover:text-[#3ecf8e]">
                {adjusting ? "Close" : "Adjust"}
              </button>
            </div>
            <div className="mt-1 font-mono text-[14px] font-semibold text-[#ececee]"><Money value={cashReserve} secondaryClassName="text-[10px] font-normal text-[#5a5a62]" /></div>
            {adjusting ? (
              <form onSubmit={submitFunds} className="mt-2 flex gap-1.5">
                <input
                  autoFocus
                  type="number"
                  min="1"
                  step="any"
                  value={fundsBaht}
                  onChange={(event) => setFundsBaht(event.target.value)}
                  placeholder="Add ฿"
                  className="h-8 w-full rounded-md border border-[#34343c] bg-[#0e0e10] px-2 text-[12px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
                />
                <button type="submit" className="h-8 flex-none rounded-md bg-[#3ecf8e] px-2.5 text-[12px] font-semibold text-[#06120c] transition-opacity hover:opacity-90">Add</button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 px-1.5 text-[11px] text-[#8c8c95]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ecf8e]" />AI runs only when you ask</div>
      </div>
    </aside>
  );
}
