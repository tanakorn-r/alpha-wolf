import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { loadLiveTradeQuote, summarizeStock, type LiveTradeRow, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatPercent } from "../lib/format";
import { getLocaleSettings } from "../lib/locale";
import { useWolfStore } from "../store/useWolfStore";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const seedWatch = ["NVDA", "AMD", "AAPL", "MSFT", "TSLA"];

const TV_SYMBOL: Record<string, string> = {
  KO: "NYSE:KO", SCHD: "AMEX:SCHD", O: "NYSE:O", ABBV: "NYSE:ABBV", MSFT: "NASDAQ:MSFT",
  JNJ: "NYSE:JNJ", SPY: "AMEX:SPY", TSLA: "NASDAQ:TSLA", NVDA: "NASDAQ:NVDA", AAPL: "NASDAQ:AAPL",
};

function tvSymbolFor(symbol: string) {
  if (TV_SYMBOL[symbol]) return TV_SYMBOL[symbol];
  if (symbol.endsWith(".BK")) return `SET:${symbol.slice(0, -3)}`;
  return symbol;
}

type PaperPosition = {
  ticker: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  size: number;
  openedAt: number;
};

type TradeLogEntry = {
  ts: string;
  type: string;
  ticker: string;
  side: string;
  price: number;
  pnl?: number;
};

export function LiveTradePage() {
  const localeSettings = getLocaleSettings();
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const [selected, setSelected] = useState("NVDA");
  const [watch, setWatch] = useState(seedWatch);
  const [input, setInput] = useState("");
  const [autoAi, setAutoAi] = useState(false);
  const [forecastAt, setForecastAt] = useState(() => Date.now());
  const [dirOverride, setDirOverride] = useState<"LONG" | "SHORT" | null>(null);
  const [position, setPosition] = useState<PaperPosition | null>(null);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [strat, setStrat] = useState<StrategyConfig>({ preset: "momentum", active: { emacross: true, macd: true, roc: true, rsi: true }, armed: false });
  const chartRef = useRef<HTMLDivElement>(null);
  const aiLoadedKeyRef = useRef("");
  const widgetId = useMemo(() => `tv-live-${selected.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`, [selected]);

  const quotes = useQueries({
    queries: watch.map((symbol) => ({
      queryKey: ["live-trade-quote", symbol],
      queryFn: () => loadLiveTradeQuote(symbol),
      refetchInterval: symbol === selected ? 5_000 : 20_000,
      staleTime: 0,
    })),
  });
  const rowFor = (symbol: string) => quotes[watch.indexOf(symbol)]?.data?.row ?? null;
  const selectedRow = rowFor(selected);
  const selectedWarning = quotes[watch.indexOf(selected)]?.data?.warning;

  const ai = useQuery({
    queryKey: ["live-trade-ai", selected, activeAgentId],
    queryFn: async () => {
      const requestKey = `${selected}:${activeAgentId}`;
      const result = await summarizeStock(selected, "momentum", activeAgentId, aiLoadedKeyRef.current === requestKey);
      aiLoadedKeyRef.current = requestKey;
      return result;
    },
    enabled: autoAi,
    refetchInterval: autoAi ? 60_000 : false,
    staleTime: 0,
  });

  const forecast = useMemo(
    () => buildForecast(selected, selectedRow, ai.data, forecastAt, dirOverride),
    [ai.data, dirOverride, forecastAt, selected, selectedRow],
  );
  const tracker = useMemo(() => buildTracker(forecast, selectedRow), [forecast, selectedRow]);

  // Accumulate a client-side tick series per ticker to feed the indicator engine.
  const price = selectedRow?.price ?? null;
  useEffect(() => {
    if (price == null) return;
    setSeries((prev) => {
      const current = prev[selected];
      if (!current) return { ...prev, [selected]: seedSeries(price) };
      if (current[current.length - 1] === price) return prev;
      return { ...prev, [selected]: [...current, price].slice(-240) };
    });
  }, [price, selected]);

  const stratSignal = useMemo(() => computeStrategy(series[selected] ?? [], strat.active), [series, selected, strat.active]);

  useEffect(() => {
    let cancelled = false;
    async function mountWidget() {
      await ensureTradingViewScript();
      if (cancelled || !chartRef.current || !window.TradingView) return;
      chartRef.current.innerHTML = "";
      const container = document.createElement("div");
      container.id = widgetId;
      container.className = "h-full w-full";
      chartRef.current.appendChild(container);
      new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbolFor(selected),
        interval: "1",
        timezone: localeSettings.timezone,
        theme: "dark",
        style: "1",
        locale: localeSettings.displayLanguage.split("-")[0],
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies: ["RSI@tv-basicstudies", "Volume@tv-basicstudies"],
        container_id: widgetId,
      });
    }
    void mountWidget();
    return () => {
      cancelled = true;
      if (chartRef.current) chartRef.current.innerHTML = "";
    };
  }, [localeSettings.displayLanguage, localeSettings.timezone, selected, widgetId]);

  useEffect(() => {
    setForecastAt(Date.now());
    setDirOverride(null);
  }, [selected]);

  function addTicker() {
    const next = input.trim().toUpperCase();
    if (!next) return;
    setWatch((items) => Array.from(new Set([...items, next])).slice(0, 10));
    setSelected(next);
    setInput("");
  }

  function removeTicker(symbol: string) {
    setWatch((items) => items.filter((item) => item !== symbol));
  }

  function reForecast() {
    setDirOverride(null);
    setForecastAt(Date.now());
    if (autoAi) void ai.refetch();
  }

  function acceptAdjust() {
    setDirOverride(forecast.direction === "LONG" ? "SHORT" : "LONG");
    setForecastAt(Date.now());
  }

  function enterPosition() {
    if (forecast.entry == null || forecast.stop == null || forecast.target == null || forecast.direction === "WAIT") return;
    const risk = Math.abs(forecast.entry - forecast.stop) || forecast.entry * 0.004;
    const size = Math.max(1, Math.round(200 / risk));
    setPosition({ ticker: selected, side: forecast.direction, entry: forecast.entry, sl: forecast.stop, tp: forecast.target, size, openedAt: Date.now() });
    setTradeLog((log) => [{ ts: new Date().toLocaleTimeString(), type: "ENTER", ticker: selected, side: forecast.direction, price: forecast.entry as number }, ...log].slice(0, 12));
  }

  function exitPosition(reason: "STOP" | "TP" | "EXIT") {
    if (!position) return;
    const last = rowFor(position.ticker)?.price ?? position.entry;
    const pnl = (last - position.entry) * position.size * (position.side === "LONG" ? 1 : -1);
    setTradeLog((log) => [{ ts: new Date().toLocaleTimeString(), type: reason, ticker: position.ticker, side: position.side, price: last, pnl }, ...log].slice(0, 12));
    setPosition(null);
  }

  const showAdjust = tracker.status === "invalidated" && position == null;

  return (
    <div className="flex flex-col gap-4">
      {/* Ticker bar */}
      <div className="flex flex-col gap-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-[360px] flex-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-[11px] top-1/2 -translate-y-1/2"><circle cx="7" cy="7" r="4.5" stroke="#5a5a62" strokeWidth="1.4" /><path d="M10.5 10.5L14 14" stroke="#5a5a62" strokeWidth="1.4" strokeLinecap="round" /></svg>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addTicker(); }}
              placeholder="Add any ticker — NVDA, AOT.BK, BTCUSD…"
              className="w-full rounded-[9px] border border-[#2a2a31] bg-[#161619] py-[10px] pl-[34px] pr-3 text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
          </div>
          <button type="button" onClick={addTicker} className="flex items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[#3ecf8e] px-4 py-[10px] text-[13px] font-bold text-[#06120c] transition-opacity hover:opacity-85">
            <span className="text-[16px] leading-none">+</span> Watch
          </button>
          <div className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-[#2a2a31] bg-[#161619] px-3 py-2">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#f2575c]" />
            <span className="font-mono text-[11.5px] font-semibold text-[#f2575c]">LIVE · TradingView</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-[7px]">
          <span className="whitespace-nowrap text-[11.5px] font-medium text-[#8c8c95]">Watching:</span>
          {watch.map((symbol) => {
            const row = rowFor(symbol);
            const active = symbol === selected;
            const chg = row?.changePct ?? null;
            const col = chg == null ? "#8c8c95" : chg >= 0 ? "#3ecf8e" : "#f2575c";
            return (
              <div key={symbol} className={`flex items-center overflow-hidden rounded-[9px] border ${active ? "border-[#3ecf8e]/55 bg-[#3ecf8e]/10" : "border-[#2a2a31] bg-[#161619]"}`}>
                <button type="button" onClick={() => setSelected(symbol)} className="flex items-center gap-[7px] px-3 py-2 hover:bg-[#3ecf8e]/5">
                  <span className="font-mono text-[12.5px] font-bold text-[#ececee]">{symbol}</span>
                  {row?.price != null ? <span className="font-mono text-[11px]" style={{ color: col }}>{formatLivePrice(row.price)}</span> : null}
                  {chg != null ? <span className="text-[9.5px]" style={{ color: col }}>{chg >= 0 ? "▲" : "▼"}{Math.abs(chg).toFixed(2)}%</span> : null}
                </button>
                {!active && watch.length > 1 ? (
                  <button type="button" onClick={() => removeTicker(symbol)} className="border-l border-[#2a2a31] px-[9px] py-2 text-[14px] text-[#5a5a62] hover:text-[#f2575c]">×</button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main grid: TradingView + AI intelligence */}
      <div className="grid items-start gap-[14px] min-[1180px]:grid-cols-[minmax(0,1fr)_366px]">
        <section className="overflow-hidden rounded-[12px] border border-[#2a2a31] bg-[#161619]">
          <div className="flex items-center justify-between border-b border-[#1f1f24] px-4 py-3">
            <div className="flex items-baseline gap-[11px]">
              <span className="font-mono text-[20px] font-extrabold tracking-[-0.4px] text-[#ececee]">{selected}</span>
              {selectedRow?.price != null ? <span className="font-mono text-[15px] font-bold text-[#ececee]">{formatLivePrice(selectedRow.price)}</span> : null}
              {selectedRow?.changePct != null ? (
                <span className={`font-mono text-[12px] ${selectedRow.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>
                  {selectedRow.changePct >= 0 ? "+" : ""}{selectedRow.changePct.toFixed(2)}%
                </span>
              ) : null}
            </div>
            <span className="font-mono text-[10.5px] text-[#5a5a62]">1-min · real-time candles</span>
          </div>
          <div ref={chartRef} className="h-[544px] w-full bg-[#0e0e10]" />
        </section>

        <aside className="flex flex-col gap-3">
          {/* Next-move prediction */}
          <div className="rounded-[13px] p-[1.5px]" style={{ background: "linear-gradient(135deg,#3ecf8e,#4d96ff,#c77dff)", backgroundSize: "300% 300%", animation: "aw-rainbow-shift 5s ease infinite" }}>
            <div className="rounded-[11.5px] bg-[#141417] p-[15px]">
              <div className="mb-[11px] flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.6px] text-[#8c8c95]">AI Next-Move Forecast</span>
                <button type="button" onClick={reForecast} className="flex items-center gap-1 text-[10px] text-[#74a4ff] hover:text-[#a9c6ff]">{ai.isFetching ? "reading…" : "↻ re-forecast"}</button>
              </div>
              <div className="mb-[3px] flex items-baseline gap-[9px]">
                <span className="text-[22px] font-extrabold tracking-[-0.3px]" style={{ color: forecast.color }}>{forecast.direction === "LONG" ? "▲" : forecast.direction === "SHORT" ? "▼" : "■"} {forecast.direction}</span>
                <span className="font-mono text-[14px] font-bold" style={{ color: forecast.color }}>{forecast.target != null ? formatLivePrice(forecast.target) : "—"}</span>
                <span className="font-mono text-[12px]" style={{ color: forecast.color }}>({formatPercent(forecast.targetPct)})</span>
              </div>
              <div className="mb-[11px] text-[11.5px] text-[#8c8c95]">
                Expected within <span className="font-semibold text-[#ececee]">{forecast.windowMin[0]}-{forecast.windowMin[1]} min</span> · forecast confidence <span className="font-semibold text-[#ececee]">{forecast.confidence}/100</span>
              </div>
              <div className="w-full rounded-[9px] bg-[#0e0e10] px-2 pb-1 pt-2">
                <ForecastSvg forecast={forecast} />
              </div>
              <div className="mt-2 flex flex-wrap gap-[14px] text-[10px] text-[#5a5a62]">
                <span className="flex items-center gap-[5px]"><span className="inline-block h-[2px] w-[14px] bg-[#ececee]" />Actual</span>
                <span className="flex items-center gap-[5px]"><span className="inline-block w-[14px] border-t-[1.6px] border-dashed" style={{ borderColor: forecast.color }} />Forecast path</span>
                <span className="flex items-center gap-[5px]"><span className="inline-block h-2 w-[10px] rounded-[2px]" style={{ background: forecast.color, opacity: 0.2 }} />Confidence cone</span>
              </div>
            </div>
          </div>

          {/* Forecast vs Reality tracker */}
          <div className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-[15px]">
            <div className="mb-[11px] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.6px] text-[#8c8c95]">Forecast vs Reality</span>
              <span className="font-mono text-[10px] text-[#5a5a62]">{tracker.elapsedBars} / {tracker.totalBars} bars</span>
            </div>
            <div className="mb-[13px] flex items-center gap-[11px]">
              <span className="rounded-[9px] px-[13px] py-1.5 text-[17px] font-extrabold tracking-[-0.2px]" style={{ color: tracker.color, background: `${tracker.color}1f` }}>{tracker.label}</span>
              <div className="min-w-0">
                <div className="font-mono text-[20px] font-extrabold leading-none" style={{ color: tracker.color }}>{tracker.matchPct}%</div>
                <div className="mt-0.5 text-[9.5px] text-[#5a5a62]">match to forecast</div>
              </div>
            </div>
            <p className="mb-3 text-[11.5px] leading-[1.55] text-[#bcbcc2]">{tracker.note}</p>
            <div className="mb-[11px] flex gap-2">
              <TrackerStat label="Forecast now" value={forecast.expectedNow != null ? formatLivePrice(forecast.expectedNow) : "—"} color="#8c8c95" />
              <TrackerStat label="Actual now" value={tracker.actual != null ? formatLivePrice(tracker.actual) : "—"} />
              <TrackerStat label="Live conf." value={String(forecast.confidence)} color={tracker.color} />
            </div>
            <div className="mb-1 flex justify-between text-[10px] text-[#5a5a62]"><span>Progress to target</span><span className="font-mono">{tracker.progressPct}%</span></div>
            <div className="h-[7px] overflow-hidden rounded-[4px] bg-[#0e0e10]">
              <div className="h-full rounded-[4px] transition-[width] duration-500" style={{ width: `${tracker.progressPct}%`, background: tracker.color }} />
            </div>
          </div>

          {/* Auto plan adjustment */}
          {showAdjust ? (
            <div className="rounded-[12px] p-[1.5px]" style={{ background: "linear-gradient(135deg,#f5c451,#f2575c)", backgroundSize: "200% 200%", animation: "aw-rainbow-shift 3s ease infinite" }}>
              <div className="rounded-[10.5px] bg-[#141417] p-[15px]">
                <div className="mb-[9px] flex items-center gap-2">
                  <span className="text-[15px]">⚠️</span>
                  <span className="text-[12px] font-bold text-[#f5c451]">Plan invalidated — AI revised it</span>
                </div>
                <p className="mb-3 text-[11.5px] leading-[1.55] text-[#bcbcc2]">
                  Price broke the forecast. Here's the adjusted <span className="font-bold" style={{ color: adjustColor(forecast) }}>{adjustDir(forecast)}</span> plan for the new conditions:
                </p>
                <div className="mb-3 flex flex-col gap-[5px]">
                  <PlanRow label="New entry" value={selectedRow?.price != null ? formatLivePrice(selectedRow.price) : "—"} color={adjustColor(forecast)} />
                  <PlanRow label="New stop" value={adjustStop(forecast, selectedRow)} color="#f2575c" />
                  <PlanRow label="New target" value={adjustTarget(forecast, selectedRow)} color="#3ecf8e" />
                </div>
                <div className="flex gap-[7px]">
                  <button type="button" onClick={acceptAdjust} className="flex-1 rounded-[8px] bg-[#3ecf8e] p-[10px] text-center text-[12.5px] font-bold text-[#06120c] hover:opacity-90">Use new plan</button>
                  <button type="button" onClick={reForecast} className="rounded-[8px] border border-[#2a2a31] bg-[#161619] px-[14px] py-[10px] text-[12.5px] font-semibold text-[#8c8c95] hover:text-[#ececee]">Dismiss</button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Live position OR enter card */}
          {position ? (
            <PositionCard position={position} row={rowFor(position.ticker)} onExit={exitPosition} />
          ) : forecast.direction !== "WAIT" && forecast.entry != null ? (
            <div className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-[15px]">
              <div className="mb-[10px] text-[10px] uppercase tracking-[0.6px] text-[#8c8c95]">Trade this forecast</div>
              <div className="mb-3 flex flex-col gap-[5px]">
                <PlanRow label="Enter" value={formatLivePrice(forecast.entry)} color={forecast.color} />
                <PlanRow label="Stop loss" value={forecast.stop != null ? formatLivePrice(forecast.stop) : "—"} color="#f2575c" />
                <PlanRow label="Take profit" value={forecast.target != null ? formatLivePrice(forecast.target) : "—"} color="#3ecf8e" />
              </div>
              <button type="button" onClick={enterPosition} className="w-full rounded-[9px] p-3 text-center text-[14px] font-bold text-white hover:opacity-90" style={{ background: `linear-gradient(135deg,${forecast.color},#4d96ff)` }}>
                ⚡ Enter {forecast.direction} — {formatLivePrice(forecast.entry)}
              </button>
              <div className="mt-[9px] text-center text-[10.5px] text-[#5a5a62]">Alarms fire at SL · TP · Entry as price ticks</div>
            </div>
          ) : null}

          <div className="text-center font-mono text-[10.5px] text-[#5a5a62]">Chart: live TradingView · AI forecast: simulated · not financial advice</div>
          {selectedWarning ? <div className="rounded-[12px] border border-[#5a4530] bg-[#211b12] p-3 text-[12px] leading-[1.45] text-[#f5c451]">{selectedWarning}</div> : null}
        </aside>
      </div>

      {/* Strategy builder */}
      <StrategyBuilder ticker={selected} config={strat} onChange={setStrat} signal={stratSignal} />

      {/* Trade log */}
      {tradeLog.length > 0 ? (
        <section className="overflow-hidden rounded-[12px] border border-[#2a2a31] bg-[#161619]">
          <div className="flex items-center justify-between border-b border-[#1f1f24] px-4 py-3">
            <span className="text-[13px] font-semibold text-[#ececee]">Session Trade Log</span>
            <span className="font-mono text-[10.5px] text-[#5a5a62]">This session only</span>
          </div>
          {tradeLog.map((entry, index) => (
            <div key={`${entry.ts}-${index}`} className="flex items-center gap-3 border-b border-[#1a1a1e] px-4 py-[10px] text-[12px] last:border-b-0">
              <span className="w-[54px] flex-none font-mono text-[10px] text-[#5a5a62]">{entry.ts}</span>
              <span className="flex-none rounded-[4px] bg-[#0e0e10] px-[7px] py-0.5 text-[10px] font-bold text-[#ececee]">{entry.type}</span>
              <span className="flex-none font-mono font-semibold text-[#ececee]">{entry.ticker}</span>
              <span className="flex-none text-[#8c8c95]">{entry.side}</span>
              <span className="flex-none font-mono text-[#ececee]">@ {formatLivePrice(entry.price)}</span>
              {entry.pnl != null ? (
                <span className={`ml-auto font-mono font-bold ${entry.pnl >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{entry.pnl >= 0 ? "+" : ""}{entry.pnl.toFixed(2)}</span>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setAutoAi((enabled) => !enabled)}
        className={`self-start rounded-[9px] border px-3 py-2 text-[11.5px] font-bold transition-colors ${autoAi ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#161619] text-[#8c8c95] hover:text-[#ececee]"}`}
      >
        {autoAi ? "AI auto-analysis on · every 1 min" : "Turn on AI analysis every 1 min"}
      </button>
    </div>
  );
}

/* ---------- Paper position ---------- */

function PositionCard({ position, row, onExit }: { position: PaperPosition; row: LiveTradeRow | null; onExit: (reason: "STOP" | "TP" | "EXIT") => void }) {
  const cur = row?.price ?? position.entry;
  const pnl = (cur - position.entry) * position.size * (position.side === "LONG" ? 1 : -1);
  const pnlPct = ((cur - position.entry) / position.entry) * 100 * (position.side === "LONG" ? 1 : -1);
  const pnlColor = pnl >= 0 ? "#3ecf8e" : "#f2575c";
  const range = position.side === "LONG" ? position.tp - position.sl : position.sl - position.tp;
  const traveled = position.side === "LONG" ? cur - position.sl : position.sl - cur;
  const progress = Math.max(0, Math.min(100, Math.round((traveled / (range || 1)) * 100)));
  const elapsedMin = Math.max(0, Math.round((Date.now() - position.openedAt) / 60_000));
  return (
    <div className="rounded-[12px] p-[2px]" style={{ background: `linear-gradient(135deg,${pnlColor},#161619,${pnlColor})`, backgroundSize: "300% 300%", animation: "aw-rainbow-shift 4s ease infinite" }}>
      <div className="rounded-[10px] bg-[#0d0f11] p-[14px]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-[7px]">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#f2575c]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#f2575c]">Live · {position.side}</span>
          </div>
          <span className="font-mono text-[10.5px] text-[#5a5a62]">{elapsedMin}m open · {position.size} units</span>
        </div>
        <div className="mb-[10px] flex items-baseline gap-[10px]">
          <span className="font-mono text-[24px] font-bold" style={{ color: pnlColor }}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</span>
          <span className="font-mono text-[13px]" style={{ color: pnlColor }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
          <span className="ml-auto font-mono text-[18px] font-semibold text-[#ececee]">{formatLivePrice(cur)}</span>
        </div>
        <div className="mb-[10px]">
          <div className="mb-1 flex justify-between font-mono text-[9.5px]">
            <span className="text-[#f2575c]">SL {formatLivePrice(position.sl)}</span>
            <span className="text-[#f5c451]">ENTRY {formatLivePrice(position.entry)}</span>
            <span className="text-[#3ecf8e]">TP {formatLivePrice(position.tp)}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-[4px] bg-[#1a1a1e]">
            <div className="absolute left-0 h-full rounded-[4px] transition-[width] duration-500" style={{ width: `${progress}%`, background: pnlColor }} />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onExit("STOP")} className="flex-1 rounded-[8px] border border-[#f2575c]/30 bg-[#f2575c]/10 p-[9px] text-center text-[11.5px] font-semibold text-[#f2575c] hover:bg-[#f2575c]/20">Stop</button>
          <button type="button" onClick={() => onExit("TP")} className="flex-1 rounded-[8px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 p-[9px] text-center text-[11.5px] font-semibold text-[#3ecf8e] hover:bg-[#3ecf8e]/20">Take Profit</button>
          <button type="button" onClick={() => onExit("EXIT")} className="flex-1 rounded-[8px] border border-[#2a2a31] bg-[#161619] p-[9px] text-center text-[11.5px] font-semibold text-[#8c8c95] hover:text-[#ececee]">Exit</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Strategy builder (client-side indicator engine, ported from V8) ---------- */

type RuleKey = "emacross" | "macd" | "rsi" | "roc" | "boll" | "stoch" | "trend" | "vwap";

type StrategyConfig = {
  preset: string;
  active: Partial<Record<RuleKey, boolean>>;
  armed: boolean;
};

const STRAT_RULES: Record<RuleKey, { name: string; tag: string }> = {
  emacross: { name: "EMA 9 / 21 cross", tag: "Trend" },
  macd: { name: "MACD (12,26,9)", tag: "Momentum" },
  rsi: { name: "RSI (14)", tag: "Momentum" },
  roc: { name: "Rate of Change (10)", tag: "Momentum" },
  boll: { name: "Bollinger %B (20,2)", tag: "Volatility" },
  stoch: { name: "Stochastic %K (14)", tag: "Momentum" },
  trend: { name: "EMA-50 slope", tag: "Trend" },
  vwap: { name: "Price vs VWAP", tag: "Trend" },
};

const STRAT_PRESETS: Record<string, { label: string; rules: RuleKey[] }> = {
  momentum: { label: "Momentum", rules: ["emacross", "macd", "roc", "rsi"] },
  reversion: { label: "Mean Reversion", rules: ["rsi", "boll", "stoch"] },
  trend: { label: "Trend Follow", rules: ["emacross", "trend", "macd"] },
  breakout: { label: "Breakout", rules: ["boll", "roc", "vwap"] },
};

type RuleResult = {
  key: RuleKey;
  name: string;
  tag: string;
  reading: string;
  bias: -1 | 0 | 1;
  fill: number;
  note: string;
};

type StrategySignal = {
  rows: RuleResult[];
  dom: -1 | 0 | 1;
  aligned: number;
  against: number;
  total: number;
  conf: number;
};

function ema(values: number[], n: number) {
  const k = 2 / (n + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function emaSeries(values: number[], n: number) {
  const k = 2 / (n + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function evalRule(key: RuleKey, s: number[]): RuleResult {
  const n = s.length;
  const last = s[n - 1];
  const meta = STRAT_RULES[key];
  const mk = (reading: string, bias: -1 | 0 | 1, fill: number, note: string): RuleResult => ({ key, name: meta.name, tag: meta.tag, reading, bias, fill: Math.round(clamp(fill, 2, 98)), note });
  if (n < 3) return mk("warming up", 0, 50, "Gathering ticks…");
  if (key === "rsi") {
    const m = Math.min(14, n - 1);
    let g = 0;
    let l = 0;
    for (let i = n - m; i < n; i++) {
      const d = s[i] - s[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    const rs = l === 0 ? 100 : g / l;
    const v = 100 - 100 / (1 + rs);
    const bias = v < 38 ? 1 : v > 62 ? -1 : 0;
    return mk(`RSI ${v.toFixed(0)}`, bias, v, v < 38 ? "Oversold — snap-back likely" : v > 62 ? "Overbought — stretched" : "Neutral zone");
  }
  if (key === "emacross") {
    const e9 = ema(s, 9);
    const e21 = ema(s, 21);
    const sp = ((e9 - e21) / e21) * 100;
    return mk(`${e9 > e21 ? "9 > 21" : "9 < 21"} · ${sp >= 0 ? "+" : ""}${sp.toFixed(2)}%`, e9 > e21 ? 1 : -1, 50 + clamp(sp * 40, -48, 48), e9 > e21 ? "Fast EMA above slow — bullish" : "Fast EMA below slow — bearish");
  }
  if (key === "macd") {
    const m12 = emaSeries(s, 12);
    const m26 = emaSeries(s, 26);
    const macd = m12.map((v, i) => v - m26[i]);
    const sig = emaSeries(macd, 9);
    const hist = macd[n - 1] - sig[n - 1];
    return mk(`Hist ${hist >= 0 ? "+" : ""}${hist.toFixed(3)}`, hist > 0 ? 1 : -1, 50 + clamp((hist / last) * 8000, -48, 48), hist > 0 ? "Histogram positive — momentum up" : "Histogram negative — momentum down");
  }
  if (key === "roc") {
    const k = Math.min(10, n - 1);
    const roc = (last / s[n - 1 - k] - 1) * 100;
    const bias = roc > 0.04 ? 1 : roc < -0.04 ? -1 : 0;
    return mk(`${roc >= 0 ? "+" : ""}${roc.toFixed(2)}% / ${k}b`, bias, 50 + clamp(roc * 30, -48, 48), roc > 0.04 ? "Accelerating higher" : roc < -0.04 ? "Rolling over" : "Flat");
  }
  if (key === "boll") {
    const w = Math.min(20, n);
    const sl = s.slice(n - w);
    const avg = sl.reduce((a, b) => a + b, 0) / w;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - avg) ** 2, 0) / w) || 1e-6;
    const pB = ((last - (avg - 2 * sd)) / (4 * sd)) * 100;
    const bias = pB < 15 ? 1 : pB > 85 ? -1 : 0;
    return mk(`%B ${pB.toFixed(0)}`, bias, pB, pB < 15 ? "Riding lower band — mean-revert up" : pB > 85 ? "Pinned to upper band" : "Mid-channel");
  }
  if (key === "stoch") {
    const w = Math.min(14, n);
    const sl = s.slice(n - w);
    const hi = Math.max(...sl);
    const lo = Math.min(...sl);
    const kV = hi === lo ? 50 : ((last - lo) / (hi - lo)) * 100;
    const bias = kV < 20 ? 1 : kV > 80 ? -1 : 0;
    return mk(`%K ${kV.toFixed(0)}`, bias, kV, kV < 20 ? "Oversold turn setting up" : kV > 80 ? "Overbought" : "Neutral");
  }
  if (key === "trend") {
    const es = emaSeries(s, Math.min(50, n));
    const back = Math.min(6, es.length - 1);
    const slope = ((es[es.length - 1] - es[es.length - 1 - back]) / es[es.length - 1 - back]) * 100;
    const bias = slope > 0.02 ? 1 : slope < -0.02 ? -1 : 0;
    return mk(`${slope >= 0 ? "+" : ""}${slope.toFixed(2)}%`, bias, 50 + clamp(slope * 40, -48, 48), slope > 0.02 ? "EMA-50 rising" : slope < -0.02 ? "EMA-50 falling" : "Sideways");
  }
  // vwap (volume-weighted proxy: rolling mean of the tick series)
  const w = Math.min(20, n);
  const sl = s.slice(n - w);
  const vwap = sl.reduce((a, b) => a + b, 0) / w;
  const d = ((last - vwap) / vwap) * 100;
  const bias = d > 0.03 ? 1 : d < -0.03 ? -1 : 0;
  return mk(`${d >= 0 ? "+" : ""}${d.toFixed(2)}% vs VWAP`, bias, 50 + clamp(d * 40, -48, 48), d > 0 ? "Trading above VWAP" : "Trading below VWAP");
}

function computeStrategy(series: number[], active: Partial<Record<RuleKey, boolean>>): StrategySignal {
  const keys = (Object.keys(STRAT_RULES) as RuleKey[]).filter((key) => active[key]);
  const source = series.length ? series : [100, 100, 100];
  const rows = keys.map((key) => evalRule(key, source));
  const net = rows.reduce((acc, row) => acc + row.bias, 0);
  const dom: -1 | 0 | 1 = net > 0 ? 1 : net < 0 ? -1 : 0;
  const aligned = rows.filter((row) => row.bias !== 0 && row.bias === dom).length;
  const against = rows.filter((row) => row.bias !== 0 && row.bias !== dom).length;
  const total = rows.length;
  const conf = total ? Math.round((aligned / total) * 100) : 0;
  return { rows, dom, aligned, against, total, conf };
}

function StrategyBuilder({ ticker, config, onChange, signal }: { ticker: string; config: StrategyConfig; onChange: (config: StrategyConfig) => void; signal: StrategySignal }) {
  const domColor = signal.dom > 0 ? "#3ecf8e" : signal.dom < 0 ? "#f2575c" : "#8c8c95";
  const domLabel = signal.dom > 0 ? "LONG SETUP" : signal.dom < 0 ? "SHORT SETUP" : "NO EDGE YET";
  const confColor = signal.conf >= 75 ? "#3ecf8e" : signal.conf >= 50 ? "#f5c451" : "#8c8c95";
  const ready = config.armed && signal.dom !== 0 && signal.conf >= 75;
  const readyDir = signal.dom > 0 ? "LONG" : "SHORT";

  function setPreset(key: string) {
    const active: Partial<Record<RuleKey, boolean>> = {};
    STRAT_PRESETS[key].rules.forEach((rule) => { active[rule] = true; });
    onChange({ ...config, preset: key, active });
  }

  function toggleRule(key: RuleKey) {
    const active = { ...config.active };
    if (active[key]) delete active[key]; else active[key] = true;
    onChange({ ...config, preset: "custom", active });
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#2a2a31] bg-[#161619]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1f1f24] px-4 py-[14px]">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13V9M6 13V5M10 13V7M14 13V3" stroke="#3ecf8e" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span className="text-[13.5px] font-bold tracking-[-0.2px] text-[#ececee]">Strategy Builder</span>
          <span className="font-mono text-[10px] text-[#5a5a62]">{ticker} · live · 1-min</span>
        </div>
        <div className="ml-auto flex gap-[3px] rounded-[9px] border border-[#23232a] bg-[#0e0e10] p-[3px]">
          {[...Object.entries(STRAT_PRESETS).map(([key, preset]) => ({ key, label: preset.label, click: () => setPreset(key) })), { key: "custom", label: "Custom", click: () => {} }].map((preset) => {
            const sel = config.preset === preset.key;
            return (
              <button key={preset.key} type="button" onClick={preset.click} className={`whitespace-nowrap rounded-[6px] px-[11px] py-1.5 text-[11.5px] font-semibold ${sel ? "bg-[#ececee] text-[#0d0f11]" : preset.key === "custom" ? "text-[#5a5a62]" : "text-[#8c8c95] hover:text-[#ececee]"}`}>
                {preset.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...config, armed: !config.armed })}
          className={`flex items-center gap-1.5 rounded-[9px] border px-[13px] py-[7px] ${config.armed ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/15 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#161619] text-[#8c8c95]"}`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current" />
          <span className="text-[11.5px] font-bold tracking-[0.4px]">{config.armed ? "ARMED" : "ARM"}</span>
        </button>
      </div>

      <div className="grid min-[900px]:grid-cols-[300px_1fr]">
        {/* Verdict rail */}
        <div className="flex flex-col gap-[14px] border-b border-[#1f1f24] p-[18px] pb-4 min-[900px]:border-b-0 min-[900px]:border-r">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.6px] text-[#8c8c95]">Composite signal</div>
            <div className="text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: domColor }}>{domLabel}</div>
            <div className="mt-1 text-[12px] text-[#8c8c95]">
              <span className="font-bold text-[#3ecf8e]">{signal.aligned}</span> aligned · <span className="font-bold text-[#f2575c]">{signal.against}</span> against · {signal.total} rules
            </div>
          </div>
          <div>
            <div className="mb-[5px] flex justify-between text-[10px] text-[#5a5a62]">
              <span>Conviction</span>
              <span className="font-mono font-bold" style={{ color: confColor }}>{signal.conf}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-[5px] bg-[#0e0e10]">
              <div className="h-full rounded-[5px] transition-[width] duration-500" style={{ width: `${signal.conf}%`, background: confColor }} />
            </div>
          </div>
          {ready ? (
            <div className="rounded-[11px] p-[1.5px]" style={{ background: "linear-gradient(135deg,#3ecf8e,#4d96ff)", backgroundSize: "200% 200%", animation: "aw-rainbow-shift 3s ease infinite" }}>
              <div className="rounded-[9.5px] bg-[#0d0f11] px-[13px] py-3">
                <div className="mb-1 flex items-center gap-[7px]">
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: domColor }} />
                  <span className="text-[11px] font-extrabold tracking-[0.4px]" style={{ color: domColor }}>SIGNAL READY · {readyDir}</span>
                </div>
                <div className="text-[11px] leading-[1.5] text-[#bcbcc2]">Your armed strategy just aligned. Conditions favor a {readyDir} entry right now.</div>
              </div>
            </div>
          ) : null}
          {config.armed && !ready ? (
            <div className="text-[10.5px] leading-[1.5] text-[#5a5a62]">Armed — AlphaWolf watches every tick and alerts the moment your rules stack up ≥ 75%.</div>
          ) : null}
        </div>

        {/* Rule stack */}
        <div className="flex flex-col gap-2 px-[14px] py-3">
          {signal.rows.length > 0 ? (
            signal.rows.map((row) => {
              const agree = row.bias !== 0 && row.bias === signal.dom;
              const state = row.bias === 0 ? "NEUTRAL" : agree ? "ALIGNED" : "AGAINST";
              const stateColor = row.bias === 0 ? "#8c8c95" : agree ? "#3ecf8e" : "#f2575c";
              const barColor = row.bias > 0 ? "#3ecf8e" : row.bias < 0 ? "#f2575c" : "#5a5a62";
              return (
                <div key={row.key} className="flex items-center gap-[14px] rounded-[10px] border border-[#1f1f24] bg-[#0e0e10] px-[13px] py-[11px]">
                  <div className="w-[150px] flex-none">
                    <div className="text-[12.5px] font-semibold text-[#ececee]">{row.name}</div>
                    <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.4px] text-[#5a5a62]">{row.tag}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="font-mono text-[12px] font-bold text-[#ececee]">{row.reading}</span>
                      <span className="text-[10.5px] text-[#8c8c95]">{row.note}</span>
                    </div>
                    <div className="relative h-[5px] overflow-hidden rounded-[3px] bg-[#1a1a1e]">
                      <div className="absolute bottom-0 top-0 w-px bg-[#3a3a42]" style={{ left: "calc(50% - 0.5px)" }} />
                      <div className="h-full rounded-[3px] transition-[width] duration-500" style={{ width: `${row.fill}%`, background: barColor }} />
                    </div>
                  </div>
                  <div className="w-[74px] flex-none text-right">
                    <span className="text-[10px] font-extrabold tracking-[0.5px]" style={{ color: stateColor }}>{state}</span>
                  </div>
                  <button type="button" onClick={() => toggleRule(row.key)} className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] border border-[#2a2a31] bg-[#1a1a1e] text-[14px] text-[#5a5a62] hover:border-[#f2575c] hover:text-[#f2575c]">×</button>
                </div>
              );
            })
          ) : (
            <div className="p-[26px] text-center text-[12.5px] text-[#5a5a62]">No rules in the stack. Add indicators below to build your edge.</div>
          )}

          {/* Add indicators */}
          <div className="mt-1 border-t border-dashed border-[#23232a] pt-[11px]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.5px] text-[#5a5a62]">Indicator library — tap to add / remove</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STRAT_RULES) as RuleKey[]).map((key) => {
                const on = !!config.active[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleRule(key)}
                    className={`flex items-center gap-1.5 rounded-[8px] border px-[11px] py-1.5 ${on ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#161619] text-[#8c8c95] hover:text-[#ececee]"}`}
                  >
                    <span className="text-[12px] font-semibold">{STRAT_RULES[key].name}</span>
                    <span className="text-[9px] opacity-70">{STRAT_RULES[key].tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Forecast / tracker (unchanged logic, V8 styling) ---------- */

type LiveForecast = {
  symbol: string;
  direction: "LONG" | "SHORT" | "WAIT";
  target: number | null;
  stop: number | null;
  entry: number | null;
  targetPct: number;
  confidence: number;
  windowMin: [number, number];
  generatedAt: number;
  points: number[];
  expectedNow: number | null;
  color: string;
};

type ForecastTracker = {
  status: "tracking" | "invalidated" | "hit" | "waiting";
  label: string;
  note: string;
  matchPct: number;
  progressPct: number;
  actual: number | null;
  color: string;
  elapsedBars: number;
  totalBars: number;
};

function adjustDir(forecast: LiveForecast) {
  return forecast.direction === "LONG" ? "SHORT" : "LONG";
}

function adjustColor(forecast: LiveForecast) {
  return forecast.direction === "LONG" ? "#f2575c" : "#3ecf8e";
}

function adjustStop(forecast: LiveForecast, row: LiveTradeRow | null | undefined) {
  const cur = row?.price;
  if (cur == null) return "—";
  const dir = adjustDir(forecast) === "LONG" ? -1 : 1;
  return formatLivePrice(cur * (1 + dir * 0.0055));
}

function adjustTarget(forecast: LiveForecast, row: LiveTradeRow | null | undefined) {
  const cur = row?.price;
  if (cur == null) return "—";
  const dir = adjustDir(forecast) === "LONG" ? 1 : -1;
  return formatLivePrice(cur * (1 + dir * Math.abs(forecast.targetPct || 0.6) / 100));
}

function PlanRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between rounded-[7px] bg-[#0e0e10] px-[10px] py-2 text-[12px]">
      <span className="text-[#8c8c95]">{label}</span>
      <span className="font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

function ForecastSvg({ forecast }: { forecast: LiveForecast }) {
  const min = Math.min(...forecast.points, forecast.stop ?? forecast.points[0], forecast.target ?? forecast.points[0]);
  const max = Math.max(...forecast.points, forecast.stop ?? forecast.points[0], forecast.target ?? forecast.points[0]);
  const span = max - min || 1;
  const y = (value: number) => 172 - ((value - min) / span) * 128;
  const actual = forecast.points.map((value, index) => `${index === 0 ? "M" : "L"} ${26 + index * 18} ${y(value).toFixed(1)}`).join(" ");
  const entry = forecast.entry ?? forecast.points[forecast.points.length - 1];
  const target = forecast.target ?? entry;
  const stop = forecast.stop ?? entry;
  const up = target >= entry;
  const coneTop = up ? y(target * 1.003) : y(entry * 1.003);
  const coneBottom = up ? y(entry * 0.997) : y(target * 0.997);
  return (
    <svg viewBox="0 0 360 210" className="h-auto w-full">
      <path d={`M 148 ${coneBottom} C 210 ${coneBottom - 12} 274 ${coneBottom - 6} 326 ${coneBottom - 12} L 326 ${coneTop} C 274 ${coneTop + 8} 210 ${coneTop + 20} 148 ${coneTop + 32} Z`} fill={forecast.color} opacity="0.16" />
      <path d={`M 148 ${y(entry)} C 205 ${y((entry + target) / 2)} 268 ${y(target)} 326 ${y(target)}`} stroke={forecast.color} strokeWidth="3" strokeDasharray="3 5" fill="none" strokeLinecap="round" />
      <path d={`M 26 ${y(target)} H 330`} stroke={forecast.color} strokeDasharray="6 7" opacity="0.6" />
      <path d={`M 26 ${y(stop)} H 330`} stroke="#f2575c" strokeDasharray="6 7" opacity="0.55" />
      <path d={actual} stroke="#ececee" strokeWidth="3" fill="none" strokeLinecap="round" />
      <line x1="216" x2="216" y1="34" y2="184" stroke="#5a5a62" strokeDasharray="3 6" opacity="0.8" />
      <circle cx="216" cy={y(entry)} r="5" fill="#ececee" />
      <circle cx="326" cy={y(target)} r="6" fill={forecast.color} />
      <text x="204" y="28" fill="#8c8c95" fontSize="10" fontFamily="IBM Plex Mono">NOW</text>
      <text x="332" y={y(target) + 4} fill={forecast.color} fontSize="10" fontFamily="IBM Plex Mono">TGT</text>
      <text x="332" y={y(stop) + 4} fill="#f2575c" fontSize="10" fontFamily="IBM Plex Mono">SL</text>
    </svg>
  );
}

function TrackerStat({ label, value, color = "#ececee" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 rounded-[8px] bg-[#0e0e10] px-[11px] py-[9px]">
      <div className="text-[9.5px] uppercase tracking-[0.4px] text-[#5a5a62]">{label}</div>
      <div className="mt-[3px] font-mono text-[14px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function buildForecast(symbol: string, row: LiveTradeRow | null | undefined, ai: StockAnalysisResponse | undefined, generatedAt: number, dirOverride: "LONG" | "SHORT" | null): LiveForecast {
  const entry = row?.price ?? null;
  const rsi = row?.rsi ?? 50;
  const change = row?.changePct ?? 0;
  const relVolume = row?.relativeVolume ?? 1;
  const aiSignal = ai?.signal?.toLowerCase() ?? "";
  const wantsLong = aiSignal.includes("buy") || row?.signal === "Possible turn" || (rsi < 62 && change >= 0);
  const wantsShort = aiSignal.includes("sell") || aiSignal.includes("avoid") || rsi >= 78;
  const direction: LiveForecast["direction"] = !entry ? "WAIT" : dirOverride ?? (wantsShort ? "SHORT" : wantsLong ? "LONG" : "WAIT");
  const rawMove = Math.min(1.8, Math.max(0.35, 0.45 + Math.max(0, relVolume - 1) * 0.25 + Math.abs(change) * 0.12));
  const targetPct = direction === "SHORT" ? -rawMove : direction === "LONG" ? rawMove : 0;
  const target = entry != null ? entry * (1 + targetPct / 100) : null;
  const stop = entry != null ? entry * (1 + (direction === "SHORT" ? 0.55 : direction === "LONG" ? -0.55 : -0.3) / 100) : null;
  const confidence = Math.min(92, Math.max(32, Math.round((ai?.confidence ?? 52) * 0.55 + signalConfidence(row) * 0.45)));
  const windowMin: [number, number] = relVolume >= 2 ? [8, 13] : relVolume >= 1.4 ? [13, 17] : [18, 26];
  const color = direction === "SHORT" ? "#f2575c" : direction === "LONG" ? "#3ecf8e" : "#f5c451";
  const points = buildActualPoints(entry, change, generatedAt);
  const elapsed = Math.min(1, (Date.now() - generatedAt) / (windowMin[1] * 60_000));
  const expectedNow = entry != null && target != null ? entry + (target - entry) * elapsed : null;

  return { symbol, direction, target, stop, entry, targetPct, confidence, windowMin, generatedAt, points, expectedNow, color };
}

function buildTracker(forecast: LiveForecast, row: LiveTradeRow | null | undefined): ForecastTracker {
  const actual = row?.price ?? forecast.entry;
  const elapsedBars = Math.min(forecast.windowMin[1], Math.max(0, Math.round((Date.now() - forecast.generatedAt) / 60_000)));
  const totalBars = forecast.windowMin[1];
  if (forecast.direction === "WAIT" || forecast.entry == null || forecast.target == null || forecast.stop == null || actual == null || forecast.expectedNow == null) {
    return { status: "waiting", label: "WAITING", note: "Need a live price and a clean direction before tracking forecast quality.", matchPct: 0, progressPct: 0, actual, color: "#f5c451", elapsedBars, totalBars };
  }

  const targetDistance = Math.abs(forecast.target - forecast.entry) || 1;
  const miss = Math.abs(actual - forecast.expectedNow);
  const matchPct = Math.max(0, Math.min(100, Math.round(100 - (miss / targetDistance) * 100)));
  const progressRaw = forecast.direction === "LONG"
    ? ((actual - forecast.entry) / (forecast.target - forecast.entry)) * 100
    : ((forecast.entry - actual) / (forecast.entry - forecast.target)) * 100;
  const progressPct = Math.max(0, Math.min(100, Math.round(progressRaw)));
  const invalidated = forecast.direction === "LONG" ? actual <= forecast.stop : actual >= forecast.stop;
  const hit = forecast.direction === "LONG" ? actual >= forecast.target : actual <= forecast.target;

  if (invalidated) {
    return { status: "invalidated", label: "INVALIDATED", note: "Thesis broke: price crossed the invalidation level. AI should revise the plan.", matchPct: 0, progressPct, actual, color: "#f2575c", elapsedBars, totalBars };
  }
  if (hit) {
    return { status: "hit", label: "TARGET HIT", note: "Forecast target was reached. Stop tracking this call and create a fresh read.", matchPct: 100, progressPct: 100, actual, color: "#3ecf8e", elapsedBars, totalBars };
  }
  return { status: "tracking", label: matchPct >= 65 ? "TRACKING" : "DRIFTING", note: matchPct >= 65 ? "Price is still following the forecast path." : "Price is drifting away from the expected path; wait for confirmation before acting.", matchPct, progressPct, actual, color: matchPct >= 65 ? "#3ecf8e" : "#f5c451", elapsedBars, totalBars };
}

function signalConfidence(row: LiveTradeRow | null | undefined) {
  if (!row) return 45;
  const rsi = row.rsi ?? 50;
  const relVolume = row.relativeVolume ?? 1;
  const change = Math.abs(row.changePct ?? 0);
  const rsiScore = rsi > 70 || rsi < 35 ? 70 : rsi >= 45 && rsi <= 62 ? 62 : 50;
  return Math.min(90, Math.round(rsiScore + Math.max(0, relVolume - 1) * 9 + Math.min(10, change * 2)));
}

function buildActualPoints(entry: number | null, change: number, generatedAt: number) {
  const base = entry ?? 100;
  const drift = (change / 100) * base;
  const age = Math.min(10, Math.max(1, Math.round((Date.now() - generatedAt) / 60_000) + 5));
  return Array.from({ length: 11 }, (_, index) => {
    const t = index / 10;
    const wave = Math.sin(index * 1.7) * base * 0.0009;
    return base - drift * (1 - t) - age * base * 0.00018 + wave;
  });
}

// Warm-up ticks so the indicator engine has enough history before real ticks accumulate.
function seedSeries(price: number) {
  return Array.from({ length: 40 }, (_, index) => {
    const wiggle = Math.sin(index * 0.9) * price * 0.0006 + Math.cos(index * 2.3) * price * 0.0003;
    return parseFloat((price + wiggle).toFixed(4));
  });
}

function formatLivePrice(value: number) {
  return formatCurrency(value, "USD");
}

function ensureTradingViewScript() {
  if (window.TradingView) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://s3.tradingview.com/tv.js"]');
  if (existing) {
    return new Promise<void>((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (window.TradingView) resolve();
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView script failed to load"));
    document.head.appendChild(script);
  });
}
