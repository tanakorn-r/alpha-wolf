import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { loadStockDetail, summarizeStock, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatPercent } from "../lib/format";

const panel = "rounded-xl border border-[#2a2a31] bg-[#161619]";
const BASE_WATCHLIST = ["SPY", "TSLA", "NVDA", "AAPL"];

export function DayTraderPage() {
  const [watchlist, setWatchlist] = useState<string[]>(BASE_WATCHLIST);
  const [ticker, setTicker] = useState("SPY");
  const [customInput, setCustomInput] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const detailQuery = useQuery({ queryKey: ["day-trader-detail", ticker], queryFn: () => loadStockDetail(ticker, "momentum") });
  const detail = detailQuery.data;
  const chartData = useMemo(() => (detail?.history ?? []).slice(-60).map((point) => ({ label: point.date.slice(5), close: point.close })), [detail]);

  function addTicker() {
    const symbol = customInput.trim().toUpperCase();
    if (!symbol || watchlist.includes(symbol)) return;
    setWatchlist((current) => [...current, symbol]);
    setTicker(symbol);
    setCustomInput("");
  }

  function removeTicker(symbol: string) {
    setWatchlist((current) => current.filter((item) => item !== symbol));
    if (ticker === symbol) setTicker(BASE_WATCHLIST[0]);
  }

  async function getVerdict() {
    setAnalyzing(true);
    setError("");
    try {
      setAnalysis(await summarizeStock(ticker, "momentum"));
    } catch {
      setError("AI verdict could not be generated for this ticker yet.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 text-[#ececee]">
      <div className={`${panel} p-5`}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Day Trader AI</div>
        <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em]">Live chart, AI signals, exact entry/stop/target.</h2>
        <p className="mt-2 max-w-[760px] text-sm leading-[1.6] text-[#8c8c95]">Quotes refresh on demand from live market data (delayed ~15–20 min, not tick-by-tick). Ask the AI for an entry/stop/target read whenever you want a verdict.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
        <div className={`${panel} flex flex-col gap-1 p-3`}>
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#5a5a62]">Watchlist</div>
          {watchlist.map((symbol) => (
            <WatchlistRow key={symbol} symbol={symbol} active={symbol === ticker} canRemove={!BASE_WATCHLIST.includes(symbol)} onClick={() => setTicker(symbol)} onRemove={() => removeTicker(symbol)} />
          ))}
          <div className="mt-2 flex gap-1.5 px-1">
            <input
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addTicker(); }}
              placeholder="Add ticker"
              className="w-full rounded-md border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
            <button type="button" onClick={addTicker} className="flex-none rounded-md border border-[#2a2a31] px-2.5 text-sm text-[#3ecf8e] hover:border-[#3ecf8e]">+</button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className={`${panel} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-lg font-bold">{ticker}</span>
                  <span className="text-xs text-[#8c8c95]">{detail?.stock.name ?? ""}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold">{detailQuery.isPending ? "—" : formatCurrency(detail?.stock.price, detail?.stock.currency ?? "USD")}</span>
                  <span className={`font-mono text-sm ${(detail?.stock.changePct ?? 0) >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{detailQuery.isPending ? "" : formatPercent(detail?.stock.changePct)}</span>
                </div>
              </div>
              <button type="button" disabled={analyzing} onClick={() => void getVerdict()} className="flex items-center gap-2 rounded-lg bg-[#3ecf8e] px-4 py-2.5 text-sm font-bold text-[#06120c] disabled:opacity-40">
                {analyzing ? <LoadingSpinner size={14} /> : null}
                {analyzing ? "Reading signals…" : "Get AI verdict"}
              </button>
            </div>
            <div className="mt-4 h-[260px]">
              {detailQuery.isPending ? (
                <div className="flex h-full items-center justify-center text-sm text-[#8c8c95]"><LoadingSpinner size={16} />Loading chart…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="dtFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="close" stroke="#3ecf8e" strokeWidth={2} fill="url(#dtFill)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {error ? <div className="rounded-xl border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">{error}</div> : null}
          {analysis ? <AiVerdictCard value={analysis} onRerun={() => void getVerdict()} size="modal" /> : null}
        </div>
      </div>
    </section>
  );
}

function WatchlistRow({ symbol, active, canRemove, onClick, onRemove }: { symbol: string; active: boolean; canRemove: boolean; onClick: () => void; onRemove: () => void }) {
  const quoteQuery = useQuery({ queryKey: ["day-trader-quote", symbol], queryFn: () => loadStockDetail(symbol, "momentum") });
  const quote = quoteQuery.data?.stock;
  return (
    <div className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${active ? "bg-[#1c1c20]" : "hover:bg-[#1c1c20]"}`}>
      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] font-semibold">{symbol}</span>
          <span className="font-mono text-[11px] text-[#8c8c95]">{quote ? formatCurrency(quote.price, quote.currency ?? "USD") : "—"}</span>
        </div>
        <div className={`font-mono text-[10.5px] ${quote && quote.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{quote ? formatPercent(quote.changePct) : ""}</div>
      </button>
      {canRemove ? <button type="button" onClick={onRemove} className="flex-none text-xs text-[#5a5a62] opacity-0 group-hover:opacity-100 hover:text-[#f2575c]">×</button> : null}
    </div>
  );
}
