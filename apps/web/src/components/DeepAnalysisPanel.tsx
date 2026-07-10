import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadDeepAnalysis, type DeepAnalysisResponse } from "../lib/api";
import { paddedDomain } from "../lib/chart";
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDeepAnalysis(); };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [deepOpen, closeDeepAnalysis]);

  if (!deepOpen) return null;
  const deep = query.data;
  const deployAmount = Math.min(Math.max(cashReserve, 0), 500) || 200;
  const plan = deep ? buildTradePlan(deep) : null;
  const shares = plan && plan.entry > 0 ? deployAmount / plan.entry : 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center overflow-hidden px-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] min-[720px]:items-start min-[720px]:overflow-y-auto min-[720px]:px-5 min-[720px]:py-6">
      <button type="button" aria-label="Close deep analysis" onClick={closeDeepAnalysis} className="absolute inset-0 bg-[#060608]/60 backdrop-blur-[3px]" />
      <div className="aw-deep-panel deep-panel-in relative flex h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[940px] max-w-full flex-col overflow-hidden rounded-t-2xl border border-[#2a2a31] bg-[#141417] shadow-[0_30px_90px_rgba(0,0,0,0.62)] min-[720px]:h-[calc(100vh-48px)] min-[720px]:rounded-2xl">
        <div className="deep-rainbow-bar h-[3px] flex-none" />

        <div className="flex flex-none items-center justify-between gap-4 border-b border-[#2a2a31] bg-[#141417] px-5 py-4 min-[720px]:gap-5 min-[720px]:px-8 min-[720px]:py-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-[-0.03em]">{deep?.symbol ?? deepSymbol}</span>
              <span className="text-sm text-[#8c8c95]">{deep?.name ?? "Live market data"}</span>
              <span className="rounded-lg bg-gradient-to-r from-[#f5c451] via-[#ff6b9d] to-[#c77dff] px-3 py-1 text-[10px] font-black tracking-[0.7px] text-white shadow-[0_0_24px_rgba(199,125,255,0.25)]">PRO</span>
            </div>
            <div className="mt-[5px] flex items-center gap-2">
              {deep ? <span className="rounded-[5px] border px-[9px] py-0.5 text-[10px] font-bold" style={{ background: `${deep.color}1f`, color: deep.color, borderColor: `${deep.color}55` }}>{deep.signal}</span> : null}
              {deep ? <span className="font-mono text-lg text-[#8c8c95]">{formatCurrency(deep.price, deep.currency)} now</span> : null}
            </div>
          </div>
          <button type="button" onClick={closeDeepAnalysis} aria-label="Close" className="grid h-10 w-10 flex-none place-items-center rounded-full border border-[#2a2a31] bg-[#101012] text-[24px] leading-none text-[#5a5a62] transition hover:border-[#8c8c95] hover:text-[#ececee]">×</button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-8 py-7 max-[720px]:px-5">
          {query.isPending ? <Loading symbol={deepSymbol} /> : null}
          {query.isError ? <ErrorState symbol={deepSymbol} onRetry={() => query.refetch()} retrying={query.isFetching} /> : null}
          {deep && !query.isPending ? (
            <>
              <DeepChart deep={deep} />
              <OrderCard deep={deep} plan={plan} amount={deployAmount} shares={shares} />
              <DecideForMeCard deep={deep} plan={plan} />
              <div className="pb-2 text-center font-mono text-[11px] text-[#5a5a62]">Premium · not financial advice</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type TradePlan = {
  entry: number;
  stop: number;
  target: number;
  riskReward: number;
  support: number;
  resistance: number;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildTradePlan(deep: DeepAnalysisResponse): TradePlan {
  const chartPrices = deep.chart.map((point) => point.close).filter(finiteNumber);
  const support = finiteNumber(deep.buyZoneLow) && deep.buyZoneLow > 0 ? deep.buyZoneLow : finiteNumber(deep.support) && deep.support > 0 ? deep.support : Math.min(...chartPrices, deep.price);
  const resistance = finiteNumber(deep.target) && deep.target > 0 ? deep.target : finiteNumber(deep.resistance) && deep.resistance > 0 ? deep.resistance : Math.max(...chartPrices, deep.price);
  const range = Math.max(resistance - support, deep.price * 0.05, 0.01);
  const entry = finiteNumber(deep.entry) && deep.entry > 0 ? deep.entry : deep.signal.includes("WAIT") || deep.signal.includes("TRIM") ? support + range * 0.35 : deep.price;
  const stop = finiteNumber(deep.stop) && deep.stop > 0 ? deep.stop : support - range * 0.08;
  const target = finiteNumber(deep.target) && deep.target > 0 ? deep.target : resistance + range * 0.15;
  const risk = entry - stop;
  const riskReward = finiteNumber(deep.riskReward) && deep.riskReward > 0 ? deep.riskReward : risk > 0 ? (target - entry) / risk : 0;
  return { entry, stop, target, riskReward, support, resistance };
}

function Loading({ symbol }: { symbol: string }) {
  return <div className="flex items-center gap-[14px] py-5 text-[#8c8c95]"><LoadingSpinner size={18} className="text-[#3ecf8e]" />Analyzing {symbol}…</div>;
}

function ErrorState({ symbol, onRetry, retrying }: { symbol: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2a2a31] bg-[#161619] p-4 text-sm text-[#f2575c]">
      Deep analysis for {symbol} is unavailable. Check the market data configuration.
      <button type="button" disabled={retrying} onClick={onRetry} className="flex flex-none items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">{retrying ? <LoadingSpinner size={12} /> : null}Retry</button>
    </div>
  );
}

export function DeepChart({ deep }: { deep: DeepAnalysisResponse }) {
  const domain = paddedDomain([
    ...deep.chart.map((point) => point.close),
    deep.buyZoneLow,
    deep.buyZoneHigh,
    deep.entry,
    deep.target,
  ]);

  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#0e0e10] p-4">
      <div className="mb-[10px] flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.5px] text-[#8c8c95]">30-day price · buy zone shaded</div>
        <div className="font-mono text-[10px] text-[#5a5a62]">Hover to inspect price/date</div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={deep.chart} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="deepFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={deep.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={deep.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#23232a" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis hide domain={domain} />
            <Tooltip
              cursor={{ stroke: "#c77dff", strokeWidth: 1, strokeDasharray: "3 4", strokeOpacity: 0.65 }}
              content={<DeepChartTooltip deep={deep} />}
            />
            {deep.buyZoneHigh > deep.buyZoneLow ? <ReferenceArea y1={deep.buyZoneLow} y2={deep.buyZoneHigh} fill="#3ecf8e" fillOpacity={0.1} stroke="none" /> : null}
            <Area type="monotone" dataKey="close" stroke={deep.color} strokeWidth={3} fill="url(#deepFill)" dot={false} activeDot={{ r: 5, fill: deep.color, stroke: "#0e0e10", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[#5a5a62]"><span>30 days ago</span><span>Today</span></div>
    </div>
  );
}

function DeepChartTooltip({ active, payload, label, deep }: { active?: boolean; payload?: Array<{ value?: number; payload?: { date?: string; close?: number } }>; label?: string; deep: DeepAnalysisResponse }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const close = point?.close ?? Number(payload[0]?.value);
  const date = point?.date ?? label ?? "Selected point";
  return (
    <div className="min-w-[210px] rounded-xl border border-[#34343c] bg-[#101114]/95 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="mb-2 font-mono text-[11px] text-[#8c8c95]">{date}</div>
      <TooltipRow label="Price" value={formatCurrency(close, deep.currency)} color={deep.color} />
      <TooltipRow label="Buy zone low" value={formatCurrency(deep.buyZoneLow, deep.currency)} color="#3ecf8e" />
      <TooltipRow label="Buy zone high" value={formatCurrency(deep.buyZoneHigh, deep.currency)} color="#3ecf8e" />
      <TooltipRow label="Entry" value={formatCurrency(deep.entry, deep.currency)} color={deep.color} />
      <TooltipRow label="Target" value={formatCurrency(deep.target, deep.currency)} color="#74a4ff" />
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-[12px]">
      <span className="text-[#8c8c95]">{label}</span>
      <span className="font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

export function OrderCard({ deep, plan, amount, shares }: { deep: DeepAnalysisResponse; plan: TradePlan | null; amount: number; shares: number }) {
  const activePlan = plan ?? buildTradePlan(deep);
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#161619]">
      <div className="flex items-center gap-2 border-b border-[#2a2a31] px-4 py-[13px]">
        <span className="text-[13px] font-semibold">Where to place your order</span>
        <span className="ml-auto text-[11px] text-[#8c8c95]">{deep.when}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#2a2a31] max-[640px]:grid-cols-1">
        <Cell label="Entry (limit)" value={formatCurrency(activePlan.entry, deep.currency)} color={deep.color} />
        <Cell label="Stop loss" value={formatCurrency(activePlan.stop, deep.currency)} color="#f2575c" />
        <Cell label="Price target" value={formatCurrency(activePlan.target, deep.currency)} />
        <Cell label="Risk / Reward" value={formatMultiple(activePlan.riskReward)} color="#74a4ff" />
      </div>
      <div className="flex items-center justify-between border-t border-[#2a2a31] bg-[#0e0e10] px-4 py-3 text-xs text-[#8c8c95]">
        Deploy <span className="font-mono text-[#ececee]">{formatCurrency(amount, deep.currency)}</span> · <span className="font-mono text-[#ececee]">{shares.toFixed(2)}</span> shares
      </div>
    </div>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-h-[104px] bg-[#161619] px-4 py-[18px]">
      <div className="mb-3 text-[10px] uppercase tracking-[0.5px] text-[#5a5a62]">{label}</div>
      <div className="break-words font-mono text-[24px] font-bold leading-[1.15] tracking-[-0.04em] text-[#ececee]" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

export function DecideForMeCard({ deep, plan }: { deep: DeepAnalysisResponse; plan: TradePlan | null }) {
  const activePlan = plan ?? buildTradePlan(deep);
  const action = deep.action?.trim() || `${deep.symbol} is currently at ${formatCurrency(deep.price, deep.currency)}. AlphaWolf would wait for an entry near ${formatCurrency(activePlan.entry, deep.currency)}, use ${formatCurrency(activePlan.stop, deep.currency)} as the risk line, and only expect the setup to work if price can move toward ${formatCurrency(activePlan.target, deep.currency)}.`;
  const bullets = deep.bullets?.filter(Boolean).length
    ? deep.bullets.filter(Boolean)
    : [
      `Current 30-day support is near ${formatCurrency(activePlan.support, deep.currency)} and resistance is near ${formatCurrency(activePlan.resistance, deep.currency)}.`,
      `Entry is set near ${formatCurrency(activePlan.entry, deep.currency)} instead of chasing the current price.`,
      `Risk/reward is approximately ${formatMultiple(activePlan.riskReward)} based on the computed stop and target.`,
    ];
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2a31]" style={{ background: "linear-gradient(160deg,#15171a,#101012)" }}>
      <div className="flex items-center gap-2 border-b border-[#2a2a31] px-4 py-[13px]">
        <span className="text-[13px] font-semibold">Decide for me</span>
      </div>
      <div className="min-h-[148px] px-4 py-[14px]">
        <p className="mb-3.5 text-[14px] leading-[1.7] text-[#d9d9de]">{action}</p>
        <div className="flex flex-col gap-[7px]">
          {bullets.map((bullet, index) => (
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
