import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Badge, SignalChip } from "../../components/ui/Badge";
import { SparkIcon } from "../../components/ui/icons";
import type { MatchVM, StockHunt } from "./useStockHunt";

export function MatchCard({ match, hunt }: { match: MatchVM; hunt: StockHunt }) {
  return (
    <div className={`grid grid-cols-[86px_1fr_auto] items-start gap-[18px] rounded-2xl border bg-[#111114] px-5 py-[18px] text-left transition-colors hover:border-[#3ecf8e] ${match.rank === 1 ? "border-[#3ecf8e]/60" : "border-[#2a2a31]"}`}>
      <button type="button" onClick={() => hunt.openDetail(match.item.symbol)} className="flex w-[86px] flex-col items-center gap-1">
        <div className="flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full border-2" style={{ borderColor: match.scoreColor, background: `${match.scoreColor}14` }}>
          <span className="font-mono text-[24px] font-semibold leading-none" style={{ color: match.scoreColor }}>{match.score}</span>
          <span className="mt-0.5 text-[9px] text-[#8c8c95]">#{match.rank}</span>
        </div>
        <span className="text-[10px] text-[#8c8c95]">match</span>
      </button>

      <button type="button" onClick={() => hunt.openDetail(match.item.symbol)} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-base font-semibold">{match.item.symbol}</span>
          <span className="text-[13px] text-[#8c8c95]">{match.item.name}</span>
          <Badge>{match.marketBadge}</Badge>
          <Badge>{match.sectorBadge}</Badge>
        </div>
        <p className="my-[9px] max-w-[680px] text-[13px] leading-[1.55] text-[#bcbcc2]">{match.story}</p>
        <div className="flex flex-wrap gap-[7px]">
          {match.signals.map((signal) => <SignalChip key={signal.label} good={signal.good}>{signal.label}</SignalChip>)}
        </div>
      </button>

      <div className="flex min-w-[150px] flex-col items-end gap-1.5 text-right">
        <strong className="font-mono text-lg">{match.priceLabel}</strong>
        {match.metaLabel ? <span className="text-[11px] text-[#8c8c95]">{match.metaLabel}</span> : null}
        <span className={`font-mono text-xs ${match.changeGood ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{match.changeLabel}</span>
        <button
          type="button"
          disabled={hunt.analyzingSymbol === match.item.symbol}
          onClick={() => void hunt.askAi(match.item.symbol)}
          className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3.5 py-2 text-xs hover:border-[#3ecf8e] disabled:opacity-60"
        >
          {hunt.analyzingSymbol === match.item.symbol ? <LoadingSpinner size={12} /> : <SparkIcon />}
          Research
        </button>
      </div>
    </div>
  );
}
