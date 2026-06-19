import { useEffect, useId, useState } from "react";
import { strategyLabels, type StockRecord, type StrategyKey } from "../data/market";
import { loadStocks } from "../lib/api";
import { colorForSymbol, initialFor } from "../lib/symbolColor";
import { negative, panel, panelMuted, panelTint, pillActive, pillInactive, positive } from "../lib/ui";
import { useWolfStore } from "../store/useWolfStore";

const strategyOrder: StrategyKey[] = ["capitalized", "stable_dca", "yield", "momentum"];
const pageSize = 8;

type DashboardNarrative = {
  title?: string;
  summary?: string;
  positive?: string;
  negative?: string;
  recommendation?: string;
};

type DashboardPerformance = {
  score: number;
  confidence: string;
  recommendation: string;
};

function formatMoney(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatChange(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.00%";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildSparkPath(values: number[], width: number, height: number) {
  if (!values.length) {
    return `M 0 ${height}`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.0001);
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildSmoothSparkPath(values: number[], width: number, height: number) {
  if (values.length < 3) {
    return buildSparkPath(values, width, height);
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.0001);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: index * step,
    y: height - ((value - min) / range) * (height - 10) - 5
  }));

  const segments = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const midpointX = (point.x + next.x) / 2;
    const midpointY = (point.y + next.y) / 2;
    segments.push(`Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${midpointX.toFixed(2)} ${midpointY.toFixed(2)}`);
  }
  const last = points[points.length - 1];
  segments.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
  return segments.join(" ");
}

function Sparkline({ values, positive: isPositive }: { values?: number[]; positive: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  if (!values?.length) {
    return <span className="h-[36px] w-[92px] flex-none" aria-hidden="true" />;
  }
  const path = buildSmoothSparkPath(values, 92, 36);
  const stroke = isPositive ? "#16a34a" : "#dc2626";
  return (
    <svg viewBox="0 0 92 36" className="h-[36px] w-[92px] flex-none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="72%" stopColor={stroke} stopOpacity="0.05" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 92 36 L 0 36 Z`} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function lastPoint(values: number[], width: number, height: number) {
  if (!values.length) {
    return { x: width, y: height };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.0001);
  const last = values[values.length - 1];
  return { x: width, y: height - ((last - min) / range) * (height - 6) - 3 };
}

function axisLabels(rows: StockRecord[], count: number) {
  if (!rows.length) {
    return [];
  }
  const step = Math.max(1, Math.floor((rows.length - 1) / Math.max(count - 1, 1)));
  const labels: { symbol: string; index: number }[] = [];
  for (let index = 0; index < rows.length; index += step) {
    labels.push({ symbol: rows[index].symbol, index });
  }
  if (labels[labels.length - 1]?.index !== rows.length - 1) {
    labels.push({ symbol: rows[rows.length - 1].symbol, index: rows.length - 1 });
  }
  return labels;
}

export function DashboardPage() {
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const openDetail = useWolfStore((state) => state.openDetail);
  const setWatchlist = useWolfStore((state) => state.setWatchlist);

  const [rows, setRows] = useState<StockRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<DashboardPerformance>({
    score: 0,
    confidence: "Balanced",
    recommendation: ""
  });
  const [narrative, setNarrative] = useState<DashboardNarrative>({});

  useEffect(() => {
    setPage(1);
  }, [selectedStrategy]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadStocks({ endpoint: "dashboard", strategy: selectedStrategy, page, limit: pageSize })
      .then((payload) => {
        if (!active) return;
        const nextRows = payload.stocks ?? [];
        setRows(nextRows);
        setTotalPages(payload.totalPages ?? 1);
        if (page === 1) {
          setWatchlist(nextRows.slice(0, 4));
        }
        setPerformance({
          score: Number(payload.performance?.score ?? 0),
          confidence: payload.performance?.confidence ?? "Balanced",
          recommendation: payload.performance?.recommendation ?? ""
        });
        setNarrative(payload.narrative ?? {});
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setTotalPages(1);
        setPerformance({ score: 0, confidence: "Balanced", recommendation: "" });
        setNarrative({});
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStrategy, page, setWatchlist]);

  const quoteRows = page === 1 ? rows.slice(0, 4) : [];
  const tableRows = page === 1 ? rows.slice(4) : rows;
  const topStock = rows[0] ?? null;
  const pulseValues = rows.map((stock) => stock.price);
  const pulsePositive = (topStock?.changePct ?? 0) >= 0;
  const pulsePath = buildSparkPath(pulseValues, 100, 100);
  const liveBasketValue = rows.reduce((sum, stock) => sum + (stock.price ?? 0), 0);
  const liveBasketTrend = rows.length ? rows.reduce((sum, stock) => sum + (stock.changePct ?? 0), 0) / rows.length : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${panelTint} flex min-h-[108px] items-center justify-between gap-4 overflow-hidden`}>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-500">Available balance</div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="text-[32px] font-black leading-none text-slate-900">{formatMoney(liveBasketValue)}</div>
              <div className={`text-sm font-semibold ${liveBasketTrend >= 0 ? positive : negative}`}>
                {formatChange(liveBasketTrend)} this week
              </div>
            </div>
          </div>
          <div className="flex-none">
            <svg viewBox="0 0 100 36" className="h-[54px] w-[240px]" aria-hidden="true" preserveAspectRatio="none">
              <path
                d={buildSparkPath(pulseValues.length ? pulseValues : [0, 1], 100, 36)}
                fill="none"
                stroke="#7c5cfc"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {strategyOrder.map((strategy) => (
          <button
            key={strategy}
            type="button"
            onClick={() => setStrategy(strategy)}
            className={strategy === selectedStrategy ? pillActive : pillInactive}
          >
            {strategyLabels[strategy]}
          </button>
        ))}
      </div>

      {quoteRows.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quoteRows.map((stock) => {
            const color = colorForSymbol(stock.symbol);
            const isPositive = stock.changePct >= 0;
            return (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => openDetail(stock.symbol)}
                className={`${panel} min-h-[152px] rounded-[18px] border-white/80 bg-white/92 text-left shadow-[0_12px_30px_rgba(91,47,209,0.07)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(91,47,209,0.11)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[18px] font-black shadow-[0_8px_20px_rgba(0,0,0,0.07)]"
                      style={{ background: color.bg, color: color.fg }}
                    >
                      {initialFor(stock.symbol)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[17px] leading-none font-black text-slate-900">{stock.symbol}</span>
                      <span className="mt-1 truncate text-[11px] font-medium text-slate-400">{stock.name}</span>
                    </span>
                  </div>
                  <Sparkline values={stock.sparkline} positive={isPositive} />
                </div>
                <div className="mt-6 flex items-end justify-between gap-3">
                  <div className="flex flex-col">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Price</div>
                    <div className="mt-1.5 text-[25px] font-black leading-none text-slate-900">{formatMoney(stock.price)}</div>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold shadow-sm ${
                      isPositive
                        ? "border border-emerald-100 bg-emerald-50/80 text-emerald-600"
                        : "border border-rose-100 bg-rose-50/80 text-rose-600"
                    }`}
                  >
                    {formatChange(stock.changePct)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_0.75fr]">
        <div className={panelTint}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Strategy pulse</div>
              <div className="text-xs text-slate-400">
                {strategyLabels[selectedStrategy]} - live read across {rows.length} names
              </div>
              <div className="mt-1 text-3xl font-extrabold text-slate-900">{performance.score}% fit</div>
              <div className={`text-sm font-semibold ${pulsePositive ? positive : negative}`}>
                {topStock ? `${topStock.symbol} ${formatChange(topStock.changePct)}` : "Waiting for live data"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => topStock && openDetail(topStock.symbol)}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-600 shadow-sm hover:bg-slate-50"
            >
              More insight
            </button>
          </div>
          <div className="relative mt-4">
            <svg viewBox="0 0 100 100" className="h-36 w-full overflow-visible" aria-label="Strategy pulse chart" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#7c5cfc" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${pulsePath} L 100 100 L 0 100 Z`} fill="url(#pulseFill)" />
              <path d={pulsePath} fill="none" stroke="#7c5cfc" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              {topStock ? (
                <line
                  x1={lastPoint(pulseValues, 100, 100).x}
                  y1={lastPoint(pulseValues, 100, 100).y}
                  x2={lastPoint(pulseValues, 100, 100).x}
                  y2="100"
                  stroke="#7c5cfc"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {topStock ? (
              <div
                className="absolute -translate-x-full -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg"
                style={{ left: `${lastPoint(pulseValues, 100, 100).x}%`, top: `${lastPoint(pulseValues, 100, 100).y}%` }}
              >
                {topStock.symbol} {formatMoney(topStock.price)}
              </div>
            ) : null}
            <div className="mt-2 flex justify-between text-[10px] text-slate-400">
              {axisLabels(rows, 6).map((label) => (
                <span key={label.index}>{label.symbol}</span>
              ))}
            </div>
          </div>
        </div>

        <div className={panelMuted}>
          <div className="text-sm text-slate-500">Performance view</div>
          <div className="text-xs text-slate-400">Confidence</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{performance.confidence}</div>
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3 shadow-sm">
              <span className="text-xs text-slate-400">Best current match</span>
              <span className="text-sm font-bold text-slate-900">{topStock?.symbol ?? "N/A"}</span>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <div className="text-xs text-slate-400">Recommendation</div>
              <div className="text-sm font-bold text-slate-900">
                {narrative.recommendation || performance.recommendation || "Loading..."}
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => topStock && openDetail(topStock.symbol)}
                className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-100"
              >
                View detail
              </button>
              <button
                type="button"
                onClick={() => topStock && openDetail(topStock.symbol)}
                className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                Ask AI
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-base font-bold text-slate-900">Market overview</div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-600 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <div className="mb-3 text-sm text-slate-400">Live names ranked for {strategyLabels[selectedStrategy]}, straight from the yfinance feed.</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="border-b border-slate-100 pb-2">Symbol</th>
              <th className="border-b border-slate-100 pb-2">Price</th>
              <th className="border-b border-slate-100 pb-2">Change</th>
              <th className="border-b border-slate-100 pb-2">Chart</th>
              <th className="border-b border-slate-100 pb-2">Fit</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((stock) => {
              const color = colorForSymbol(stock.symbol);
              const isPositive = stock.changePct >= 0;
              const score = stock.strategyScores[selectedStrategy] ?? 0;
              return (
                <tr key={stock.symbol} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(stock.symbol)}>
                  <td className="border-b border-slate-100 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-extrabold"
                        style={{ background: color.bg, color: color.fg }}
                      >
                        {initialFor(stock.symbol)}
                      </span>
                      <span className="flex flex-col">
                        <strong className="text-sm text-slate-900">{stock.symbol}</strong>
                        <span className="text-xs text-slate-400">{stock.sector}</span>
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 py-2.5 text-sm text-slate-900">{formatMoney(stock.price)}</td>
                  <td className={`border-b border-slate-100 py-2.5 text-sm font-semibold ${isPositive ? positive : negative}`}>
                    {formatChange(stock.changePct)}
                  </td>
                  <td className="border-b border-slate-100 py-2.5">
                    <Sparkline values={stock.sparkline} positive={isPositive} />
                  </td>
                  <td className="border-b border-slate-100 py-2.5 text-sm text-slate-900">{score}/100</td>
                </tr>
              );
            })}
            {!loading && !tableRows.length ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                  No live stocks matched right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {loading && !rows.length ? <div className="py-6 text-center text-sm text-slate-400">Loading live market data...</div> : null}
      </div>
    </div>
  );
}
