import { SearchIcon } from "../../components/ui/icons";
import { EmptyStrip, LoadingRow, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function WatchlistBar({ hunt }: { hunt: HuntAi }) {
  const list = hunt.watchlist;
  return (
    <div className="flex flex-col gap-2">
      <div className={`${panel} flex flex-wrap items-center gap-2 px-[15px] py-[11px]`}>
        <span className="flex-none text-[10.5px] uppercase tracking-[0.5px] text-[#5a5a62]">Watchlist</span>
        {list.symbols.map((symbol) => {
          const active = list.activeTicker === symbol;
          return (
            <button
              key={symbol}
              type="button"
              onClick={() => list.select(symbol)}
              className={`flex items-center gap-1 rounded-[7px] border bg-[#0e0e10] px-2.5 py-1 font-mono text-xs font-semibold transition-colors ${active ? "border-[#3ecf8e] text-[#3ecf8e]" : "border-[#2a2a31] text-[#ececee] hover:border-[#3ecf8e]"}`}
            >
              {symbol}
              {!list.holdingSymbols.includes(symbol) ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    list.remove(symbol);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      list.remove(symbol);
                    }
                  }}
                  className="ml-[3px] px-px text-[14px] leading-none text-[#5a5a62] hover:text-[#f2575c]"
                >
                  x
                </span>
              ) : null}
            </button>
          );
        })}
        <button type="button" onClick={list.toggle} className="flex items-center gap-[5px] rounded-[7px] border border-dashed border-[#2a2a31] px-[11px] py-1 text-xs font-semibold text-[#3ecf8e] hover:border-[#3ecf8e] hover:bg-[#3ecf8e]/05">
          <span className="text-base leading-none">+</span>Add stock
        </button>
        <span className="ml-auto flex-none font-mono text-[11px] text-[#5a5a62]">Shared across all tabs</span>
      </div>

      {list.addOpen ? (
        <div className={`${panel} overflow-hidden`}>
          <div className="p-2.5">
            <div className="relative">
              <SearchIcon className="absolute left-[11px] top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={list.addQuery}
                onChange={(event) => list.setQuery(event.target.value)}
                placeholder="Search ticker or company - NVDA, PTT, Apple..."
                className="w-full rounded-lg border border-[#2a2a31] bg-[#0e0e10] py-[9px] pl-[34px] pr-3 text-[13px] text-[#ececee] outline-none"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {list.results.map((item) => (
              <button key={item.symbol} type="button" onClick={() => list.add(item.symbol)} className="flex w-full items-center gap-2.5 border-t border-[#1a1a1e] px-3.5 py-2.5 text-left hover:bg-[#1c1c20]">
                <span className="w-[64px] flex-none font-mono text-[13px] font-semibold">{item.symbol}</span>
                <span className="rounded border border-[#2a2a31] px-[5px] py-px text-[10px] text-[#8c8c95]">{item.symbol.endsWith(".BK") ? "TH" : "US"}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#8c8c95]">{item.name}</span>
                <span className="flex-none text-[11px] font-semibold text-[#3ecf8e]">+ Add</span>
              </button>
            ))}
            {list.searchLoading ? <LoadingRow label="Searching live universe..." /> : null}
            {!list.searchLoading && list.addQuery.trim().length > 0 && !list.results.length ? <EmptyStrip label="No results. Try a ticker like NVDA, AAPL or PTT." /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
