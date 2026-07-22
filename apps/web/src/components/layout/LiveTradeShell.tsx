import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";

export function LiveTradeShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_-20%,rgba(255,70,85,.10),transparent_32%),#09090b] text-[#ececee]">
      <header className="sticky top-0 z-30 border-b border-[#ff4655]/20 bg-[#0b0b0e]/95 px-3.5 py-2.5 shadow-[0_12px_34px_rgba(0,0,0,.28)] backdrop-blur min-[760px]:px-6">
        <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3">
          <Link to="/hunt-ai" className="group flex min-w-0 items-center gap-2.5" aria-label="Exit Dante's live desk and return to Hunt AI">
            <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-[8px] border border-[#ff4655]/25 bg-[#101012]"><img src={alphaWolfIcon} alt="" className="h-full w-full object-cover grayscale transition group-hover:grayscale-0" /></span>
            <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#ff6673]">AlphaWolf Execution</span><span className="block truncate text-[8px] uppercase tracking-[0.12em] text-[#56565e]">Independent live environment</span></span>
          </Link>

          <div className="hidden items-center gap-2.5 min-[680px]:flex">
            <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-[8px] border border-[#ff4655]/45 bg-[#ff4655]/10"><img src="/agents/dante-cross.png" alt="" className="h-full w-full object-cover" /><i className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#ff4655] shadow-[0_0_8px_#ff4655]" /></span>
            <span><span className="block text-[10.5px] font-black text-[#f0f0f2]">Dante Cross</span><span className="block text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#ff6673]">Live Quant · Red Desk</span></span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-[#f5c451]/25 bg-[#f5c451]/[0.06] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-[#f5c451] min-[520px]:inline-flex">Paper mode</span>
            <Link to="/hunt-ai" className="rounded-[8px] border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[9.5px] font-bold text-[#aaaab2] transition hover:border-[#ff4655]/45 hover:text-[#ff7b86]">Exit live desk</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-58px)] max-w-[1760px] px-3.5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 min-[760px]:px-6">{children}</main>
      <footer className="border-t border-white/[0.05] px-4 py-3 text-center text-[8.5px] leading-[1.5] text-[#4f4f57]">Paper simulation only. Delayed or incomplete data can produce incorrect calls. No live broker is connected.</footer>
    </div>
  );
}
