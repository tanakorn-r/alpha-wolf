import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Badge, SignalChip } from "../../components/ui/Badge";
import { SparkIcon } from "../../components/ui/icons";
import type { MatchVM, StockHunt } from "./useStockHunt";

export function MatchCard({ match, hunt }: { match: MatchVM; hunt: StockHunt }) {
  return (
    <div className={`grid min-w-0 gap-3 rounded-[var(--aw-radius-card)] border bg-[#111114] px-3.5 py-3 text-left transition-all hover:-translate-y-px hover:border-[#3ecf8e] hover:bg-[#161619] min-[760px]:grid-cols-[68px_minmax(0,1fr)_auto] min-[760px]:items-start min-[760px]:gap-3.5 min-[760px]:px-4 min-[760px]:py-3.5 ${match.rank === 1 ? "border-[#3ecf8e]/60" : "border-[#2a2a31]"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3 min-[760px]:contents">
        <button type="button" onClick={() => hunt.openDetail(match.item.symbol)} className="flex min-w-0 items-center gap-3 text-left min-[760px]:w-[68px] min-[760px]:flex-col min-[760px]:gap-0.5">
          <div className="flex h-[52px] w-[52px] flex-none flex-col items-center justify-center rounded-full border-2 min-[760px]:h-[58px] min-[760px]:w-[58px]" style={{ borderColor: match.scoreColor, background: `${match.scoreColor}14` }}>
            <span className="font-mono text-[19px] font-semibold leading-none min-[760px]:text-[21px]" style={{ color: match.scoreColor }}>{match.score}</span>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden font-mono text-[14px] font-semibold min-[760px]:inline">{match.item.symbol}</span>
          <span className="min-w-0 max-w-full truncate text-[12px] text-[#8c8c95]">{match.item.name}</span>
          <Badge>{match.marketBadge}</Badge>
          <Badge>{match.sectorBadge}</Badge>
        </div>
        <p className="my-1.5 max-w-[680px] text-[12px] leading-[1.45] text-[#bcbcc2]">{match.story}</p>
        <div className="flex flex-wrap gap-1.5">
          {match.signals.map((signal) => <SignalChip key={signal.label} good={signal.good}>{signal.label}</SignalChip>)}
        </div>
      </button>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[#23232a] pt-2.5 text-left min-[760px]:min-w-[140px] min-[760px]:flex-col min-[760px]:items-end min-[760px]:gap-1 min-[760px]:border-t-0 min-[760px]:pt-0 min-[760px]:text-right">
        <div className="hidden min-[760px]:contents">
        <strong className="font-mono text-[16px]">{match.priceLabel}</strong>
        {match.metaLabel ? <span className="text-[11px] text-[#8c8c95]">{match.metaLabel}</span> : null}
        <span className={`font-mono text-xs ${match.changeGood ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{match.changeLabel}</span>
        </div>
        {match.metaLabel ? <span className="min-w-0 flex-1 text-[11px] text-[#8c8c95] min-[760px]:hidden">{match.metaLabel}</span> : <span className="flex-1 min-[760px]:hidden" />}
        <button
          type="button"
          disabled={hunt.analyzingSymbol === match.item.symbol}
          onClick={() => void hunt.askAi(match.item.symbol)}
          className="flex flex-none items-center gap-1.5 rounded-[7px] border border-[#2a2a31] bg-[#1c1c20] px-3 py-1.5 text-[11px] hover:border-[#3ecf8e] disabled:opacity-60 min-[760px]:mt-1"
        >
          {hunt.analyzingSymbol === match.item.symbol ? <LoadingSpinner size={12} /> : <SparkIcon />}
          Research
        </button>
      </div>
    </div>
  );
}
