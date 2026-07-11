import { SearchIcon } from "../../components/ui/icons";
import { EmptyStrip, LoadingRow, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function WatchlistBar({ hunt }: { hunt: HuntAi }) {
  const list = hunt.watchlist;
  const holdingSymbols = list.symbols.filter((symbol) => list.holdingSymbols.includes(symbol));
  const watchingSymbols = list.symbols.filter((symbol) => !list.holdingSymbols.includes(symbol));
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${panel} flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <WatchlistGroup label="You hold" symbols={holdingSymbols} list={list} />
        <div className="mx-px h-6 w-px bg-[#2a2a31]" />
        <WatchlistGroup label="Watching" symbols={watchingSymbols} list={list} />
        <button type="button" onClick={list.toggle} className="flex items-center gap-1.5 rounded-[7px] border border-dashed border-[#2a2a31] px-2.5 py-[5px] text-[12px] font-bold text-[#3ecf8e] hover:border-[#3ecf8e] hover:bg-[#3ecf8e]/05">
          <span className="text-[16px] leading-none">+</span>Add asset
        </button>
        <span className="ml-auto flex-none font-mono text-[11px] text-[#5a5a62]">Tap an asset - every tab follows</span>
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
                placeholder="Search asset - gold, xauusd, silver, oil, NVDA..."
                className="w-full rounded-lg border border-[#2a2a31] bg-[#0e0e10] py-[9px] pl-[34px] pr-3 text-[13px] text-[#ececee] outline-none"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {list.results.map((item) => (
              <button key={item.symbol} type="button" onClick={() => list.add(item.symbol)} className="flex w-full items-center gap-2.5 border-t border-[#1a1a1e] px-3.5 py-2.5 text-left hover:bg-[#1c1c20]">
                <span className="w-[64px] flex-none font-mono text-[13px] font-semibold">{item.symbol}</span>
                <span className="rounded border border-[#2a2a31] px-[5px] py-px text-[10px] text-[#8c8c95]">{assetTag(item.symbol, item.quoteType)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#8c8c95]">{item.name}</span>
                <span className="flex-none text-[11px] font-semibold text-[#3ecf8e]">+ Add</span>
              </button>
            ))}
            {list.searchLoading ? <LoadingRow label="Searching live universe..." /> : null}
            {!list.searchLoading && list.addQuery.trim().length > 0 && !list.results.length ? <EmptyStrip label="No results. Try gold, xauusd, oil, NVDA or AAPL." /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function assetTag(symbol: string, quoteType?: string | null) {
  const upperType = (quoteType || "").toUpperCase();
  if (upperType === "FUTURE" || symbol.includes("=F")) return "FUT";
  if (upperType === "ETF") return "ETF";
  if (upperType === "INDEX" || symbol.startsWith("^")) return "IDX";
  if (symbol.endsWith(".BK")) return "TH";
  return "US";
}

function WatchlistGroup({ label, symbols, list }: { label: string; symbols: string[]; list: HuntAi["watchlist"] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.5px] text-[#5a5a62]">
        <span className="h-[6px] w-[6px] rounded-full bg-[#3ecf8e]" />
        {label}
      </span>
      {symbols.map((symbol) => <WatchlistChip key={symbol} symbol={symbol} list={list} />)}
    </div>
  );
}

function WatchlistChip({ symbol, list }: { symbol: string; list: HuntAi["watchlist"] }) {
  const active = list.activeTicker === symbol;
  const removable = !list.holdingSymbols.includes(symbol);
  return (
    <button
      type="button"
      onClick={() => list.select(symbol)}
      className={`flex items-center gap-1.5 rounded-[7px] border bg-[#0e0e10] px-2.5 py-[5px] font-mono text-[11.5px] font-bold transition-colors ${active ? "border-[#ececee] text-[#ececee]" : "border-[#2a2a31] text-[#bcbcc2] hover:border-[#3ecf8e] hover:text-[#ececee]"}`}
    >
      <span className="h-[6px] w-[6px] rounded-full bg-[#3ecf8e]" />
      {symbol}
      {removable ? (
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
          className="ml-px px-px text-[14px] leading-none text-[#5a5a62] hover:text-[#f2575c]"
        >
          x
        </span>
      ) : null}
    </button>
  );
}
