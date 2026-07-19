import { AiVerdictCard } from "../../components/AiVerdictCard";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { LoadingStrip, RetryPanel } from "../../components/ui/panels";
import { MatchCard } from "./MatchCard";
import type { StockHunt } from "./useStockHunt";

export function MatchList({ hunt }: { hunt: StockHunt }) {
  if (hunt.isPending || hunt.isWarming) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[260px] flex-col items-center justify-center rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] px-6 py-12 text-center">
        <LoadingSpinner size={34} className="text-[#3ecf8e]" />
        <div className="mt-4 text-[15px] font-bold text-[#ececee]">Scanning live market data</div>
        <p className="mt-1.5 max-w-[360px] text-[12px] leading-[1.6] text-[#8c8c95]">
          {hunt.isWarming ? "The market catalog is warming up. Results will appear automatically." : "Ranking stocks for your selected market and strategy…"}
        </p>
      </div>
    );
  }

  if (hunt.isError) {
    return <RetryPanel label="Scanner data could not be loaded." busy={hunt.isFetching} onRetry={hunt.retry} />;
  }

  return (
    <>
      {hunt.isUpdating ? <LoadingStrip label="Updating live results…" /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5a5a62]">
        <span>{hunt.countLabel}</span>
        <span>{hunt.strategyDescription}</span>
      </div>

      {hunt.analysis ? <AiVerdictCard value={hunt.analysis} size="modal" /> : null}
      {hunt.analyzing ? <LoadingStrip label={`Analyzing ${hunt.analyzingSymbol}…`} /> : null}

      <div className="flex flex-col gap-2">
        {hunt.matches.map((match) => <MatchCard key={match.item.symbol} match={match} hunt={hunt} />)}
      </div>

      <div ref={hunt.loadMoreRef} className="min-h-8 text-center text-xs text-[#5a5a62]">
        {hunt.isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2"><LoadingSpinner size={12} />Loading more live stocks…</span>
        ) : hunt.hasNextPage ? "Scroll for more" : hunt.matches.length ? "End of ranked results" : ""}
      </div>

      {!hunt.matches.length ? (
        <div className="rounded-[var(--aw-radius-card)] border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">
          No stocks match your search and filters. Try clearing the search box or sector filter.
        </div>
      ) : null}
    </>
  );
}
