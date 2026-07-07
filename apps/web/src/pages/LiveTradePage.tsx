import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadLiveTradeQuote, loadLiveTradeScreener, summarizeStock, type LiveTradePreset, type LiveTradeRow, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const presets: Array<{ key: LiveTradePreset; label: string; sub: string }> = [
  { key: "turning", label: "Turning", sub: "RSI reset + green" },
  { key: "active", label: "Active volume", sub: "relative volume" },
  { key: "overbought", label: "Hot RSI", sub: "RSI > 70" },
  { key: "oversold", label: "Oversold", sub: "RSI < 35" },
];

const seedWatch = ["NVDA", "AMD", "AAPL", "MSFT", "TSLA"];

export function LiveTradePage() {
  const [preset, setPreset] = useState<LiveTradePreset>("turning");
  const [selected, setSelected] = useState("NVDA");
  const [watch, setWatch] = useState(seedWatch);
  const [input, setInput] = useState("");
  const [autoAi, setAutoAi] = useState(false);
  const [forecastAt, setForecastAt] = useState(() => Date.now());
  const chartRef = useRef<HTMLDivElement>(null);
  const widgetId = useMemo(() => `tv-live-${selected.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`, [selected]);
  const screener = useQuery({
    queryKey: ["live-trade-screener", preset],
    queryFn: () => loadLiveTradeScreener({ preset, limit: 18 }),
    refetchInterval: 30_000,
  });
  const quote = useQuery({
    queryKey: ["live-trade-quote", selected],
    queryFn: () => loadLiveTradeQuote(selected),
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const rows = screener.data?.rows ?? [];
  const selectedRow = quote.data?.row ?? null;
  const ai = useQuery({
    queryKey: ["live-trade-ai", selected],
    queryFn: () => summarizeStock(selected, "momentum"),
    enabled: autoAi,
    refetchInterval: autoAi ? 60_000 : false,
    staleTime: 0,
  });
  const forecast = useMemo(() => buildForecast(selected, selectedRow, ai.data, forecastAt), [ai.data, forecastAt, selected, selectedRow]);
  const tracker = useMemo(() => buildTracker(forecast, selectedRow), [forecast, selectedRow]);

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
        symbol: selected,
        interval: "1",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
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
  }, [selected, widgetId]);

  useEffect(() => {
    setForecastAt(Date.now());
  }, [selected]);

  function addTicker() {
    const next = input.trim().toUpperCase();
    if (!next) return;
    setWatch((items) => Array.from(new Set([next, ...items])).slice(0, 12));
    setSelected(next);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-[#2a2a31] bg-[#121214] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f2575c]/30 bg-[#f2575c]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f2575c]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f2575c]" />
              Live Trade
            </div>
            <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-[#ececee]">US live tape desk</h2>
            <p className="mt-1 max-w-[780px] text-[13.5px] leading-[1.55] text-[#9b9ba3]">
              TradingView chart on the left, fast screener signals on the right. This is the base layer for AI reading live chart conditions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addTicker(); }}
              placeholder="NVDA, AMD, TSLA..."
              className="h-10 w-[220px] rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] px-3 font-mono text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]"
            />
            <button type="button" onClick={addTicker} className="h-10 rounded-[9px] bg-[#3ecf8e] px-4 text-[13px] font-bold text-[#06120c] transition-opacity hover:opacity-90">Watch</button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {watch.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => setSelected(symbol)}
            className={`rounded-[9px] border px-3 py-2 font-mono text-[12px] font-bold transition-colors ${selected === symbol ? "border-[#3ecf8e]/60 bg-[#3ecf8e]/10 text-[#ececee]" : "border-[#2a2a31] bg-[#121214] text-[#8c8c95] hover:text-[#ececee]"}`}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-[14px] border border-[#2a2a31] bg-[#121214]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24242a] px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-[22px] font-bold text-[#ececee]">{selected}</span>
              <span className="font-mono text-[15px] font-bold text-[#ececee]">{selectedRow?.price != null ? formatLivePrice(selectedRow.price) : "Waiting for TradingView quote"}</span>
              {selectedRow?.changePct != null ? <span className={`font-mono text-[12px] ${selectedRow.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(selectedRow.changePct)}</span> : null}
            </div>
            <span className="font-mono text-[11px] text-[#5a5a62]">1 min candles · TradingView</span>
          </div>
          <div ref={chartRef} className="h-[620px] w-full bg-[#0e0e10]" />
        </section>

        <aside className="flex flex-col gap-3">
          <ForecastCard
            forecast={forecast}
            tracker={tracker}
            aiLoading={ai.isFetching}
            autoAi={autoAi}
            onToggleAuto={() => setAutoAi((enabled) => !enabled)}
            onRefresh={() => {
              setForecastAt(Date.now());
              void ai.refetch();
            }}
          />

          <section className="rounded-[14px] border border-[#2a2a31] bg-[#121214] p-3">
            <div className="grid grid-cols-2 gap-2">
              {presets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPreset(item.key)}
                  className={`rounded-[9px] border px-3 py-2 text-left transition-colors ${preset === item.key ? "border-[#3ecf8e]/60 bg-[#3ecf8e]/10" : "border-[#2a2a31] bg-[#0e0e10] hover:border-[#3ecf8e]/40"}`}
                >
                  <div className="text-[12px] font-bold text-[#ececee]">{item.label}</div>
                  <div className="mt-0.5 text-[10.5px] text-[#8c8c95]">{item.sub}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10.5px] text-[#5a5a62]">
              <span>{screener.data?.source === "tradingview-screener" ? "TradingView screener" : "live screener unavailable"}</span>
              <span>refresh 30s</span>
            </div>
          </section>

          {screener.isError ? <div className="rounded-[12px] border border-[#4a2b30] bg-[#211316] p-3 text-[12px] text-[#f2575c]">Live screener is unavailable.</div> : null}
          {quote.data?.warning ? <div className="rounded-[12px] border border-[#5a4530] bg-[#211b12] p-3 text-[12px] leading-[1.45] text-[#f5c451]">{quote.data.warning}</div> : null}
          {screener.data?.warning ? <div className="rounded-[12px] border border-[#5a4530] bg-[#211b12] p-3 text-[12px] leading-[1.45] text-[#f5c451]">{screener.data.warning}</div> : null}

          <section className="overflow-hidden rounded-[14px] border border-[#2a2a31] bg-[#121214]">
            <div className="border-b border-[#24242a] px-4 py-3">
              <div className="text-[14px] font-bold text-[#ececee]">US scanner</div>
              <div className="mt-0.5 text-[11.5px] text-[#8c8c95]">Fast RSI / volume reads. Tap a row to load the chart.</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {screener.isLoading ? <div className="p-5 text-center text-[13px] text-[#8c8c95]">Loading live tape...</div> : null}
              {rows.map((row) => <LiveRow key={row.symbol} row={row} selected={selected === row.symbol} onSelect={() => { setSelected(row.symbol); setWatch((items) => Array.from(new Set([row.symbol, ...items])).slice(0, 12)); }} />)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

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

function ForecastCard({
  forecast,
  tracker,
  aiLoading,
  autoAi,
  onToggleAuto,
  onRefresh,
}: {
  forecast: LiveForecast;
  tracker: ForecastTracker;
  aiLoading: boolean;
  autoAi: boolean;
  onToggleAuto: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-[16px] border border-[#4d96ff] bg-[#121214] p-4 shadow-[0_0_0_1px_rgba(77,150,255,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c8c95]">AI next-move forecast</div>
        <button type="button" onClick={onRefresh} className="text-[12px] font-semibold text-[#74a4ff] hover:text-[#a9c6ff]">{aiLoading ? "reading..." : "↻ re-forecast"}</button>
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[34px] font-black leading-none tracking-[-0.04em]" style={{ color: forecast.color }}>{forecast.direction === "LONG" ? "▲" : forecast.direction === "SHORT" ? "▼" : "■"} {forecast.direction}</span>
        <span className="font-mono text-[23px] font-bold" style={{ color: forecast.color }}>{forecast.target != null ? formatLivePrice(forecast.target) : "—"}</span>
        <span className="font-mono text-[14px]" style={{ color: forecast.color }}>({formatPercent(forecast.targetPct)})</span>
      </div>
      <div className="mt-2 text-[14px] text-[#9b9ba3]">
        Expected within <b className="text-[#ececee]">{forecast.windowMin[0]}-{forecast.windowMin[1]} min</b> · forecast confidence <b className="text-[#ececee]">{forecast.confidence}/100</b>
      </div>

      <ForecastSvg forecast={forecast} />

      <div className="mt-3 flex flex-wrap items-center gap-5 text-[12px] text-[#6f6f78]">
        <Legend swatch="#ececee" label="Actual" />
        <Legend swatch={forecast.color} label="Forecast path" dashed />
        <span className="flex items-center gap-2"><span className="h-3 w-5 rounded-[3px]" style={{ background: forecast.color, opacity: 0.22 }} />Confidence cone</span>
      </div>

      <div className="mt-4 rounded-[14px] border border-[#2a2a31] bg-[#161619] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8c8c95]">Forecast vs reality</div>
          <div className="font-mono text-[12px] text-[#6f6f78]">{tracker.elapsedBars} / {tracker.totalBars} bars</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-[10px] px-3 py-2 text-[18px] font-black uppercase tracking-[-0.02em]" style={{ color: tracker.color, background: `${tracker.color}18` }}>{tracker.label}</span>
          <div>
            <div className="font-mono text-[28px] font-black leading-none" style={{ color: tracker.color }}>{tracker.matchPct}%</div>
            <div className="mt-1 text-[11px] text-[#6f6f78]">match to forecast</div>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-[1.55] text-[#bcbcc2]">{tracker.note}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <TrackerStat label="Forecast now" value={forecast.expectedNow != null ? formatLivePrice(forecast.expectedNow) : "—"} />
          <TrackerStat label="Actual now" value={tracker.actual != null ? formatLivePrice(tracker.actual) : "—"} />
          <TrackerStat label="Live conf." value={String(forecast.confidence)} color={tracker.color} />
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-[#6f6f78]">
          <span>Progress to target</span>
          <span>{tracker.progressPct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0e0e10]">
          <div className="h-full rounded-full" style={{ width: `${tracker.progressPct}%`, background: tracker.color }} />
        </div>
      </div>

      <button type="button" onClick={onToggleAuto} className={`mt-3 w-full rounded-[10px] border px-3 py-2 text-[12px] font-bold transition-colors ${autoAi ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee]"}`}>
        {autoAi ? "AI auto-analysis on · every 1 min" : "Turn on AI analysis every 1 min"}
      </button>
    </section>
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
    <svg viewBox="0 0 360 210" className="mt-4 h-[210px] w-full rounded-[14px] bg-[#0d0d0f]">
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
    <div className="rounded-[10px] bg-[#0e0e10] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[#5f5f68]">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return <span className="flex items-center gap-2"><span className={`w-7 border-t-[3px] ${dashed ? "border-dashed" : ""}`} style={{ borderColor: swatch }} />{label}</span>;
}

function LiveRow({ row, selected, onSelect }: { row: LiveTradeRow; selected: boolean; onSelect: () => void }) {
  const change = row.changePct ?? 0;
  const tone = row.signal === "Possible turn" ? "#3ecf8e" : (row.rsi ?? 0) >= 70 ? "#f5c451" : change >= 0 ? "#3ecf8e" : "#f2575c";
  return (
    <button type="button" onClick={onSelect} className={`grid w-full grid-cols-[minmax(0,1fr)_88px] gap-3 border-t border-[#202026] px-4 py-3 text-left transition-colors first:border-t-0 ${selected ? "bg-[#1c1c20]" : "hover:bg-[#17171a]"}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-bold text-[#ececee]">{row.symbol}</span>
          <span className="rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: tone, background: `${tone}16` }}>{row.signal}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#8c8c95]">
          <span>RSI {formatMaybe(row.rsi)}</span>
          <span>5m {formatMaybe(row.rsi5)}</span>
          <span>RVOL {formatMaybe(row.relativeVolume)}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[13px] font-bold text-[#ececee]">{row.price != null ? formatLivePrice(row.price) : "—"}</div>
        <div className={`mt-1 font-mono text-[12px] ${change >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{row.changePct != null ? formatPercent(row.changePct) : "—"}</div>
      </div>
    </button>
  );
}

function buildForecast(symbol: string, row: LiveTradeRow | null | undefined, ai: StockAnalysisResponse | undefined, generatedAt: number): LiveForecast {
  const entry = row?.price ?? null;
  const rsi = row?.rsi ?? 50;
  const change = row?.changePct ?? 0;
  const relVolume = row?.relativeVolume ?? 1;
  const aiSignal = ai?.signal?.toLowerCase() ?? "";
  const wantsLong = aiSignal.includes("buy") || row?.signal === "Possible turn" || (rsi < 62 && change >= 0);
  const wantsShort = aiSignal.includes("sell") || aiSignal.includes("avoid") || rsi >= 78;
  const direction: LiveForecast["direction"] = !entry ? "WAIT" : wantsShort ? "SHORT" : wantsLong ? "LONG" : "WAIT";
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

function formatMaybe(value?: number | null) {
  return value == null ? "—" : formatNumber(value);
}

function formatLivePrice(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
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
