import type { StockAnalysisResponse, StockDetailResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { formatCompact } from "./lib";
import { panel } from "./ui";

export function AnalystPanels({ detail, analysis }: { detail: StockDetailResponse; analysis: StockAnalysisResponse }) {
  const tech = detail.technicals;
  const biz = detail.business;
  const stock = detail.stock;
  const currency = stock.currency ?? "USD";
  const rsi = tech.rsi14 ?? 50;
  const rsiColor = rsi < 30 ? "#3ecf8e" : rsi > 70 ? "#f2575c" : "#f5c451";
  const rsiBadge = rsi < 30 ? "OVERSOLD" : rsi > 70 ? "OVERBOUGHT" : "NEUTRAL";
  const rsiHint = rsi < 30 ? "May be due for a bounce" : rsi > 70 ? "Momentum may be overstretched" : "Healthy mid-range momentum";

  const changePct = stock.changePct;
  const trend = changePct > 1 ? "Strong Uptrend" : changePct > 0 ? "Uptrend" : changePct > -1 ? "Downtrend" : "Strong Downtrend";
  const trendColor = changePct >= 0 ? "#3ecf8e" : "#f2575c";

  const rating = biz?.analystRating ?? "";
  const sentLabel = rating.toLowerCase().includes("buy") ? "BULLISH" : rating.toLowerCase().includes("sell") ? "BEARISH" : "NEUTRAL";
  const sentColor = sentLabel === "BULLISH" ? "#3ecf8e" : sentLabel === "BEARISH" ? "#f2575c" : "#f5c451";

  const epsGrowth = pctValue(biz?.earningsGrowth);
  const revGrowth = pctValue(biz?.revenueGrowth);
  const profitMargin = pctValue(biz?.profitMargin);
  const operatingMargin = pctValue(biz?.operatingMargin);
  const grossMargin = pctValue(biz?.grossMargin);
  const dividendYield = pctValue(biz?.dividendYield);
  const payoutRatio = pctValue(biz?.payoutRatio);
  const roe = pctValue(biz?.roe);
  const roa = pctValue(biz?.roa);
  const revGrowthColor = revGrowth != null ? (revGrowth > 0 ? "#3ecf8e" : "#f2575c") : "#ececee";

  const d2e = biz?.debtToEquity;
  const d2eColor = d2e != null ? (d2e > 200 ? "#f2575c" : d2e > 100 ? "#f5c451" : "#3ecf8e") : "#ececee";
  const beta = biz?.beta;
  const betaColor = beta != null ? (beta > 1.35 ? "#f2575c" : beta > 1 ? "#f5c451" : "#3ecf8e") : "#ececee";
  const riskLabel = d2e != null ? (d2e > 200 ? "HIGH LEVERAGE" : d2e > 100 ? "WATCH DEBT" : "LOW DEBT") : beta != null ? (beta > 1.2 ? "VOLATILE" : "CONTROLLED") : "REVIEW";
  const riskColor = d2e != null ? d2eColor : betaColor;

  const pe = biz?.peRatio;
  const peColor = pe != null ? (pe > 40 ? "#f2575c" : pe > 20 ? "#f5c451" : "#3ecf8e") : "#ececee";

  const news = detail.news.slice(0, 3);

  return (
    <div className="grid grid-cols-2 gap-[11px] max-[900px]:grid-cols-1">

      {/* Price Action */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 12l3-4 3 2 3-5 3 3" stroke="#3ecf8e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#3ecf8e]">Price Action</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: rsiColor }}>{rsiBadge}</span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">RSI — Momentum Gauge</div>
          <div className="mb-[4px] flex items-baseline gap-1">
            <span className="font-mono text-[24px] font-bold leading-none" style={{ color: rsiColor }}>{rsi.toFixed(0)}</span>
            <span className="text-[10px] text-[#4a4a52]">/ 100</span>
          </div>
          <div className="mb-[7px] text-[11px] text-[#8c8c95]">{rsiHint}</div>
          <div className="relative h-[6px] overflow-hidden rounded-[3px] bg-[#141418]">
            <div className="absolute inset-y-0 left-0 w-[30%] bg-[#3ecf8e]/18" />
            <div className="absolute inset-y-0 right-0 w-[30%] bg-[#f2575c]/18" />
            <div className="absolute left-0 top-0 h-full rounded-[3px]" style={{ width: `${Math.min(100, Math.max(0, rsi))}%`, background: rsiColor }} />
          </div>
          <div className="mt-[3px] flex justify-between font-mono text-[8.5px] text-[#353540]">
            <span>Oversold</span><span>Neutral</span><span>Overbought</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[#1d1d22] pt-2">
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Trend</span><span className="font-medium" style={{ color: trendColor }}>{trend}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Volume</span><span className="font-medium text-[#ececee]">{tech.volumeRatio != null ? `${tech.volumeRatio.toFixed(1)}× avg` : "—"}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">MACD</span><span className="font-medium text-[#ececee]">{tech.macd != null ? tech.macd.toFixed(2) : "—"}</span></div>
        </div>
      </div>

      {/* Latest News */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="#74a4ff" strokeWidth="1.4"/><path d="M4 6h8M4 9h5" stroke="#74a4ff" strokeWidth="1.3" strokeLinecap="round"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#74a4ff]">Latest News</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: sentColor }}>{sentLabel}</span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">Overall market mood</div>
          <div className="font-mono text-[22px] font-bold leading-[1.1]" style={{ color: sentColor }}>{sentLabel}</div>
          <div className="mt-[4px] text-[10px] text-[#8c8c95]">{rating || "Based on analyst consensus"}</div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#1d1d22] pt-2">
          {news.length ? news.map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="mt-[5px] h-[5px] w-[5px] flex-none rounded-full" style={{ background: sentColor }} />
              <span className="text-[11.5px] leading-[1.5] text-[#bcbcc2]">{item.title}</span>
            </div>
          )) : <span className="text-[12px] text-[#5a5a62]">No news available.</span>}
        </div>
      </div>

      {/* Revenue & Income */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="8" width="3.5" height="7" rx="0.8" fill="#3ecf8e" opacity="0.7"/><rect x="6.3" y="5" width="3.5" height="10" rx="0.8" fill="#3ecf8e"/><rect x="11.5" y="2" width="3.5" height="13" rx="0.8" fill="#3ecf8e" opacity="0.5"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#3ecf8e]">Revenue &amp; Income</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: epsGrowth != null ? (epsGrowth > 0 ? "#3ecf8e" : "#f2575c") : "#8c8c95" }}>
              {epsGrowth != null ? (epsGrowth > 0 ? "GROWING" : "DECLINING") : "REVIEW"}
            </span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">Earnings growth YoY</div>
          <div className="font-mono text-[24px] font-bold leading-none" style={{ color: epsGrowth != null ? (epsGrowth > 0 ? "#3ecf8e" : "#f2575c") : "#8c8c95" }}>
            {formatPct(epsGrowth, { signed: true })}
          </div>
          <div className="mt-[4px] text-[11px] text-[#8c8c95]">Earnings per share change</div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[#1d1d22] pt-2">
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Revenue Growth</span><span className="font-medium" style={{ color: revGrowthColor }}>{formatPct(revGrowth, { signed: true })}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Net Margin</span><span className="font-medium text-[#ececee]">{formatPct(profitMargin)}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Dividend Yield</span><span className="font-medium text-[#ececee]">{formatPct(dividendYield, { digits: 2 })}</span></div>
        </div>
      </div>

      {/* Cost Structure */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12" stroke="#f5c451" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="5.5" stroke="#f5c451" strokeWidth="1.2" opacity="0.4"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#f5c451]">Cost Structure</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: grossMargin != null ? (grossMargin > 40 ? "#3ecf8e" : grossMargin > 20 ? "#f5c451" : "#f2575c") : "#8c8c95" }}>
              {grossMargin != null ? (grossMargin > 40 ? "HIGH MARGIN" : grossMargin > 20 ? "MID MARGIN" : "THIN MARGIN") : "REVIEW"}
            </span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">Gross Margin</div>
          <div className="font-mono text-[24px] font-bold leading-none text-[#3ecf8e]">
            {formatPct(grossMargin)}
          </div>
          <div className="mt-[4px] text-[11px] text-[#8c8c95]">Revenue kept after direct costs</div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[#1d1d22] pt-2">
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Operating Margin</span><span className="font-medium text-[#ececee]">{formatPct(operatingMargin)}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Debt / Equity</span><span className="font-medium" style={{ color: d2eColor }}>{d2e != null ? `${d2e.toFixed(1)}%` : "—"}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Beta</span><span className="font-medium text-[#ececee]">{beta != null ? beta.toFixed(2) : "—"}</span></div>
        </div>
      </div>

      {/* Company Structure */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="1" width="5" height="3.5" rx="1" stroke="#c77dff" strokeWidth="1.3"/><rect x="1" y="10" width="5" height="3.5" rx="1" stroke="#c77dff" strokeWidth="1.3"/><rect x="10" y="10" width="5" height="3.5" rx="1" stroke="#c77dff" strokeWidth="1.3"/><path d="M8 4.5v2.5M8 7H4v3M8 7h4v3" stroke="#c77dff" strokeWidth="1.2" strokeLinecap="round"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#c77dff]">Company Structure</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: pe != null ? (pe < 15 ? "#3ecf8e" : pe < 30 ? "#f5c451" : "#f2575c") : "#8c8c95" }}>
              {pe != null ? (pe < 15 ? "VALUE" : pe < 30 ? "FAIR" : "PRICEY") : "REVIEW"}
            </span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">P/E Ratio — price vs earnings</div>
          <div className="font-mono text-[24px] font-bold leading-none" style={{ color: peColor }}>
            {pe != null ? `${pe.toFixed(1)}x` : "—"}
          </div>
          <div className="mt-[4px] text-[11px] text-[#8c8c95]">{pe != null ? (pe < 20 ? "Reasonably valued" : pe < 35 ? "Moderate premium" : "High growth expectations priced in") : "Valuation data unavailable"}</div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[#1d1d22] pt-2">
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Market Cap</span><span className="font-medium text-[#ececee]">{biz?.marketCap != null ? formatCompact(biz.marketCap, currency) : "—"}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Sector</span><span className="font-medium text-[#ececee] truncate max-w-[120px]">{stock.sector || biz?.sector || "—"}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Analyst Target</span><span className="font-medium text-[#ececee]">{biz?.targetMeanPrice != null ? formatCurrency(biz.targetMeanPrice, currency) : "—"}</span></div>
        </div>
      </div>

      {/* Balance Sheet & Risk */}
      <div className={`${panel} p-3.5`}>
        <div className="mb-2.5 flex items-center gap-[7px]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.8l5.5 2.2v3.8c0 3.1-2.1 5.4-5.5 6.5-3.4-1.1-5.5-3.4-5.5-6.5V4L8 1.8z" stroke="#74a4ff" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.4 8.1l1.7 1.7 3.5-3.7" stroke="#74a4ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#74a4ff]">Balance Sheet &amp; Risk</span>
          <div className="ml-auto rounded-[5px] border border-[#252529] bg-white/[0.04] px-[7px] py-[2px]">
            <span className="text-[9.5px] font-bold" style={{ color: riskColor }}>{riskLabel}</span>
          </div>
        </div>
        <div className="mb-2.5">
          <div className="mb-[3px] text-[10px] text-[#5a5a62]">Debt / Equity</div>
          <div className="font-mono text-[24px] font-bold leading-none" style={{ color: d2eColor }}>
            {d2e != null ? `${d2e.toFixed(1)}%` : "—"}
          </div>
          <div className="mt-[4px] text-[11px] text-[#8c8c95]">{d2e != null ? (d2e > 200 ? "Leverage is heavy" : d2e > 100 ? "Debt load needs watching" : "Balance sheet is not debt-heavy") : "Debt data unavailable"}</div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[#1d1d22] pt-2">
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">ROE</span><span className="font-medium text-[#ececee]">{formatPct(roe)}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">ROA</span><span className="font-medium text-[#ececee]">{formatPct(roa)}</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-[#666670]">Payout Ratio</span><span className="font-medium text-[#ececee]">{formatPct(payoutRatio)}</span></div>
        </div>
      </div>
    </div>
  );
}

function pctValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatPct(value: number | null | undefined, options: { signed?: boolean; digits?: number } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const digits = options.digits ?? 1;
  const sign = options.signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
