import { useState } from "react";
import { NavLink } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { Money } from "../Money";
import { formatPercent, THB_PER_USD } from "../../lib/format";
import { N100_QUOTA_LIMIT, useWolfStore } from "../../store/useWolfStore";
import { NavIcon, type NavIconKind } from "./NavIcon";

const items: Array<{ to: string; label: string; kind: NavIconKind }> = [
  { to: "/", label: "Dashboard", kind: "dashboard" },
  { to: "/daily-brief", label: "Daily Brief", kind: "insights" },
  { to: "/live-trade", label: "Live Trade", kind: "daytrader" },
  { to: "/scanner", label: "DCA Scanner", kind: "search" },
  { to: "/calendar", label: "Income Calendar", kind: "discover" }
];

export function AppSidebar() {
  const portfolioValue = useWolfStore((state) => state.portfolioValue);
  const portfolioGainPct = useWolfStore((state) => state.portfolioGainPct);
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const addCashReserve = useWolfStore((state) => state.addCashReserve);
  const premium = useWolfStore((s) => s.premium);
  const [adjusting, setAdjusting] = useState(false);
  const [fundsBaht, setFundsBaht] = useState("");

  function submitFunds(event: React.FormEvent) {
    event.preventDefault();
    const baht = Number(fundsBaht);
    if (baht > 0) addCashReserve(baht / THB_PER_USD); // store is USD base; input is THB
    setFundsBaht("");
    setAdjusting(false);
  }
  const n100QuotaUsed = useWolfStore((s) => s.n100QuotaUsed);
  const quotaLeft = N100_QUOTA_LIMIT - n100QuotaUsed;

  return (
    <aside className="aw-sidebar fixed inset-y-0 left-0 z-20 flex h-screen w-[236px] flex-none flex-col border-r border-[#2a2a31] px-4 py-5 max-[900px]:w-[76px]">
      <div className="flex items-center gap-2.5 px-2 pb-[22px] pt-1">
        <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-[10px] border border-[#2a2a31] bg-[#08090b]">
          <img src={alphaWolfIcon} alt="Alpha Wolf" className="h-full w-full object-cover" />
        </div>
        <div>
          <div className="text-base font-bold tracking-[-0.2px]"><span className="text-[#3ecf8e]">Alpha</span><span className="text-[#ececee]">Wolf</span></div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#5a5a62]">wolf strategy desk</div>
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

        {/* Hunt AI — canonical premium AI workspace */}
        <NavLink
          to="/hunt-ai"
          className={({ isActive }) => `group relative mt-[3px] block cursor-pointer overflow-hidden rounded-[13px] bg-[linear-gradient(120deg,#3ecf8e_0%,#57a8ff_28%,#a78bfa_58%,#ff6bcb_78%,#ffd166_100%)] bg-[length:220%_220%] bg-[position:0%_50%] p-[1.5px] transition-[background-position,opacity,transform] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_50%] ${isActive ? "opacity-100" : "opacity-85 hover:opacity-100"}`}
        >
          <div className="relative flex items-center gap-2.5 overflow-hidden rounded-[11.5px] bg-[#101113] px-2.5 py-2 transition-colors duration-300 group-hover:bg-[#131519]">
            <span className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(157,123,255,0.10))] opacity-70 transition-opacity group-hover:opacity-100" />
            <span className="relative grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-[10px] border border-[#27363b] bg-[linear-gradient(145deg,rgba(62,207,142,0.14),rgba(157,123,255,0.13))] transition-colors group-hover:border-[#556075]">
              <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover opacity-95" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block bg-gradient-to-r from-[#3ecf8e] via-[#74a4ff] to-[#c77dff] bg-clip-text text-[13.5px] font-black leading-tight text-transparent">Hunt AI</span>
              <span className="block truncate text-[9.5px] font-medium text-[#8c8c95] transition-colors group-hover:text-[#a6a6af]">Premium desk</span>
            </span>
            <span className="relative rounded-[5px] border border-[#c77dff]/30 bg-[#c77dff]/10 px-[5px] py-px text-[7.5px] font-bold text-[#d9b8ff]">PRO</span>
          </div>
        </NavLink>
      </nav>
      <p className="mt-[9px] px-[11px] text-[10.5px] leading-[1.5] text-[#5a5a62]">Wolf rule: open any stock to see the full research stack before you commit cash.</p>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3.5 py-[13px]">
          <div className="mb-[5px] text-[11px] uppercase tracking-[0.6px] text-[#8c8c95]">Portfolio</div>
          <div className="font-mono text-[21px] font-semibold tracking-[-0.5px] text-[#ececee]"><Money value={portfolioValue} secondaryClassName="text-[10px] font-normal text-[#5a5a62]" /></div>
          <div className={`mt-0.5 font-mono text-xs ${portfolioGainPct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(portfolioGainPct)}</div>

          <div className="mt-3 border-t border-[#2a2a31] pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.5px] text-[#8c8c95]">Cash to invest</span>
              <button type="button" onClick={() => setAdjusting((open) => !open)} className="rounded-[5px] border border-[#2a2a31] px-1.5 py-px text-[10px] font-medium text-[#8c8c95] transition-colors hover:border-[#3ecf8e] hover:text-[#3ecf8e]">
                {adjusting ? "Close" : "Adjust"}
              </button>
            </div>
            <div className="mt-1 font-mono text-[15px] font-semibold text-[#ececee]"><Money value={cashReserve} secondaryClassName="text-[10px] font-normal text-[#5a5a62]" /></div>
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

        {premium ? (
          /* PRO quota widget */
          <div className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3.5 py-3">
            <div className="mb-[7px] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.5px] text-[#8c8c95]">N100 Credits</span>
              <span className="rounded-[4px] bg-gradient-to-r from-[#3ecf8e] to-[#c77dff] px-[5px] py-px text-[8px] font-bold tracking-[0.4px] text-white">PRO</span>
            </div>
            <div className="mb-1.5 flex items-baseline gap-1">
              <span className="font-mono text-[17px] font-bold" style={{ color: quotaLeft <= 5 ? "#f2575c" : "#3ecf8e" }}>{quotaLeft}</span>
              <span className="font-mono text-[11px] text-[#5a5a62]">/ {N100_QUOTA_LIMIT} left</span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-[#0e0e10]">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, (quotaLeft / N100_QUOTA_LIMIT) * 100)}%`, background: quotaLeft <= 5 ? "#f2575c" : "linear-gradient(90deg,#3ecf8e,#4d96ff)" }} />
            </div>
            <div className="mt-1.5 text-[10px] text-[#5a5a62]">resets monthly</div>
          </div>
        ) : (
          /* Unlock Next 10 ↑ CTA */
          <NavLink
            to="/hunt-ai"
            className="group relative block cursor-pointer overflow-hidden rounded-[13px] bg-[linear-gradient(120deg,#3ecf8e_0%,#57a8ff_28%,#a78bfa_58%,#ff6bcb_78%,#ffd166_100%)] bg-[length:220%_220%] bg-[position:0%_50%] p-[1.5px] transition-[background-position,transform] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_50%]"
          >
            <div className="relative flex items-center gap-3 overflow-hidden rounded-[11.5px] bg-[#101113] p-3 transition-colors duration-300 group-hover:bg-[#131519]">
              <span className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(157,123,255,0.10))] opacity-70 transition-opacity group-hover:opacity-100" />
              <span className="relative grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-xl border border-[#27363b] bg-[linear-gradient(145deg,rgba(62,207,142,0.14),rgba(157,123,255,0.13))] transition-colors group-hover:border-[#556075]">
                <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover opacity-95" />
              </span>
              <span className="relative min-w-0">
                <span className="block bg-gradient-to-r from-[#3ecf8e] via-[#74a4ff] to-[#c77dff] bg-clip-text text-[13px] font-black leading-tight text-transparent">Unlock Next 10 ↑</span>
                <span className="mt-0.5 block text-[10.5px] font-medium text-[#8c8c95] transition-colors group-hover:text-[#a6a6af]">Premium · from $29/mo</span>
              </span>
            </div>
          </NavLink>
        )}

        <div className="flex items-center gap-2 px-1.5 text-xs text-[#8c8c95]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ecf8e]" />AI runs only when you ask</div>
      </div>
    </aside>
  );
}
