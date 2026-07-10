import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Money } from "../../components/Money";
import { SparkIcon } from "../../components/ui/icons";
import { formatMoneyBaht } from "../../lib/format";
import type { StockHunt } from "./useStockHunt";

export function Top5Panel({ hunt }: { hunt: StockHunt }) {
  return (
    <>
      {hunt.top5State === "open" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#3ecf8e]/40 bg-[#3ecf8e]/[.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">
              AlphaWolf&apos;s top 5 picks <span className="font-normal text-[#8c8c95]">for {hunt.top5Label}</span>
            </h3>
            <div className="grid w-full grid-cols-2 gap-2 min-[560px]:flex min-[560px]:w-auto min-[560px]:items-center">
              <button type="button" onClick={() => void hunt.rankTop5()} className="rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3 py-2 text-xs text-[#8c8c95] hover:border-[#3ecf8e] hover:text-[#ececee]">
                Re-rank
              </button>
              <button
                type="button"
                onClick={() => void hunt.applyTop5()}
                disabled={hunt.applyingTop5}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#3ecf8e] px-3.5 py-2 text-xs font-bold text-[#06120c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hunt.applyingTop5 ? <LoadingSpinner size={12} /> : <SparkIcon className="h-3.5 w-3.5 fill-[#06120c]" />}
                {hunt.applyingTop5 ? "Buying at current prices…" : "Buy all 5 now"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {hunt.top5.map(({ item, amount }, index) => (
              <div key={item.symbol} className="grid gap-2 rounded-lg border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3 min-[620px]:flex min-[620px]:items-center min-[620px]:gap-3">
                <span className="font-mono text-xs text-[#5a5a62]">#{index + 1}</span>
                <button type="button" onClick={() => hunt.openDetail(item.symbol)} className="min-w-0 flex-1 text-left">
                  <span className="font-mono font-semibold">{item.symbol}</span> <span className="text-[13px] text-[#8c8c95]">{item.name}</span>
                  <div className="mt-0.5 text-xs text-[#bcbcc2]">{(item.story ?? "").slice(0, 110)}</div>
                </button>
                <span className="flex-none font-mono text-sm text-[#3ecf8e] min-[620px]:text-right">
                  <Money value={amount} secondaryClassName="block text-[10px] font-normal text-[#5a5a62]" />
                </span>
              </div>
            ))}
            {!hunt.top5.length ? <p className="py-4 text-center text-sm text-[#8c8c95]">No candidates match your current filters.</p> : null}
          </div>
          {hunt.applyTop5Error ? <p className="text-center text-xs text-[#f2575c]">{hunt.applyTop5Error}</p> : null}
        </div>
      ) : null}

      {hunt.top5Applied ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#285f48] bg-[#173528] px-4 py-3 text-sm text-[#3ecf8e]">
          <span>
            Bought {formatMoneyBaht(hunt.top5Applied.amount)} across {hunt.top5Applied.count} stocks at today&apos;s price — check your Dashboard holdings.
          </span>
          <button type="button" onClick={hunt.dismissApplied} className="text-xs text-[#82b99f] hover:text-[#ececee]">Dismiss</button>
        </div>
      ) : null}
    </>
  );
}
