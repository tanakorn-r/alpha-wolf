import { useEffect, useState } from "react";
import { strategyLabels, type StockRecord, type StrategyKey } from "../data/market";
import { loadStocks } from "../lib/api";
import { colorForSymbol, initialFor } from "../lib/symbolColor";
import { badgeNegative, badgePositive, negative, panel, pillActive, pillInactive, positive } from "../lib/ui";
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

function Sparkline({ values, positive: isPositive }: { values: number[]; positive: boolean }) {
  const path = buildSparkPath(values, 70, 26);
  return (
    <svg viewBox="0 0 70 26" className="h-[26px] w-[70px] flex-none" aria-hidden="true">
      <path d={path} fill="none" stroke={isPositive ? "#16a34a" : "#dc2626"} strokeWidth="2" />
    </svg>
  );
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

  return (
    <div className="flex flex-col gap-5">
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quoteRows.map((stock) => {
            const color = colorForSymbol(stock.symbol);
            const isPositive = stock.changePct >= 0;
            return (
              <button key={stock.symbol} type="button" onClick={() => openDetail(stock.symbol)} className={`${panel} text-left`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-extrabold"
                      style={{ background: color.bg, color: color.fg }}
                    >
                      {initialFor(stock.symbol)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold text-slate-900">{stock.symbol}</span>
                      <span className="truncate text-xs text-slate-400">{stock.name}</span>
                    </span>
                  </div>
                  <Sparkline values={[stock.price * 0.97, stock.price * (1 - stock.weeklyTrend / 400), stock.price]} positive={isPositive} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Price</div>
                    <div className="text-lg font-extrabold text-slate-900">{formatMoney(stock.price)}</div>
                  </div>
                  <span className={isPositive ? badgePositive : badgeNegative}>{formatChange(stock.changePct)}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_0.85fr]">
        <div className={panel}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">Strategy pulse</div>
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
              className="rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-600 hover:bg-violet-100"
            >
              More insight
            </button>
          </div>
          <svg viewBox="0 0 100 100" className="mt-4 h-48 w-full" aria-label="Strategy pulse chart">
            <path d={`${pulsePath} L 100 100 L 0 100 Z`} fill={pulsePositive ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)"} />
            <path d={pulsePath} fill="none" stroke={pulsePositive ? "#16a34a" : "#dc2626"} strokeWidth="2" />
          </svg>
        </div>

        <div className={panel}>
          <div className="text-sm text-slate-400">Performance view</div>
          <div className="text-xs text-slate-400">Confidence</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{performance.confidence}</div>
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2.5">
              <span className="text-xs text-slate-400">Best current match</span>
              <span className="text-sm font-bold text-slate-900">{topStock?.symbol ?? "N/A"}</span>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-2.5">
              <div className="text-xs text-slate-400">Recommendation</div>
              <div className="text-sm font-bold text-slate-900">
                {narrative.recommendation || performance.recommendation || "Loading..."}
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => topStock && openDetail(topStock.symbol)}
                className="flex-1 rounded-xl bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-600 hover:bg-violet-100"
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
              <th className="border-b border-violet-50 pb-2">Symbol</th>
              <th className="border-b border-violet-50 pb-2">Price</th>
              <th className="border-b border-violet-50 pb-2">Change</th>
              <th className="border-b border-violet-50 pb-2">Chart</th>
              <th className="border-b border-violet-50 pb-2">Fit</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((stock) => {
              const color = colorForSymbol(stock.symbol);
              const isPositive = stock.changePct >= 0;
              const score = stock.strategyScores[selectedStrategy] ?? 0;
              return (
                <tr key={stock.symbol} className="cursor-pointer hover:bg-violet-50" onClick={() => openDetail(stock.symbol)}>
                  <td className="border-b border-violet-50 py-2.5">
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
                  <td className="border-b border-violet-50 py-2.5 text-sm text-slate-900">{formatMoney(stock.price)}</td>
                  <td className={`border-b border-violet-50 py-2.5 text-sm font-semibold ${isPositive ? positive : negative}`}>
                    {formatChange(stock.changePct)}
                  </td>
                  <td className="border-b border-violet-50 py-2.5">
                    <Sparkline values={[stock.price * (1 - stock.weeklyTrend / 100), stock.price]} positive={isPositive} />
                  </td>
                  <td className="border-b border-violet-50 py-2.5 text-sm text-slate-900">{score}/100</td>
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
