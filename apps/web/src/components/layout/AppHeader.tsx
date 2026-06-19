import { useLocation } from "react-router-dom";
import { useWolfStore } from "../../store/useWolfStore";

export function AppHeader() {
  const location = useLocation();
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const setSearchQuery = useWolfStore((state) => state.setSearchQuery);
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const pageTitle = location.pathname === "/discover" ? "Discover" : "Dashboard";

  return (
    <header className="aw-header flex h-[62px] flex-none items-center gap-4 border-b border-slate-100 px-5">
      <span className="text-xs text-slate-400">Overview <span className="text-slate-300">/</span> <span className="font-semibold text-slate-600">{pageTitle}</span></span>
      <label className="mx-auto flex h-9 max-w-[520px] flex-1 items-center gap-2.5 rounded-full bg-slate-50 px-4" htmlFor="global-search">
        <span className="text-slate-400">⌕</span>
        <input id="global-search" placeholder="Search stocks, strategies, or symbols" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
      </label>
      <div className="flex items-center gap-2.5">
        <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-bold text-violet-600">Live</span>
        <span className="hidden rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 sm:inline">{selectedSymbol || "Pick a name"}</span>
        <button type="button" aria-label="Notifications" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500">●</button>
      </div>
    </header>
  );
}
