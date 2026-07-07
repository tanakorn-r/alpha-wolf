import { LoadingSpinner } from "../../components/LoadingSpinner";
import { SparkIcon } from "../../components/ui/icons";
import type { StockHunt } from "./useStockHunt";

export function RankBanner({ hunt }: { hunt: StockHunt }) {
  if (hunt.top5State === "open") return null;
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-[#2a2a31] bg-[#111114] px-5 py-5">
      <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[#3ecf8e]/15">
        <SparkIcon className="h-5 w-5 fill-[#3ecf8e]" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold">Let AI rank your top 5 this month</h3>
        <p className="mt-1 max-w-[760px] text-[13px] leading-[1.55] text-[#8c8c95]">
          From the {hunt.matches.length} stocks matching your filters, AlphaWolf scores the 5 best fits for your plan — with a reason and
          suggested amount for each. Runs only when you ask.
        </p>
      </div>
      {hunt.top5State === "loading" ? (
        <div className="flex flex-none items-center gap-2.5 rounded-[10px] border border-[#2a2a31] bg-[#161619] px-4 py-3 text-[13px] text-[#8c8c95]">
          <LoadingSpinner size={14} />
          Ranking live candidates…
        </div>
      ) : (
        <button
          type="button"
          disabled={!hunt.matches.length}
          onClick={() => void hunt.rankTop5()}
          className="flex flex-none items-center gap-2 rounded-[10px] bg-[#3ecf8e] px-5 py-3 text-[13px] font-bold text-[#06120c] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SparkIcon className="h-3.5 w-3.5 fill-[#06120c]" />
          Rank my top 5
        </button>
      )}
    </div>
  );
}
