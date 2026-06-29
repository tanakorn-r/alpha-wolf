import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ReferenceArea, ResponsiveContainer } from "recharts";
import { loadDeepAnalysis } from "../lib/api";
import { formatCurrency, formatMultiple, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";
import { LoadingSpinner } from "./LoadingSpinner";

export function DeepAnalysisPanel() {
  const deepOpen = useWolfStore((state) => state.deepOpen);
  const deepSymbol = useWolfStore((state) => state.deepSymbol);
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const closeDeepAnalysis = useWolfStore((state) => state.closeDeepAnalysis);

  const query = useQuery({
    queryKey: ["deep-analysis", deepSymbol],
    queryFn: () => loadDeepAnalysis(deepSymbol),
    enabled: deepOpen && Boolean(deepSymbol)
  });

  useEffect(() => {
    if (!deepOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDeepAnalysis(); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [deepOpen, closeDeepAnalysis]);

  if (!deepOpen) return null;
  const deep = query.data;
  const deployAmount = Math.min(Math.max(cashReserve, 0), 500) || 200;
  const shares = deep && deep.entry > 0 ? deployAmount / deep.entry : 0;

  return (
    <div className="fixed inset-0 z-[55] flex justify-end">
      <button type="button" aria-label="Close deep analysis" onClick={closeDeepAnalysis} className="absolute inset-0 bg-[#060608]/60 backdrop-blur-[3px]" />
      <div className="deep-panel-in relative flex h-full w-[500px] max-w-[96vw] flex-col border-l border-[#2a2a31] bg-[#141417] shadow-[-24px_0_70px_rgba(0,0,0,0.5)]">
        <div className="deep-rainbow-bar h-[2.5px] flex-none" />

        <div className="flex flex-none items-center justify-between gap-3 border-b border-[#2a2a31] px-[22px] pb-[14px] pt-[18px]">
          <div>
            <div className="flex items-center gap-[9px]">
              <span className="font-mono text-lg font-bold">{deep?.symbol ?? deepSymbol}</span>
              <span className="text-xs text-[#8c8c95]">{deep?.name ?? "Live FinFeed data"}</span>
              <span className="rounded-md bg-gradient-to-r from-[#ff6b6b] to-[#c77dff] px-[7px] py-0.5 text-[9px] font-bold tracking-[0.5px] text-white">PRO</span>
            </div>
            <div className="mt-[5px] flex items-center gap-2">
              {deep ? <span className="rounded-[5px] border px-[9px] py-0.5 text-[10px] font-bold" style={{ background: `${deep.color}1f`, color: deep.color, borderColor: `${deep.color}55` }}>{deep.signal}</span> : null}
              {deep ? <span className="font-mono text-[13px] text-[#8c8c95]">{formatCurrency(deep.price, deep.currency)} now</span> : null}
            </div>
          </div>
          <button type="button" onClick={closeDeepAnalysis} aria-label="Close" className="px-1.5 py-1 text-[22px] leading-none text-[#5a5a62] hover:text-[#ececee]">×</button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] py-5">
          {query.isPending ? <Loading symbol={deepSymbol} /> : null}
          {query.isError ? <ErrorState symbol={deepSymbol} onRetry={() => query.refetch()} retrying={query.isFetching} /> : null}
          {deep && !query.isPending ? (
            <>
              <DeepChart deep={deep} />
              <OrderCard deep={deep} amount={deployAmount} shares={shares} />
              <DecideForMeCard deep={deep} />
              <div className="pb-2 text-center font-mono text-[11px] text-[#5a5a62]">Premium · not financial advice</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Loading({ symbol }: { symbol: string }) {
  return <div className="flex items-center gap-[11px] py-5 text-[#8c8c95]"><LoadingSpinner size={18} />Analyzing {symbol}…</div>;
}

function ErrorState({ symbol, onRetry, retrying }: { symbol: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2a2a31] bg-[#161619] p-4 text-sm text-[#f2575c]">
      Deep analysis for {symbol} is unavailable. Check the FinFeed API configuration.
      <button type="button" disabled={retrying} onClick={onRetry} className="flex flex-none items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">{retrying ? <LoadingSpinner size={12} /> : null}Retry</button>
    </div>
  );
}

export function DeepChart({ deep }: { deep: import("../lib/api").DeepAnalysisResponse }) {
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#0e0e10] p-4">
      <div className="mb-[10px] text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">30-day price · buy zone shaded</div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={deep.chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="deepFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={deep.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={deep.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {deep.buyZoneHigh > deep.buyZoneLow ? <ReferenceArea y1={deep.buyZoneLow} y2={deep.buyZoneHigh} fill="#3ecf8e" fillOpacity={0.1} stroke="none" /> : null}
            <Area type="monotone" dataKey="close" stroke={deep.color} strokeWidth={2.5} fill="url(#deepFill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[#5a5a62]"><span>30 days ago</span><span>Today</span></div>
    </div>
  );
}

export function OrderCard({ deep, amount, shares }: { deep: import("../lib/api").DeepAnalysisResponse; amount: number; shares: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#161619]">
      <div className="flex items-center gap-2 border-b border-[#2a2a31] px-4 py-[13px]">
        <span className="text-[13px] font-semibold">Where to place your order</span>
        <span className="ml-auto text-[11px] text-[#8c8c95]">{deep.when}</span>
      </div>
      <div className="grid grid-cols-2">
        <Cell label="Entry (limit)" value={formatCurrency(deep.entry, deep.currency)} color={deep.color} border />
        <Cell label="Stop loss" value={formatCurrency(deep.stop, deep.currency)} color="#f2575c" border />
        <Cell label="Price target" value={formatCurrency(deep.target, deep.currency)} border />
        <Cell label="Risk / Reward" value={formatMultiple(deep.riskReward)} color="#74a4ff" />
      </div>
      <div className="flex items-center justify-between border-t border-[#2a2a31] bg-[#0e0e10] px-4 py-3 text-xs text-[#8c8c95]">
        Deploy <span className="font-mono text-[#ececee]">{formatCurrency(amount, deep.currency)}</span> · <span className="font-mono text-[#ececee]">{shares.toFixed(2)}</span> shares
      </div>
    </div>
  );
}

function Cell({ label, value, color, border }: { label: string; value: string; color?: string; border?: boolean }) {
  return (
    <div className={`px-4 py-[14px] ${border ? "border-r border-b border-[#2a2a31]" : "border-b border-[#2a2a31]"}`}>
      <div className="mb-[5px] text-[10px] uppercase tracking-[0.5px] text-[#5a5a62]">{label}</div>
      <div className="font-mono text-[22px] font-semibold" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

export function DecideForMeCard({ deep }: { deep: import("../lib/api").DeepAnalysisResponse }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2a31]" style={{ background: "linear-gradient(160deg,#15171a,#101012)" }}>
      <div className="flex items-center gap-2 border-b border-[#2a2a31] px-4 py-[13px]">
        <span className="text-[13px] font-semibold">Decide for me</span>
      </div>
      <div className="px-4 py-[14px]">
        <p className="mb-3.5 text-[13px] leading-[1.6] text-[#bcbcc2]">{deep.action}</p>
        <div className="flex flex-col gap-[7px]">
          {deep.bullets.map((bullet, index) => (
            <div key={index} className="flex items-start gap-[9px] text-[12.5px] leading-[1.5] text-[#cfcfd4]">
              <span className="mt-px flex-none" style={{ color: deep.color }}>→</span>
              <span>{bullet}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
