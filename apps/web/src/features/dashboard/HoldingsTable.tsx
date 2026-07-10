import { Money } from "../../components/Money";
import { Sparkline } from "../../components/Sparkline";
import { formatPercent } from "../../lib/format";
import type { Dashboard } from "./useDashboard";

export function HoldingsTable({ dash }: { dash: Dashboard }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#161619]">
      <div className="flex items-center justify-between border-b border-[#2a2a31] px-5 py-4">
        <h2 className="font-semibold">Holdings</h2>
        <span className="font-mono text-xs text-[#8c8c95]">{dash.portfolio?.holdings.length ?? 0} positions</span>
      </div>
      <div className="divide-y divide-[#23232a]">
        {dash.portfolio?.holdings.map((holding) => {
          const good = holding.gainLoss >= 0;
          const nextExDiv = dash.nextExDivFor(holding.symbol);
          return (
            <div key={holding.symbol} className="grid w-full gap-3 px-4 py-4 text-left hover:bg-[#1c1c20] min-[860px]:grid-cols-[1fr_70px_repeat(4,minmax(72px,96px))_auto] min-[860px]:items-center min-[860px]:px-5 min-[860px]:py-3">
              <div className="flex min-w-0 items-start justify-between gap-3 min-[860px]:contents">
                <button type="button" onClick={() => dash.openDetail(holding.symbol)} className="min-w-0 text-left">
                  <strong>{holding.symbol}</strong>
                  <div className="truncate text-xs text-[#8c8c95]">{holding.name}</div>
                </button>
                <button type="button" onClick={() => dash.startSell(holding)} className="flex-none rounded-lg border border-[#2a2a31] px-3 py-1.5 text-xs text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c] min-[860px]:hidden">
                  Sell
                </button>
              </div>
              <div className="hidden min-[860px]:block">
                <Sparkline values={[holding.averageCost, holding.price]} color={good ? "#3ecf8e" : "#f2575c"} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[480px]:grid-cols-3 min-[860px]:contents">
                <Cell label="Since buy" value={formatPercent(holding.gainLossPct)} good={good} />
                <Cell label="Value" value={<Money value={holding.value} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} />
                <Cell label="P/L" value={<Money value={holding.gainLoss} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />} good={good} />
                <Cell label="Yield" value={holding.story?.match(/[\d.]+% yield/)?.[0] ?? "—"} />
                <Cell label="Ex-div" value={nextExDiv ? nextExDiv.date.slice(5) : "—"} />
              </div>
              <button type="button" onClick={() => dash.startSell(holding)} className="hidden justify-self-end rounded-lg border border-[#2a2a31] px-3 py-1.5 text-xs text-[#8c8c95] hover:border-[#f2575c] hover:text-[#f2575c] min-[860px]:block">
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
      <div className="text-[10px] uppercase text-[#5a5a62]">{label}</div>
      <div className={`mt-1 min-w-0 break-words font-mono text-sm ${good === true ? "text-[#3ecf8e]" : good === false ? "text-[#f2575c]" : ""}`}>{value}</div>
    </div>
  );
}
