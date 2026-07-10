import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Badge, SignalChip } from "../../components/ui/Badge";
import { SparkIcon } from "../../components/ui/icons";
import type { MatchVM, StockHunt } from "./useStockHunt";

export function MatchCard({ match, hunt }: { match: MatchVM; hunt: StockHunt }) {
  return (
    <div className={`grid min-w-0 gap-4 rounded-2xl border bg-[#111114] px-4 py-4 text-left transition-colors hover:border-[#3ecf8e] min-[760px]:grid-cols-[86px_minmax(0,1fr)_auto] min-[760px]:items-start min-[760px]:gap-[18px] min-[760px]:px-5 min-[760px]:py-[18px] ${match.rank === 1 ? "border-[#3ecf8e]/60" : "border-[#2a2a31]"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3 min-[760px]:contents">
        <button type="button" onClick={() => hunt.openDetail(match.item.symbol)} className="flex min-w-0 items-center gap-3 text-left min-[760px]:w-[86px] min-[760px]:flex-col min-[760px]:gap-1">
          <div className="flex h-[56px] w-[56px] flex-none flex-col items-center justify-center rounded-full border-2 min-[760px]:h-[70px] min-[760px]:w-[70px]" style={{ borderColor: match.scoreColor, background: `${match.scoreColor}14` }}>
            <span className="font-mono text-[20px] font-semibold leading-none min-[760px]:text-[24px]" style={{ color: match.scoreColor }}>{match.score}</span>
            <span className="mt-0.5 text-[9px] text-[#8c8c95]">#{match.rank}</span>
          </div>
          <div className="min-w-0 min-[760px]:text-center">
            <span className="block truncate font-mono text-base font-semibold text-[#ececee] min-[760px]:hidden">{match.item.symbol}</span>
            <span className="block text-[10px] text-[#8c8c95]">match</span>
          </div>
        </button>
        <div className="flex flex-none flex-col items-end gap-1 text-right min-[760px]:hidden">
          <strong className="font-mono text-base">{match.priceLabel}</strong>
          <span className={`font-mono text-xs ${match.changeGood ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{match.changeLabel}</span>
        </div>
      </div>

      <button type="button" onClick={() => hunt.openDetail(match.item.symbol)} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden font-mono text-base font-semibold min-[760px]:inline">{match.item.symbol}</span>
          <span className="min-w-0 max-w-full truncate text-[13px] text-[#8c8c95]">{match.item.name}</span>
          <Badge>{match.marketBadge}</Badge>
          <Badge>{match.sectorBadge}</Badge>
        </div>
        <p className="my-[9px] max-w-[680px] text-[13px] leading-[1.55] text-[#bcbcc2]">{match.story}</p>
        <div className="flex flex-wrap gap-[7px]">
          {match.signals.map((signal) => <SignalChip key={signal.label} good={signal.good}>{signal.label}</SignalChip>)}
        </div>
      </button>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[#23232a] pt-3 text-left min-[760px]:min-w-[150px] min-[760px]:flex-col min-[760px]:items-end min-[760px]:gap-1.5 min-[760px]:border-t-0 min-[760px]:pt-0 min-[760px]:text-right">
        <div className="hidden min-[760px]:contents">
        <strong className="font-mono text-lg">{match.priceLabel}</strong>
        {match.metaLabel ? <span className="text-[11px] text-[#8c8c95]">{match.metaLabel}</span> : null}
        <span className={`font-mono text-xs ${match.changeGood ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{match.changeLabel}</span>
        </div>
        {match.metaLabel ? <span className="min-w-0 flex-1 text-[11px] text-[#8c8c95] min-[760px]:hidden">{match.metaLabel}</span> : <span className="flex-1 min-[760px]:hidden" />}
        <button
          type="button"
          disabled={hunt.analyzingSymbol === match.item.symbol}
          onClick={() => void hunt.askAi(match.item.symbol)}
          className="flex flex-none items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3.5 py-2 text-xs hover:border-[#3ecf8e] disabled:opacity-60 min-[760px]:mt-1.5"
        >
          {hunt.analyzingSymbol === match.item.symbol ? <LoadingSpinner size={12} /> : <SparkIcon />}
          Research
        </button>
      </div>
    </div>
  );
}
