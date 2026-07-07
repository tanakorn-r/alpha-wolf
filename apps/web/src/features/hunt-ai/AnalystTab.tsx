import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SearchIcon } from "../../components/ui/icons";
import type { StockAnalysisResponse, StockDetailResponse } from "../../lib/api";
import { paddedDomain } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { AnalystPanels } from "./AnalystPanels";
import { colorForTone, normalizeSignal } from "./lib";
import { PremiumLoading, panel } from "./ui";
import type { HuntAi } from "./useHuntAi";

export function AnalystTab({ hunt }: { hunt: HuntAi }) {
  const analyst = hunt.analyst;

  if (!hunt.premium) {
    return (
      <div className="rounded-2xl p-[2px]" style={{ background: "linear-gradient(135deg,#74a4ff,#3ecf8e,#c77dff,#74a4ff)", backgroundSize: "300% 300%" }}>
        <div className="flex flex-col items-center gap-5 rounded-[14px] bg-[#0a0c0f] px-10 py-12 text-center">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] border border-[#74a4ff]/30 bg-gradient-to-br from-[#74a4ff]/10 to-[#3ecf8e]/10">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="url(#aLkG)" strokeWidth="1.4"/><path d="M4 6h8M4 9h5" stroke="url(#aLkG)" strokeWidth="1.3" strokeLinecap="round"/><defs><linearGradient id="aLkG" x1="0" y1="0" x2="16" y2="16"><stop offset="0%" stopColor="#74a4ff"/><stop offset="100%" stopColor="#3ecf8e"/></linearGradient></defs></svg>
          </div>
          <div>
            <div className="mb-[9px] text-[22px] font-bold" style={{ background: "linear-gradient(90deg,#74a4ff,#3ecf8e,#c77dff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Stock Analyst</div>
            <div className="mx-auto max-w-[400px] text-[13px] leading-[1.7] text-[#8c8c95]">Search any stock — AlphaWolf pulls price action, news, revenue, cost structure, company fundamentals and tells you exactly how it fits your portfolio.</div>
          </div>
          <button type="button" onClick={hunt.unlockPremium} className="flex items-center gap-[9px] rounded-[11px] px-8 py-3 text-[14px] font-bold text-white hover:opacity-90" style={{ background: "linear-gradient(135deg,#74a4ff,#3ecf8e,#c77dff)" }}>
            Unlock Stock Analyst — from $29/mo
          </button>
        </div>
      </div>
    );
  }

  const hasResult = !analyst.loading && analyst.detail != null && analyst.analysis != null;
  const currency = analyst.detail?.stock.currency ?? "USD";
  const price = analyst.detail?.stock.price;
  const change = analyst.detail?.stock.changePct ?? 0;
  const inPortfolio = analyst.holdingSymbols.includes(analyst.ticker);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-[9px]">
        <div className="relative flex-1 max-w-[420px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={analyst.query}
            onChange={(e) => analyst.setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void analyst.run(analyst.query); }}
            placeholder="Any ticker — AAPL, TSLA, NVDA, PTT…"
            className="w-full rounded-[9px] border border-[#2a2a31] bg-[#161619] py-[11px] pl-9 pr-3 text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
          />
        </div>
        <button
          type="button"
          disabled={analyst.loading || !analyst.query.trim()}
          onClick={() => void analyst.run(analyst.query)}
          className="flex-none rounded-[8px] bg-[#3ecf8e] px-5 py-[10px] text-[13px] font-bold text-[#06120c] hover:opacity-85 disabled:opacity-50"
        >
          {analyst.loading ? "Analyzing..." : "Analyze →"}
        </button>
      </div>

      {analyst.holdingSymbols.length > 0 ? (
        <div className="flex flex-wrap items-center gap-[7px]">
          <span className="text-[11px] text-[#5a5a62]">Holdings:</span>
          {analyst.holdingSymbols.slice(0, 8).map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => { analyst.setQuery(sym); void analyst.run(sym); }}
              className={`rounded-[6px] border px-[10px] py-[4px] font-mono text-[12px] font-semibold transition-colors hover:border-[#3ecf8e] ${analyst.ticker === sym ? "border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#0e0e10] text-[#ececee]"}`}
            >
              {sym}
            </button>
          ))}
        </div>
      ) : null}

      {analyst.loading ? <PremiumLoading title={`AlphaWolf is deep-reading ${analyst.query.trim().toUpperCase() || "this stock"}...`} /> : null}

      {hasResult && analyst.detail && analyst.analysis ? (
        <div className="flex flex-col gap-3">
          <div className={`${panel} flex flex-wrap items-center justify-between gap-3 px-5 py-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="font-mono text-[20px] font-bold">{analyst.detail.stock.symbol}</div>
                <div className="mt-[1px] text-[12px] text-[#8c8c95]">{analyst.detail.stock.name}</div>
              </div>
              {inPortfolio ? <span className="rounded-[5px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/10 px-2 py-[2px] text-[10px] font-semibold text-[#3ecf8e]">IN YOUR PORTFOLIO</span> : null}
            </div>
            <div className="flex items-baseline gap-2">
              <div className="font-mono text-[24px] font-bold">{price != null ? formatCurrency(price, currency) : "—"}</div>
              <div className={`font-mono text-[13px] ${change >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
            </div>
          </div>
          <AnalystScoreCard analysis={analyst.analysis} currency={currency} />
          <AnalystPriceChart detail={analyst.detail} analysis={analyst.analysis} />
          <AnalystReasons analysis={analyst.analysis} />
          <AnalystPanels detail={analyst.detail} analysis={analyst.analysis} />
        </div>
      ) : null}

      {!analyst.loading && !analyst.ticker ? (
        <div className={`${panel} px-10 py-10 text-center`}>
          <div className="mb-3 text-[30px]">🐺</div>
          <div className="text-[14px] font-semibold">The pack is ready</div>
          <div className="mx-auto mt-2 max-w-[340px] text-[12.5px] leading-[1.7] text-[#8c8c95]">Search any ticker above or tap a holding. AlphaWolf pulls every signal and tells you exactly what to do.</div>
        </div>
      ) : null}
    </div>
  );
}

function AnalystPriceChart({ detail, analysis }: { detail: StockDetailResponse; analysis: StockAnalysisResponse }) {
  const currency = detail.stock.currency ?? "USD";
  const data = detail.history.slice(-80).map((point) => ({ date: point.date, close: point.close }));
  const domain = paddedDomain([
    ...data.map((point) => point.close),
    analysis.entryPrice?.entryPrice,
    analysis.targetPrice?.targetPrice,
  ], 0.12);

  return (
    <div className={`${panel} px-5 py-4`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Price Action</div>
          <div className="mt-1 text-[12px] text-[#8c8c95]">Recent closes with AI entry and target context.</div>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-[#8c8c95]">
          <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-[#3ecf8e]" />Price</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#f5c451]" />Entry</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[#74a4ff]" />Target</span>
        </div>
      </div>
      <div className="h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="analystPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis hide dataKey="date" />
            <YAxis hide domain={domain} />
            <Tooltip
              cursor={{ stroke: "#74a4ff", strokeWidth: 1, strokeDasharray: "3 4", strokeOpacity: 0.55 }}
              content={({ active, payload, label }) => active && payload?.length ? (
                <div className="rounded-lg border border-[#2a2a31] bg-[#101113] px-3 py-2 text-[11px] shadow-xl">
                  <div className="mb-1 font-mono text-[#8c8c95]">{label}</div>
                  <div className="font-mono font-semibold text-[#3ecf8e]">{formatCurrency(Number(payload[0].value), currency)}</div>
                </div>
              ) : null}
            />
            {analysis.entryPrice?.entryPrice != null ? <ReferenceLine y={analysis.entryPrice.entryPrice} stroke="#f5c451" strokeDasharray="4 4" strokeOpacity={0.8} /> : null}
            {analysis.targetPrice?.targetPrice != null ? <ReferenceLine y={analysis.targetPrice.targetPrice} stroke="#74a4ff" strokeDasharray="4 4" strokeOpacity={0.8} /> : null}
            <Area type="monotone" dataKey="close" stroke="#3ecf8e" strokeWidth={2} fill="url(#analystPriceFill)" dot={false} activeDot={{ r: 4, fill: "#3ecf8e", stroke: "#0d0f11", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnalystReasons({ analysis }: { analysis: StockAnalysisResponse }) {
  const color = colorForTone(analysis.tone);
  const reasons = [
    analysis.entryPrice?.why,
    analysis.targetPrice?.basis,
    ...analysis.bullets,
  ].filter(Boolean).slice(0, 4);

  if (!reasons.length) return null;
  return (
    <div className="rounded-[13px] border border-[#3ecf8e]/20 bg-[linear-gradient(135deg,rgba(62,207,142,0.04),rgba(77,150,255,0.03))] px-[18px] py-4">
      <div className="mb-3 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.8 4.5 4.7 1.5-4.7 1.2L8 14 6.2 8.7 1.5 7.5 6.2 6z" stroke="#3ecf8e" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#3ecf8e]">Why AlphaWolf says this</span>
      </div>
      <div className="grid grid-cols-2 gap-2 max-[820px]:grid-cols-1">
        {reasons.map((reason, index) => (
          <div key={index} className="flex items-start gap-2.5 rounded-[10px] border border-[#252529] bg-white/[0.02] px-3 py-3">
            <span className="grid h-5 w-5 flex-none place-items-center rounded-[5px] border text-[9px] font-bold" style={{ color, borderColor: `${color}40`, background: `${color}18` }}>{index + 1}</span>
            <span className="text-[12px] leading-[1.6] text-[#c8c8d0]">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalystScoreCard({ analysis, currency }: { analysis: StockAnalysisResponse; currency: string }) {
  const color = colorForTone(analysis.tone);
  const entry = analysis.entryPrice?.entryPrice;
  const target = analysis.targetPrice?.targetPrice;
  const stop = entry ? entry * 0.985 : null;
  return (
    <div className="rounded-[12px] p-[2px]" style={{ background: `linear-gradient(135deg,${color},#4d96ff,#c77dff)` }}>
      <div className="rounded-[10px] bg-[#0e0f12] px-5 py-[18px]">
        <div className="flex flex-wrap items-stretch gap-[18px]">
          <div className="flex min-w-[110px] flex-col justify-center gap-[2px]">
            <div className="font-mono text-[48px] font-extrabold leading-none" style={{ color }}>{analysis.confidence}</div>
            <div className="text-[10px] text-[#5a5a62]">/100 AlphaWolf Score</div>
            <div className="mt-[5px] text-[13px] font-bold" style={{ color }}>{normalizeSignal(analysis.signal)}</div>
          </div>
          <div className="w-px self-stretch bg-[#2a2a31]" />
          <div className="grid min-w-[260px] flex-1 grid-cols-3 gap-2.5 max-[760px]:grid-cols-1">
            <div className="rounded-[9px] bg-[#161619] px-[13px] py-[11px]">
              <div className="mb-[5px] text-[9px] uppercase tracking-[0.5px] text-[#5a5a62]">Entry Zone</div>
              <div className="font-mono text-[13px] font-bold text-[#f5c451]">{entry != null ? formatCurrency(entry, currency) : "—"}</div>
              <div className="mt-[3px] text-[10px] text-[#8c8c95]">{analysis.entryPrice?.why ?? "AI entry"}</div>
            </div>
            <div className="rounded-[9px] bg-[#161619] px-[13px] py-[11px]">
              <div className="mb-[5px] text-[9px] uppercase tracking-[0.5px] text-[#5a5a62]">Price Target</div>
              <div className="font-mono text-[13px] font-bold text-[#3ecf8e]">{target != null ? formatCurrency(target, currency) : "—"}</div>
              <div className="mt-[3px] text-[10px] text-[#8c8c95]">{analysis.targetPrice?.timeHorizon ?? "target"}</div>
            </div>
            <div className="rounded-[9px] bg-[#161619] px-[13px] py-[11px]">
              <div className="mb-[5px] text-[9px] uppercase tracking-[0.5px] text-[#5a5a62]">Stop Loss</div>
              <div className="font-mono text-[13px] font-bold text-[#f2575c]">{stop != null ? formatCurrency(stop, currency) : "—"}</div>
              <div className="mt-[3px] text-[10px] text-[#8c8c95]">−1.5% from entry</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
