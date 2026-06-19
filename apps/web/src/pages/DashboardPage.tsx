import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { strategyLabels, type StockRecord, type StrategyKey } from "../data/market";
import { loadStocks } from "../lib/api";
import { useWolfStore } from "../store/useWolfStore";

const strategyOrder: StrategyKey[] = ["capitalized", "stable_dca", "yield", "momentum"];
const pageSize = 6;

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

export function DashboardPage() {
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const openDetail = useWolfStore((state) => state.openDetail);
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const [rows, setRows] = useState<StockRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [performance, setPerformance] = useState<DashboardPerformance>({
    score: 0,
    confidence: "Balanced",
    recommendation: ""
  });
  const [narrative, setNarrative] = useState<DashboardNarrative>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPage(1);
    setRows([]);
    setHasMore(true);
  }, [selectedStrategy, deferredSearch]);

  useEffect(() => {
    let active = true;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    loadStocks({
      endpoint: "dashboard",
      strategy: selectedStrategy,
      q: deferredSearch || undefined,
      page,
      limit: pageSize
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        const nextRows = payload.stocks ?? [];
        const nextPerformance = payload.performance ?? {};
        const nextNarrative = payload.narrative ?? {};
        const nextTotalPages = payload.totalPages ?? 1;

        setRows((current) => (page === 1 ? nextRows : [...current, ...nextRows]));
        setTotalPages(nextTotalPages);
        setHasMore(page < nextTotalPages && nextRows.length > 0);
        setPerformance({
          score: Number(nextPerformance.score ?? 0),
          confidence: nextPerformance.confidence ?? "Balanced",
          recommendation: nextPerformance.recommendation ?? ""
        });
        setNarrative(nextNarrative);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setRows(page === 1 ? [] : rows);
        setTotalPages(1);
        setHasMore(false);
        setPerformance({ score: 0, confidence: "Balanced", recommendation: "" });
        setNarrative({});
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
      });

    return () => {
      active = false;
    };
  }, [deferredSearch, page, selectedStrategy]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loading || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          setPage((current) => current + 1);
        }
      },
      { rootMargin: "160px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  const topStock = rows[0] ?? null;
  const activeNow = [...rows].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 4);
  const liveLabel = rows.length ? `${rows.length} live names` : "Waiting for live data";

  const heroMetrics = [
    {
      label: "Best fit",
      value: topStock?.symbol ?? "N/A",
      detail: topStock ? `${topStock.name} · ${topStock.sector}` : "No live matches yet"
    },
    {
      label: "Price",
      value: formatMoney(topStock?.price),
      detail: topStock ? `${formatChange(topStock.changePct)} today` : "Pulling live quote"
    },
    {
      label: "Strategy",
      value: strategyLabels[selectedStrategy],
      detail: `${performance.score}% fit`
    }
  ];

  const activePeak = Math.max(1, ...activeNow.map((stock) => Math.abs(stock.changePct ?? 0)));

  return (
    <div className="page-layout">
      <section className="hero-grid">
        <Card className="hero-card">
          <CardHeader>
            <Badge>Dashboard</Badge>
            <CardTitle className="hero-title">Live stocks ranked for the strategy you picked.</CardTitle>
            <CardDescription className="hero-description">
              Search by symbol or company, then review real price, trend, and fit from the yfinance feed.
            </CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            <div className="detail-pills">
              {strategyOrder.map((strategy) => {
                const active = strategy === selectedStrategy;
                return (
                  <Button
                    key={strategy}
                    variant={active ? "default" : "secondary"}
                    onClick={() => setStrategy(strategy)}
                  >
                    {strategyLabels[strategy]}
                  </Button>
                );
              })}
            </div>

            <div className="summary-grid">
              {heroMetrics.map((item) => (
                <div key={item.label} className="summary-card">
                  <div className="summary-label">{item.label}</div>
                  <div className="summary-value">{item.value}</div>
                  <div className="summary-copy">{item.detail}</div>
                </div>
              ))}
            </div>

            <div className="performance-stack">
              <div className="performance-card performance-positive">
                <div className="performance-label">{narrative.title ?? "Fantastic view"}</div>
                <div className="performance-copy">{narrative.positive ?? "Loading live strategy insight."}</div>
              </div>
              <div className="performance-card performance-negative">
                <div className="performance-label">Bad potential performance</div>
                <div className="performance-copy">{narrative.negative ?? "Loading downside view."}</div>
              </div>
              <div className="performance-card performance-recommendation">
                <div className="performance-label">Recommendation</div>
                <div className="performance-copy">{narrative.recommendation || performance.recommendation || "Waiting for live recommendation."}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hero-side-card">
          <CardHeader>
            <CardDescription>Performance view</CardDescription>
            <div className="card-headline">
              <div className="card-amount">{performance.score}% fit</div>
              <Badge variant="muted">{performance.confidence}</Badge>
            </div>
          </CardHeader>
          <CardContent className="score-shell">
            <div className="active-now-panel">
              <div className="active-now-header">
                <div>
                  <div className="score-note-label">Most active now</div>
                  <div className="active-now-title">Names moving enough to trigger FOMO.</div>
                </div>
                <div className="active-now-chip">Live</div>
              </div>

              <div className="active-now-rows">
                {activeNow.length ? (
                  activeNow.map((stock) => {
                    const score = stock.strategyScores[selectedStrategy] ?? 0;
                    const width = Math.max(14, (Math.abs(stock.changePct ?? 0) / activePeak) * 100);
                    return (
                      <button key={stock.symbol} className="active-now-row" type="button" onClick={() => openDetail(stock.symbol)}>
                        <div className="active-now-main">
                          <strong>{stock.symbol}</strong>
                          <span>{stock.sector}</span>
                        </div>
                        <div className={`active-now-change ${stock.changePct >= 0 ? "positive" : "negative"}`}>
                          {formatChange(stock.changePct)}
                        </div>
                        <div className="active-now-meter">
                          <span style={{ width: `${width}%` }} className={`active-now-fill ${stock.changePct >= 0 ? "positive" : "negative"}`} />
                        </div>
                        <div className="active-now-score">{score}/100</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">Loading active names...</div>
                )}
              </div>

              <div className="active-now-chart">
                <svg viewBox="0 0 100 34" aria-label="Active stock change chart">
                  {activeNow.map((stock, index) => {
                    const width = 12;
                    const gap = 8;
                    const x = index * (width + gap) + 4;
                    const height = Math.max(6, (Math.abs(stock.changePct ?? 0) / activePeak) * 26);
                    const y = 30 - height;
                    return (
                      <rect
                        key={stock.symbol}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx="4"
                        className={stock.changePct >= 0 ? "positive" : "negative"}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>

            <div className="score-ring" style={{ ["--score" as string]: performance.score }}>
              <div className="score-ring-inner">
                <div className="score-ring-value">{performance.score}%</div>
                <div className="score-ring-label">strategy fit</div>
              </div>
            </div>

            <div className="score-notes">
              <div className="score-note">
                <span className="score-note-label">Live watchlist</span>
                <span className="score-note-value">{liveLabel}</span>
              </div>
              <div className="score-note">
                <span className="score-note-label">Total pages</span>
                <span className="score-note-value">{totalPages}</span>
              </div>
              <div className="score-note">
                <span className="score-note-label">Best current match</span>
                <span className="score-note-value">{topStock?.symbol ?? "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="content-grid">
        <Card className="list-card">
          <CardHeader>
            <CardTitle>Interesting stocks</CardTitle>
            <CardDescription>Sorted and paginated by real market data, not demo rows.</CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            {rows.map((stock) => {
              const score = stock.strategyScores[selectedStrategy] ?? 0;
              return (
                <article key={stock.symbol} className="stock-row clickable-row" onClick={() => openDetail(stock.symbol)}>
                  <div className="stock-main">
                    <div className="stock-symbol">{stock.symbol}</div>
                    <div className="stock-name">{stock.name}</div>
                    <div className="stock-meta">
                      <Badge variant="muted">{stock.sector}</Badge>
                      {stock.indexes.slice(0, 3).map((item) => (
                        <span key={item} className="stock-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                    <div className="stock-story">{stock.story}</div>
                  </div>

                  <div className="stock-side">
                    <div className="stock-price">{formatMoney(stock.price)}</div>
                    <div className={`stock-change ${stock.changePct >= 0 ? "positive" : "negative"}`}>
                      {formatChange(stock.changePct)}
                    </div>
                    <div className="stock-score">
                      <div className="stock-score-head">
                        <span>Strategy score</span>
                        <span>{score}/100</span>
                      </div>
                      <Progress value={score} />
                    </div>
                  </div>
                </article>
              );
            })}

            {loading && rows.length === 0 ? (
              <div className="empty-state">Loading live market data from yfinance...</div>
            ) : null}

            {!loading && rows.length === 0 ? (
              <div className="empty-state">No live stocks matched your search.</div>
            ) : null}

            <div ref={loadMoreRef} className="load-more-sentinel">
              {loadingMore ? "Loading more live rows..." : hasMore ? "Scroll for more" : "End of live results"}
            </div>
          </CardContent>
        </Card>

        <Card className="insight-card">
          <CardHeader>
            <CardTitle>Performance view</CardTitle>
            <CardDescription>Quick read on the upside, downside, and current recommendation.</CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            <div className="performance-card performance-positive">
              <div className="performance-label">Fantastic view</div>
              <div className="performance-copy">
                {narrative.positive ?? "The live feed will populate the best upside case for your selected strategy."}
              </div>
            </div>

            <div className="performance-card performance-negative">
              <div className="performance-label">Bad potential performance</div>
              <div className="performance-copy">
                {narrative.negative ?? "The live feed will show where the strategy can still break down."}
              </div>
            </div>

            <div className="performance-card performance-recommendation">
              <div className="performance-label">Recommendation</div>
              <div className="performance-copy">
                {narrative.recommendation || performance.recommendation || "Best current live match will appear here."}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
