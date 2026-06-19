import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { strategyLabels, type StockRecord, type StrategyKey } from "../data/market";
import { loadStocks } from "../lib/api";
import { radarDirections, radarIndexes, radarSorts } from "../theme";
import { useWolfStore } from "../store/useWolfStore";

const pageSize = 10;

type RadarNarrative = {
  title?: string;
  summary?: string;
  positive?: string;
  negative?: string;
  recommendation?: string;
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

export function RadarPage() {
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const openDetail = useWolfStore((state) => state.openDetail);
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const radarIndex = useWolfStore((state) => state.radarIndex);
  const radarSort = useWolfStore((state) => state.radarSort);
  const radarDirection = useWolfStore((state) => state.radarDirection);
  const setRadarIndex = useWolfStore((state) => state.setRadarIndex);
  const setRadarSort = useWolfStore((state) => state.setRadarSort);
  const setRadarDirection = useWolfStore((state) => state.setRadarDirection);
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const [rows, setRows] = useState<StockRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [narrative, setNarrative] = useState<RadarNarrative>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPage(1);
    setRows([]);
    setHasMore(true);
  }, [selectedStrategy, deferredSearch, radarIndex, radarSort, radarDirection]);

  useEffect(() => {
    let active = true;

    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    loadStocks({
      endpoint: "radar",
      strategy: selectedStrategy,
      q: deferredSearch || undefined,
      index: radarIndex,
      sort: radarSort,
      direction: radarDirection,
      page,
      limit: pageSize
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        const nextRows = payload.matches ?? payload.stocks ?? [];
        const nextTotalPages = payload.totalPages ?? 1;

        setRows((current) => (page === 1 ? nextRows : [...current, ...nextRows]));
        setTotalPages(nextTotalPages);
        setHasMore(page < nextTotalPages && nextRows.length > 0);
        setNarrative((payload.narrative ?? {}) as RadarNarrative);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setRows(page === 1 ? [] : rows);
        setTotalPages(1);
        setHasMore(false);
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
  }, [deferredSearch, page, radarDirection, radarIndex, radarSort, selectedStrategy]);

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

  const topMatch = rows[0] ?? null;
  const strategyKey = selectedStrategy;

  const radarPoints = rows.map((stock, index) => {
    const score = stock.strategyScores[strategyKey] ?? 0;
    const angle = rows.length ? (index / rows.length) * Math.PI * 2 - Math.PI / 2 : 0;
    const radius = 52 + (100 - score) * 1.9;
    const x = 320 + Math.cos(angle) * radius;
    const y = 320 + Math.sin(angle) * radius;
    return {
      stock,
      score,
      x,
      y
    };
  });

  return (
    <div className="page-layout">
      <section className="radar-grid">
        <Card className="radar-card">
          <CardHeader>
            <Badge>Radar</Badge>
            <CardTitle className="hero-title">Find the right name for your strategy.</CardTitle>
            <CardDescription className="hero-description">
              Filter by index, sort by quant score, and inspect the live radar map before you pick a stock.
            </CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            <div className="detail-pills">
              {(["capitalized", "stable_dca", "yield", "momentum"] as StrategyKey[]).map((strategy) => {
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

            <div className="filter-strip">
              <div className="filter-group">
                <span className="filter-label">Index</span>
                <div className="detail-pills">
                  {radarIndexes.map((item) => (
                    <Button
                      key={item.key}
                      variant={radarIndex === item.key ? "default" : "ghost"}
                      onClick={() => setRadarIndex(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Sort</span>
                <div className="detail-pills">
                  {radarSorts.map((item) => (
                    <Button
                      key={item.key}
                      variant={radarSort === item.key ? "default" : "ghost"}
                      onClick={() => setRadarSort(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Direction</span>
                <div className="detail-pills">
                  {radarDirections.map((item) => (
                    <Button
                      key={item.key}
                      variant={radarDirection === item.key ? "default" : "ghost"}
                      onClick={() => setRadarDirection(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="radar-figure">
              <svg viewBox="0 0 640 640" className="radar-svg" aria-label="Radar view">
                <defs>
                  <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(17, 24, 39, 0.06)" />
                    <stop offset="100%" stopColor="rgba(17, 24, 39, 0)" />
                  </radialGradient>
                </defs>

                <circle cx="320" cy="320" r="290" className="radar-ring" />
                <circle cx="320" cy="320" r="210" className="radar-ring" />
                <circle cx="320" cy="320" r="140" className="radar-ring" />
                <circle cx="320" cy="320" r="70" className="radar-ring radar-ring-center" />
                <circle cx="320" cy="320" r="300" fill="url(#radarGlow)" />

                <line x1="320" y1="24" x2="320" y2="616" className="radar-axis" />
                <line x1="24" y1="320" x2="616" y2="320" className="radar-axis" />
                <line x1="110" y1="110" x2="530" y2="530" className="radar-axis" />
                <line x1="530" y1="110" x2="110" y2="530" className="radar-axis" />

                {radarPoints.map((point) => (
                  <g key={point.stock.symbol}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={8}
                      className={`radar-point ${point.stock.changePct >= 0 ? "positive" : "negative"}`}
                    />
                    <text x={point.x + 12} y={point.y + 4} className="radar-label">
                      {point.stock.symbol}
                    </text>
                  </g>
                ))}

                <circle cx="320" cy="320" r="10" className="radar-core" />
              </svg>
            </div>

            <div className="radar-summary">
              <div className="summary-card">
                <div className="summary-label">Live match</div>
                <div className="summary-value">{topMatch?.symbol ?? "N/A"}</div>
                <div className="summary-copy">{topMatch?.name ?? "Waiting for live data"}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Strategy</div>
                <div className="summary-value">{strategyLabels[selectedStrategy]}</div>
                <div className="summary-copy">{narrative.title ?? "Quant fit based on live scores"}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Pages</div>
                <div className="summary-value">{totalPages}</div>
                <div className="summary-copy">{rows.length} live rows loaded</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="insight-card">
          <CardHeader>
            <CardTitle>Radar readout</CardTitle>
            <CardDescription>Current upside, downside, and quant recommendation.</CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            <div className="performance-card performance-positive">
              <div className="performance-label">Fantastic view</div>
              <div className="performance-copy">{narrative.positive ?? "The live radar will surface the strongest upside case."}</div>
            </div>

            <div className="performance-card performance-negative">
              <div className="performance-label">Bad potential performance</div>
              <div className="performance-copy">{narrative.negative ?? "The live radar will also show where the strategy can fail."}</div>
            </div>

            <div className="performance-card performance-recommendation">
              <div className="performance-label">Recommendation</div>
              <div className="performance-copy">{narrative.recommendation ?? "Best current live match will appear here."}</div>
            </div>

            <div className="stack-gap">
              {rows.slice(0, 5).map((stock) => {
                const score = stock.strategyScores[strategyKey] ?? 0;
                return (
                  <div key={stock.symbol} className="radar-row">
                    <div className="radar-row-head">
                      <div>
                        <div className="radar-row-symbol">{stock.symbol}</div>
                        <div className="radar-row-name">{stock.name}</div>
                      </div>
                      <div className={`stock-change ${stock.changePct >= 0 ? "positive" : "negative"}`}>
                        {formatChange(stock.changePct)}
                      </div>
                    </div>
                    <div className="radar-row-foot">
                      <span>{formatMoney(stock.price)}</span>
                      <span>{score}/100</span>
                    </div>
                    <Progress value={score} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="content-grid">
        <Card className="list-card">
          <CardHeader>
            <CardTitle>Radar results</CardTitle>
            <CardDescription>Sorted by strategy score, change, or trend, with real live data.</CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            {rows.map((stock) => {
              const score = stock.strategyScores[strategyKey] ?? 0;
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
                        <span>Quant score</span>
                        <span>{score}/100</span>
                      </div>
                      <Progress value={score} />
                    </div>
                  </div>
                </article>
              );
            })}

            {loading && rows.length === 0 ? (
              <div className="empty-state">Loading live radar results...</div>
            ) : null}

            {!loading && rows.length === 0 ? (
              <div className="empty-state">No radar matches found for the current filters.</div>
            ) : null}

            <div ref={loadMoreRef} className="load-more-sentinel">
              {loadingMore ? "Loading more live rows..." : hasMore ? "Scroll for more" : "End of live results"}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
