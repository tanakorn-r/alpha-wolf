import { Money } from "../../components/Money";
import { PillTabs } from "../../components/ui/PillTabs";
import { SearchIcon, StrategyIcon, type StrategyIconKind } from "../../components/ui/icons";
import { marketOptions, sortLabels, type SortKey, type StockHunt } from "./useStockHunt";

const select = "min-w-0 rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3 py-[10px] text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function HuntFilters({ hunt }: { hunt: StockHunt }) {
  const strategyOptions = hunt.chipOptions.map((option) => ({
    ...option,
    label: "icon" in option && option.icon ? (
      <span className="inline-flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-[7px]" style={{ background: `${option.color}1e`, color: option.color }}>
          <StrategyIcon kind={option.icon as StrategyIconKind} color={option.color} size={13} />
        </span>
        {option.label}
      </span>
    ) : option.label,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 max-w-[620px] flex-1 basis-full min-[640px]:basis-60">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={hunt.searchQuery}
            onChange={(event) => hunt.setQuery(event.target.value)}
            placeholder="Search ticker or company — KO, PTT, Realty…"
            className="w-full rounded-[10px] border border-[#2a2a31] bg-[#161619] py-[11px] pl-9 pr-3 text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
          />
        </label>
        <PillTabs value={hunt.market} options={marketOptions} onChange={hunt.setMarket} className="w-full min-[640px]:w-auto [&>button]:flex-1 min-[640px]:[&>button]:flex-none" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs value={hunt.chip} options={strategyOptions} onChange={hunt.pickChip} className="w-full overflow-x-auto rounded-[9px] sm:w-auto sm:overflow-visible [&>button]:flex-none [&>button]:px-3 min-[640px]:[&>button]:min-w-[180px]" />
        <div className="grid w-full grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[900px]:flex min-[900px]:w-auto min-[900px]:flex-wrap min-[900px]:items-center">
          <select value={hunt.sector} onChange={(event) => hunt.setSector(event.target.value)} className={`${select} w-full min-[900px]:w-auto`}>
            <option value="all">All sectors</option>
            {hunt.sectors.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={hunt.sortBy} onChange={(event) => hunt.setSortBy(event.target.value as SortKey)} className={`${select} w-full min-[900px]:w-auto`}>
            {(Object.keys(sortLabels) as SortKey[]).map((key) => <option key={key} value={key}>Sort · {sortLabels[key]}</option>)}
          </select>
          <div className="min-[560px]:col-span-2 min-[900px]:col-span-1 min-[900px]:text-right">
            <div className="text-[11px] text-[#f5c451]">Cash to invest</div>
            <div className="font-mono text-[15px] font-semibold text-[#3ecf8e]">
              <Money value={hunt.cashReserve} secondaryClassName="text-[11px] font-normal text-[#5a5a62]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
