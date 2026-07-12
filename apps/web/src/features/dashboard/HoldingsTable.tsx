import { Money } from "../../components/Money";
import { Sparkline } from "../../components/Sparkline";
import { formatPercent, priceToUsdBase } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function HoldingsTable({ dash }: { dash: Dashboard }) {
  return (
    <div className="overflow-hidden rounded-[var(--aw-radius-card)] border border-[var(--aw-border)] bg-[var(--aw-surface)]">
      <div className="flex items-center justify-between border-b border-[#2a2a31] px-4 py-3">
        <h2 className="font-semibold">Holdings</h2>
        <span className="font-mono text-xs text-[#8c8c95]">{dash.portfolio?.holdings.length ?? 0} positions</span>
      </div>
      <div className="divide-y divide-[#23232a]">
        {dash.portfolio?.holdings.map((holding) => {
          const good = holding.gainLoss >= 0;
          const nextExDiv = dash.nextExDivFor(holding.symbol);
          return (
            <div key={holding.symbol} className="grid w-full gap-2.5 px-3.5 py-3 text-left hover:bg-[#1c1c20] min-[760px]:grid-cols-[minmax(90px,1fr)_58px_52px_70px_70px_44px_auto] min-[760px]:items-center">
              <div className="flex min-w-0 items-start justify-between gap-3 min-[760px]:contents">
                <button type="button" onClick={() => dash.openDetail(holding.symbol)} className="min-w-0 text-left">
                  <strong className="text-[12.5px]">{holding.symbol}</strong>
                  <div className="truncate text-[10.5px] text-[#8c8c95]">{holding.name}</div>
                </button>
                <button type="button" onClick={() => dash.startSell(holding)} className="flex-none rounded-[var(--aw-radius-chip)] border border-[#2a2a31] px-2.5 py-1.5 text-[10.5px] text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c] min-[760px]:hidden">
                  Sell
                </button>
              </div>
              <div className="hidden min-[760px]:block">
                {/* Compare like units: averageCost is USD-base, holding.price is instrument-native. */}
                <Sparkline values={[holding.averageCost, priceToUsdBase(holding.price, holding.currency ?? holding.symbol)]} color={good ? "#3ecf8e" : "#f2575c"} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[480px]:grid-cols-4 min-[760px]:contents">
                <Cell label="Since buy" value={formatPercent(holding.gainLossPct)} good={good} />
                <Cell label="Value" value={<Money value={holding.value} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} />
                <Cell label="P/L" value={<Money value={holding.gainLoss} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} good={good} />
                <Cell label="Ex-div" value={nextExDiv ? nextExDiv.date.slice(5) : "—"} />
              </div>
              <button type="button" onClick={() => dash.startSell(holding)} className="hidden justify-self-end rounded-[var(--aw-radius-chip)] border border-[#2a2a31] px-2 py-1.5 text-[10px] text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c] min-[760px]:block">
                Sell
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ label, value, good }: { label: string; value: React.ReactNode; good?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[8.5px] uppercase text-[#5a5a62]">{label}</div>
      <div className={`mt-0.5 min-w-0 break-words font-mono text-[11.5px] ${good === true ? "text-[#3ecf8e]" : good === false ? "text-[#f2575c]" : ""}`}>{value}</div>
    </div>
  );
}
