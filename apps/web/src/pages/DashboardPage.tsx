import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { strategyLabels, type StockRecord, type StrategyKey } from "../data/market";
import { loadStocks } from "../lib/api";
import { colorForSymbol, initialFor } from "../lib/symbolColor";
import { useWolfStore } from "../store/useWolfStore";

const strategyOrder: StrategyKey[] = ["capitalized", "stable_dca", "yield", "momentum"];
const tableSize = 10;

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

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const path = buildSparkPath(values, 70, 26);
  return (
    <svg viewBox="0 0 70 26" className={`quote-card-spark spark-line ${positive ? "positive" : "negative"}`} aria-hidden="true">
      <path d={path} fill="none" strokeWidth="2" />
    </svg>
  );
}

export function DashboardPage() {
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const openDetail = useWolfStore((state) => state.openDetail);
  const setWatchlist = useWolfStore((state) => state.setWatchlist);

  const [rows, setRows] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<DashboardPerformance>({
    score: 0,
    confidence: "Balanced",
    recommendation: ""
  });
  const [narrative, setNarrative] = useState<DashboardNarrative>({});

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadStocks({ endpoint: "dashboard", strategy: selectedStrategy, page: 1, limit: tableSize })
      .then((payload) => {
        if (!active) {
          return;
        }
        const nextRows = payload.stocks ?? [];
        setRows(nextRows);
        setWatchlist(nextRows.slice(0, 4));
        setPerformance({
          score: Number(payload.performance?.score ?? 0),
          confidence: payload.performance?.confidence ?? "Balanced",
          recommendation: payload.performance?.recommendation ?? ""
        });
        setNarrative(payload.narrative ?? {});
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setRows([]);
        setPerformance({ score: 0, confidence: "Balanced", recommendation: "" });
        setNarrative({});
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedStrategy, setWatchlist]);

  const quoteRows = rows.slice(0, 4);
  const pickRows = rows.slice(4, 8);
  const topStock = rows[0] ?? null;
  const pulseValues = rows.map((stock) => stock.price);
  const pulsePositive = (topStock?.changePct ?? 0) >= 0;
  const pulsePath = buildSparkPath(pulseValues, 100, 100);

  return (
    <div className="page-layout">
      <div className="detail-pills">
        {strategyOrder.map((strategy) => (
          <Button
            key={strategy}
            variant={strategy === selectedStrategy ? "default" : "secondary"}
            onClick={() => setStrategy(strategy)}
          >
            {strategyLabels[strategy]}
          </Button>
        ))}
      </div>

      <div className="quote-row">
        {quoteRows.length
          ? quoteRows.map((stock) => {
              const color = colorForSymbol(stock.symbol);
              const positive = stock.changePct >= 0;
              return (
                <button key={stock.symbol} className="quote-card shadcn-card" type="button" onClick={() => openDetail(stock.symbol)}>
                  <div className="quote-card-top">
                    <div className="quote-card-id">
                      <span className="quote-icon" style={{ background: color.bg, color: color.fg }}>
                        {initialFor(stock.symbol)}
                      </span>
                      <span className="quote-card-meta">
                        <span className="quote-card-symbol">{stock.symbol}</span>
                        <span className="quote-card-name">{stock.name}</span>
                      </span>
                    </div>
                    <Sparkline values={[stock.price * 0.97, stock.price * (1 - stock.weeklyTrend / 400), stock.price]} positive={positive} />
                  </div>
                  <div className="quote-card-bottom">
                    <div className="quote-card-price">
                      <span className="quote-card-price-label">Price</span>
                      <span className="quote-card-price-value">{formatMoney(stock.price)}</span>
                    </div>
                    <Badge variant={positive ? "default" : "muted"} className={positive ? "badge-positive" : "badge-negative"}>
                      {formatChange(stock.changePct)}
                    </Badge>
                  </div>
                </button>
              );
            })
          : Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="quote-card shadcn-card">
                <div className="empty-state">Loading live quote...</div>
              </div>
            ))}
      </div>

      <div className="widget-grid">
        <Card className="pulse-card">
          <CardHeader>
            <div className="pulse-card-head">
              <div>
                <CardDescription>Strategy pulse</CardDescription>
                <div className="pulse-total-label">{strategyLabels[selectedStrategy]} - live read across {rows.length} names</div>
                <div className="pulse-total-value">{performance.score}% fit</div>
                <div className={`pulse-total-change ${pulsePositive ? "positive" : "negative"}`}>
                  {topStock ? `${topStock.symbol} ${formatChange(topStock.changePct)}` : "Waiting for live data"}
                </div>
              </div>
              <Button variant="secondary" onClick={() => topStock && openDetail(topStock.symbol)}>
                More insight
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <svg viewBox="0 0 100 100" className="pulse-chart" aria-label="Strategy pulse chart">
              <path d={`${pulsePath} L 100 100 L 0 100 Z`} className={`pulse-fill ${pulsePositive ? "positive" : "negative"}`} />
              <path d={pulsePath} className={`pulse-line ${pulsePositive ? "positive" : "negative"}`} fill="none" strokeWidth="2" />
            </svg>
          </CardContent>
        </Card>

        <Card className="balance-card">
          <CardHeader>
            <CardDescription>Performance view</CardDescription>
            <div className="balance-total-label">Confidence</div>
            <div className="balance-total-value">{performance.confidence}</div>
          </CardHeader>
          <CardContent className="stack-gap">
            <div className="balance-row">
              <span className="balance-row-label">Best current match</span>
              <span className="balance-row-value">{topStock?.symbol ?? "N/A"}</span>
            </div>
            <div className="balance-row">
              <span className="balance-row-label">Recommendation</span>
              <span className="balance-row-value">{narrative.recommendation || performance.recommendation || "Loading..."}</span>
            </div>
            <div className="balance-actions">
              <Button variant="secondary" onClick={() => topStock && openDetail(topStock.symbol)}>
                View detail
              </Button>
              <Button onClick={() => topStock && openDetail(topStock.symbol)}>Ask AI</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="widget-grid">
        <Card>
          <CardHeader>
            <CardTitle>Market overview</CardTitle>
            <CardDescription>Live names ranked for {strategyLabels[selectedStrategy]}, straight from the yfinance feed.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="market-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Chart</th>
                  <th>Fit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((stock) => {
                  const color = colorForSymbol(stock.symbol);
                  const positive = stock.changePct >= 0;
                  const score = stock.strategyScores[selectedStrategy] ?? 0;
                  return (
                    <tr key={stock.symbol} className="clickable-row" onClick={() => openDetail(stock.symbol)}>
                      <td>
                        <div className="market-table-symbol">
                          <span className="market-table-symbol-icon" style={{ background: color.bg, color: color.fg }}>
                            {initialFor(stock.symbol)}
                          </span>
                          <span className="market-table-symbol-meta">
                            <strong>{stock.symbol}</strong>
                            <span className="market-table-symbol-name">{stock.sector}</span>
                          </span>
                        </div>
                      </td>
                      <td>{formatMoney(stock.price)}</td>
                      <td className={positive ? "positive" : "negative"}>{formatChange(stock.changePct)}</td>
                      <td>
                        <svg viewBox="0 0 70 26" className={`market-table-spark spark-line ${positive ? "positive" : "negative"}`} aria-hidden="true">
                          <path
                            d={buildSparkPath([stock.price * (1 - stock.weeklyTrend / 100), stock.price], 70, 26)}
                            fill="none"
                            strokeWidth="2"
                          />
                        </svg>
                      </td>
                      <td>{score}/100</td>
                    </tr>
                  );
                })}
                {!loading && !rows.length ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No live stocks matched right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {loading && !rows.length ? <div className="empty-state">Loading live market data...</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top picks</CardTitle>
            <CardDescription>Next best fits after the headline names above.</CardDescription>
          </CardHeader>
          <CardContent className="picks-list">
            {pickRows.length ? (
              pickRows.map((stock) => {
                const color = colorForSymbol(stock.symbol);
                const score = stock.strategyScores[selectedStrategy] ?? 0;
                return (
                  <button key={stock.symbol} className="picks-row" type="button" onClick={() => openDetail(stock.symbol)}>
                    <span className="picks-row-icon" style={{ background: color.bg, color: color.fg }}>
                      {initialFor(stock.symbol)}
                    </span>
                    <span className="picks-row-meta">
                      <span className="picks-row-symbol">{stock.symbol}</span>
                      <span className="picks-row-story">{stock.story}</span>
                    </span>
                    <span className="picks-row-score">{score}/100</span>
                  </button>
                );
              })
            ) : (
              <div className="empty-state">Loading more live names...</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
