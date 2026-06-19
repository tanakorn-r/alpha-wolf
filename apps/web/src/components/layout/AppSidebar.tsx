import { NavLink } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { colorForSymbol, initialFor } from "../../lib/symbolColor";
import { useWolfStore } from "../../store/useWolfStore";
import { brandTheme } from "../../theme";
import { NavIcon, type NavIconKind } from "./NavIcon";

const overviewItems: Array<{ to: string; label: string; kind: NavIconKind }> = [
  { to: "/", label: "Dashboard", kind: "dashboard" },
  { to: "/discover", label: "Discover", kind: "discover" }
];

export function AppSidebar() {
  const watchlist = useWolfStore((state) => state.watchlist);
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const openDetail = useWolfStore((state) => state.openDetail);

  return (
    <aside className="aw-sidebar flex w-[220px] flex-none flex-col gap-5 border-r border-slate-100 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-violet-600 text-sm font-extrabold text-white">AW</div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-extrabold text-slate-900">{brandTheme.name}</span>
          <span className="text-[11px] text-slate-400">{brandTheme.tagline}</span>
        </div>
      </div>

      <SidebarSection label="Overview">
        {overviewItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
          >
            <NavIcon kind={item.kind} />{item.label}
          </NavLink>
        ))}
      </SidebarSection>

      <SidebarSection label="Activity">
        <SidebarAction label="Search" kind="search" onClick={() => document.querySelector<HTMLInputElement>("#global-search")?.focus()} />
        <SidebarAction label="Insights" kind="insights" onClick={() => selectedSymbol && openDetail(selectedSymbol)} />
      </SidebarSection>

      <div className="flex-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">My Watchlist</div>
        {watchlist.map((stock) => {
          const color = colorForSymbol(stock.symbol);
          return (
            <button key={stock.symbol} type="button" onClick={() => openDetail(stock.symbol)} className="grid w-full grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: color.bg, color: color.fg }}>{initialFor(stock.symbol)}</span>
              <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] font-bold text-slate-900">{stock.symbol}</span><span className="truncate text-[11px] text-slate-400">{stock.sector}</span></span>
              <span className="whitespace-nowrap text-[13px] font-bold text-slate-900">{formatMoney(stock.price)}</span>
            </button>
          );
        })}
        {!watchlist.length ? <div className="px-2 py-2 text-xs text-slate-400">Loading live names...</div> : null}
      </div>

      <div className="flex items-center gap-2.5 border-t border-slate-100 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">D</div>
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-900">Daniel</div><div className="truncate text-[11px] text-slate-400">daniel@alphawolf.app</div></div>
        <button type="button" aria-label="Account options" className="text-slate-400">⋮</button>
      </div>
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div><nav className="flex flex-col gap-1">{children}</nav></div>;
}

function SidebarAction({ label, kind, onClick }: { label: string; kind: NavIconKind; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"><NavIcon kind={kind} />{label}</button>;
}
