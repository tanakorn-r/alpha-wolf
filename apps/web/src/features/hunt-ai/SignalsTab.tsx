import { EmptyPanel, LoadingPanel } from "../../components/ui/panels";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import type { DeepAnalysisResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { clamp, normalizeSignal, toneFromSignal } from "./lib";
import type { HuntAi } from "./useHuntAi";

export function SignalsTab({ hunt }: { hunt: HuntAi }) {
  const signals = hunt.signals;
  if (signals.loading) return <LoadingPanel title="Loading your holdings..." body="Preparing the Hunt AI watchlist." />;
  if (!signals.rows.length) {
    return <EmptyPanel title="No Hunt AI watchlist yet" body="Add a holding or use Add stock above. Daily Signals will stay empty until there is real data to analyze." />;
  }

  return (
    <div className="flex flex-col gap-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Today&apos;s AI Recommendations</div>
          <div className="mt-0.5 text-[12px] text-[#8c8c95]">Based on your current holdings · refreshed from live data</div>
        </div>
        <span className="flex-none rounded-[7px] border border-[#2a2a31] bg-[#161619] px-[10px] py-[5px] font-mono text-[11px] text-[#bcbcc2]">{signals.rows.length} stocks analyzed</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {signals.rows.map((row) => {
          if (row.pending) {
            return (
              <div key={row.symbol} className="rounded-r-xl border border-l-[3px] border-[#2a2a31] border-l-[#2a2a31] bg-[#161619] px-5 py-4">
                <div className="flex items-center gap-3 text-sm text-[#8c8c95]"><LoadingSpinner size={14} />Analyzing {row.symbol}...</div>
              </div>
            );
          }
          if (row.failed || !row.deep) {
            return (
              <div key={row.symbol} className="flex items-center justify-between gap-3 rounded-r-xl border border-l-[3px] border-[#2a2a31] border-l-[#f2575c] bg-[#161619] px-5 py-4 text-sm text-[#f2575c]">
                <span>{row.symbol} market data unavailable.</span>
                <button type="button" onClick={row.retry} className="rounded border border-[#f2575c] px-3 py-1 text-xs">Retry</button>
              </div>
            );
          }
          return <SignalCard key={row.symbol} deep={row.deep} onOpen={signals.openDetail} />;
        })}
      </div>
      <div className="pb-1 text-center font-mono text-[11px] text-[#5a5a62]">Premium · refreshed daily · not financial advice</div>
    </div>
  );
}

function SignalCard({ deep, onOpen }: { deep: DeepAnalysisResponse; onOpen: (symbol: string) => void }) {
  const support = deep.support ?? deep.buyZoneLow ?? deep.entry;
  const resistance = deep.resistance ?? deep.target ?? deep.price;
  const span = Math.max(0.01, resistance - support);
  const nowPct = clamp(((deep.price - support) / span) * 100, 0, 100);
  const entryPct = clamp(((deep.entry - support) / span) * 100, 0, 100);
  const diffPct = deep.price > 0 ? ((deep.entry - deep.price) / deep.price) * 100 : 0;
  const color = toneFromSignal(deep.signal, deep.color);
  const signal = normalizeSignal(deep.signal);
  const reasons = usefulReasons(deep).slice(0, 3);
  const openStockDetail = () => onOpen(deep.symbol);
  const score = signalScore(deep, signal, support, resistance);

  return (
    <div
      role="button"
      tabIndex={0}
      title={`Open ${deep.symbol} research modal`}
      onClick={openStockDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openStockDetail();
        }
      }}
      className="cursor-pointer rounded-r-xl border border-l-[3px] border-[#2a2a31] bg-[#161619] px-5 py-[18px] transition-colors hover:bg-[#1a1a1e] focus:outline-none focus:ring-2 focus:ring-[#3ecf8e]/60"
      style={{ borderLeftColor: color }}
    >
      <div className="grid gap-5 max-[900px]:grid-cols-1" style={{ gridTemplateColumns: "1fr 130px" }}>
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <div className="font-mono text-base font-bold">
              {deep.symbol} <span className="font-sans text-[11px] font-normal text-[#8c8c95]">{deep.name}</span>
            </div>
          </div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] border px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}24`, color, borderColor: `${color}59` }}>{signal}</span>
            <span className="text-[11px] text-[#8c8c95]">{deep.when}</span>
          </div>
          <div className="mb-3 flex flex-col gap-[5px]">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-[#5a5a62]">Why AI recommends this</div>
            {reasons.map((reason, index) => (
              <div key={index} className="flex gap-2 text-[12px] leading-[1.5] text-[#bcbcc2]">
                <span className="flex-none" style={{ color }}>→</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 flex justify-between font-mono text-[9.5px] text-[#5a5a62]">
              <span>Buy zone {formatCurrency(deep.buyZoneLow ?? deep.entry, deep.currency)}</span>
              <span>Now {formatCurrency(deep.price, deep.currency)}</span>
              <span>Resistance {formatCurrency(resistance, deep.currency)}</span>
            </div>
            <div className="relative h-[5px] overflow-hidden rounded-[3px] bg-[#0e0e10]">
              <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(entryPct, 8)}%`, background: `linear-gradient(90deg, ${color}80, ${color}22)` }} />
              <div className="absolute top-0 h-full w-[2px] bg-[#ececee] opacity-60" style={{ left: `${nowPct}%` }} />
              <div className="absolute top-0 h-full w-[2px]" style={{ left: `${entryPct}%`, background: color }} />
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-5 text-right max-[900px]:items-start max-[900px]:text-left">
          <MiniMetric label={signal.includes("WAIT") || signal.includes("HOLD") ? "Next DCA at" : "Target entry"} value={formatCurrency(deep.entry, deep.currency)} note={`${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% from now`} color={color} />
          <MiniMetric label="AI score" value={String(score)} note={scoreText(score)} color={scoreColor(score)} />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div>
      <div className="mb-1 text-[9.5px] uppercase tracking-[0.04em] text-[#5a5a62]">{label}</div>
      <div className="font-mono text-[21px] font-semibold" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-[11px] text-[#8c8c95]">{note}</div>
    </div>
  );
}

function usefulReasons(deep: DeepAnalysisResponse) {
  const direct = deep.bullets
    .filter((reason) => reason && !/risk\/reward|risk reward/i.test(reason))
    .slice(0, 3);
  if (direct.length) return direct;
  const entryGap = deep.price > 0 ? ((deep.entry - deep.price) / deep.price) * 100 : 0;
  return [
    `${deep.when || "Current setup"} puts the target entry ${entryGap >= 0 ? "above" : "below"} the current price.`,
    `AI target is ${formatCurrency(deep.target, deep.currency)} with a stop near ${formatCurrency(deep.stop, deep.currency)}.`,
    `The buy zone starts around ${formatCurrency(deep.buyZoneLow ?? deep.entry, deep.currency)}.`,
  ];
}

function signalScore(deep: DeepAnalysisResponse, signal: string, support: number, resistance: number) {
  const range = Math.max(0.01, resistance - support);
  const rangePct = clamp(((deep.price - support) / range) * 100, 0, 100);
  const entryGap = deep.price > 0 ? Math.abs(((deep.entry - deep.price) / deep.price) * 100) : 8;
  const upside = deep.price > 0 ? ((deep.target - deep.price) / deep.price) * 100 : 0;
  const stopDistance = deep.price > 0 ? Math.abs(((deep.price - deep.stop) / deep.price) * 100) : 10;
  const signalBase = signal.includes("BUY") ? 76 : signal.includes("WAIT") ? 58 : signal.includes("HOLD") ? 54 : 48;
  const entryFit = clamp(100 - entryGap * 10, 0, 100);
  const upsideFit = clamp(upside * 7, 0, 100);
  const stopFit = clamp(100 - stopDistance * 5, 0, 100);
  const locationFit = signal.includes("BUY")
    ? clamp(100 - Math.abs(rangePct - 35) * 1.4, 0, 100)
    : clamp(100 - Math.abs(rangePct - 50) * 1.1, 0, 100);
  return Math.round(clamp(signalBase * 0.3 + entryFit * 0.25 + upsideFit * 0.22 + stopFit * 0.1 + locationFit * 0.13, 0, 100));
}

function scoreText(score: number) {
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 50) return "watch";
  return "weak";
}

function scoreColor(score: number) {
  if (score >= 70) return "#3ecf8e";
  if (score >= 50) return "#f5c451";
  return "#f2575c";
}
