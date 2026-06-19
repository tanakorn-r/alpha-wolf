import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { RadarPage } from "./pages/RadarPage";
import { brandTheme } from "./theme";
import { loadStockDetail, summarizeStock, type StockAnalysisResponse, type StockDetailResponse } from "./lib/api";
import { colorForSymbol, initialFor } from "./lib/symbolColor";
import { useWolfStore } from "./store/useWolfStore";

type NavItem = {
  to?: string;
  label: string;
  kind: "dashboard" | "discover" | "radar" | "search" | "settings" | "insights";
  onClick?: () => void;
};

function iconFor(kind: NavItem["kind"]) {
  switch (kind) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6.5 10.5V20h11V10.5" />
        </svg>
      );
    case "discover":
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" />
          <path d="M14.8 9.2 16 8l-1.2 1.2M8 16l1.2-1.2M9.2 8 8 6.8M16 16.2 14.8 15" />
          <path d="M12 7.5v2.5M12 14v2.5M7.5 12h2.5M14 12h2.5" />
        </svg>
      );
    case "radar":
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4v4M20 12h-4M12 20v-4M4 12h4" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "insights":
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <path d="M5 19h14" />
          <path d="M7 15l3-4 3 2 4-7" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="sidebar-nav-icon" aria-hidden="true">
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
        </svg>
      );
  }
}

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

function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatNumber(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatMultiple(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(2)}x`;
}

function buildPath(values: number[]) {
  if (!values.length) {
    return "M 0 100";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const step = 100 / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = index * step;
      const y = 100 - ((value - min) / range) * 72 - 10;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function DetailSkeleton() {
  return (
    <div className="detail-drawer-content skeleton-stack" aria-label="Loading stock detail" aria-busy="true">
      <div className="skeleton-chart-grid">
        <div className="skeleton-block" style={{ height: 220 }} />
        <div className="skeleton-block" style={{ height: 104 }} />
        <div className="skeleton-block" style={{ height: 104 }} />
      </div>
      <div className="skeleton-block" style={{ height: 140 }} />
      <div className="skeleton-card-grid">
        <div className="skeleton-block" style={{ height: 220 }} />
        <div className="skeleton-block" style={{ height: 220 }} />
      </div>
      <div className="skeleton-block" style={{ height: 160 }} />
      <div className="skeleton-card-grid">
        <div className="skeleton-block" style={{ height: 140 }} />
        <div className="skeleton-block" style={{ height: 140 }} />
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const setSearchQuery = useWolfStore((state) => state.setSearchQuery);
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const detailOpen = useWolfStore((state) => state.detailOpen);
  const closeDetail = useWolfStore((state) => state.closeDetail);
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);

  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const pageTitle =
    location.pathname === "/discover" ? "Discover" : location.pathname === "/radar" ? "Radar" : "Dashboard";

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) {
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError("");
    setAnalysis(null);

    loadStockDetail(selectedSymbol)
      .then((payload) => {
        if (!active) {
          return;
        }
        setDetail(payload);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDetail(null);
        setDetailError("Unable to load the live detail panel right now.");
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [detailOpen, selectedSymbol]);

  const overviewNavItems: NavItem[] = [
    { to: "/", label: "Dashboard", kind: "dashboard" },
    { to: "/radar", label: "Radar", kind: "radar" },
    { to: "/discover", label: "Discover", kind: "discover" }
  ];

  const activityNavItems: NavItem[] = [
    {
      label: "Search",
      kind: "search",
      onClick: () => {
        const input = document.querySelector<HTMLInputElement>(".search-bar input");
        input?.focus();
      }
    },
    {
      label: "Insights",
      kind: "insights",
      onClick: () => {
        if (!detailOpen && selectedSymbol) {
          useWolfStore.getState().openDetail(selectedSymbol);
        }
      }
    }
  ];

  const watchlist = useWolfStore((state) => state.watchlist);

  const chartPath = useMemo(() => {
    const values = detail?.history.map((point) => point.close).filter((value): value is number => typeof value === "number") ?? [];
    return buildPath(values);
  }, [detail]);

  const performancePath = useMemo(() => {
    const values = detail?.performance?.line ?? [];
    return buildPath(values);
  }, [detail]);

  const currentHistory = detail?.history ?? [];
  const currentClose = currentHistory.at(-1)?.close;
  const previousClose = currentHistory.at(-2)?.close;
  const chartChange = typeof currentClose === "number" && typeof previousClose === "number" && previousClose !== 0
    ? ((currentClose - previousClose) / previousClose) * 100
    : undefined;

  async function handleAnalyze() {
    if (!selectedSymbol) {
      return;
    }

    setAnalysisLoading(true);
    try {
      const response = await summarizeStock(selectedSymbol, selectedStrategy);
      setAnalysis(response);
    } catch {
      setAnalysis({
        score: 0,
        recommendation: "AI summary is unavailable right now.",
        summary: "The backend could not produce an AI summary.",
        reasons: ["Check the backend environment variables.", "Make sure OPENAI_API_KEY is set and rotated."],
        future: "Fallback analysis only.",
        confidence: "Low"
      });
    } finally {
      setAnalysisLoading(false);
    }
  }

  const tech = detail?.technicals;
  const business = detail?.business;
  const verdict = detail?.verdict;
  const outlook = detail?.outlook;
  const performance = detail?.performance;
  const peerRank = detail?.peerRank;
  const returns = performance?.returns ?? {};
  const decisionScore = verdict?.score ?? detail?.stock.strategyScores[selectedStrategy] ?? 0;
  const decisionAction = verdict?.action ?? "WAIT";
  const decisionConfidence = verdict?.confidence ?? "Balanced";
  const decisionLabel = decisionAction === "BUY" ? "Buy now" : decisionAction === "PASS" ? "Wait it out" : "Watch and confirm";
  const performanceRows = [
    { label: "YTD", value: returns.ytd },
    { label: "1Y", value: returns["1y"] },
    { label: "2Y", value: returns["2y"] },
    { label: "3Y", value: returns["3y"] },
    { label: "4Y", value: returns["4y"] }
  ];
  const performancePeak = Math.max(1, ...performanceRows.map((item) => Math.abs(item.value ?? 0)));
  const peerProgress = peerRank?.count
    ? Math.max(12, 100 - ((Math.max(peerRank.rank ?? 1, 1) - 1) / Math.max(peerRank.count, 1)) * 100)
    : decisionScore;
  const techCards = tech
    ? [
        { label: "RSI 14", value: formatNumber(tech.rsi14) },
        { label: "MACD", value: formatNumber(tech.macd) },
        { label: "Signal", value: formatNumber(tech.macdSignal) },
        { label: "Histogram", value: formatNumber(tech.macdHistogram) },
        { label: "SMA 20", value: formatNumber(tech.sma20) },
        { label: "SMA 50", value: formatNumber(tech.sma50) },
        { label: "SMA 200", value: formatNumber(tech.sma200) },
        { label: "Volume ratio", value: formatNumber(tech.volumeRatio) }
      ]
    : [];

  return (
    <div className="shell-bg">
      <div className="shell-frame">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">AW</div>
            <div className="brand-caption">
              <span className="brand-name">{brandTheme.name}</span>
              <span className="brand-tagline">{brandTheme.tagline}</span>
            </div>
          </div>

          <div>
            <div className="sidebar-section-label">Overview</div>
            <nav className="sidebar-nav">
              {overviewNavItems.map((item) => (
                <NavLink key={item.label} to={item.to!} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                  {iconFor(item.kind)}
                  <span className="sidebar-link-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div>
            <div className="sidebar-section-label">Activity</div>
            <nav className="sidebar-nav">
              {activityNavItems.map((item) => (
                <button key={item.label} className="sidebar-link" type="button" onClick={item.onClick}>
                  {iconFor(item.kind)}
                  <span className="sidebar-link-label">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div>
            <div className="sidebar-section-label">My Watchlist</div>
            <div className="sidebar-watchlist">
              {watchlist.length ? (
                watchlist.map((stock) => {
                  const color = colorForSymbol(stock.symbol);
                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      className="watchlist-row"
                      onClick={() => useWolfStore.getState().openDetail(stock.symbol)}
                    >
                      <span className="watchlist-icon" style={{ background: color.bg, color: color.fg }}>
                        {initialFor(stock.symbol)}
                      </span>
                      <span className="watchlist-meta">
                        <span className="watchlist-symbol">{stock.symbol}</span>
                        <span className="watchlist-sector">{stock.sector}</span>
                      </span>
                      <span className="watchlist-price">{formatMoney(stock.price)}</span>
                    </button>
                  );
                })
              ) : (
                <div className="watchlist-row" style={{ color: "var(--sidebar-text)" }}>
                  Loading live names...
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-spacer" />

          <div className="sidebar-cta">
            <div className="sidebar-cta-title">Unlock deeper AI analysis</div>
            <div className="sidebar-cta-copy">Get GPT-driven verdicts, technicals, and sector insight on every name.</div>
            <Button
              type="button"
              onClick={() => {
                if (selectedSymbol) {
                  useWolfStore.getState().openDetail(selectedSymbol);
                }
              }}
            >
              Open AI summary
            </Button>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <div className="page-kicker">{brandTheme.tagline}</div>
              <div className="page-title">{pageTitle}</div>
            </div>

            <label className="search-bar" aria-label="Search stocks">
              <span className="search-icon">⌕</span>
              <input
                placeholder="Search stocks, strategies, or symbols"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <div className="topbar-right">
              <div className="topbar-chip">Live</div>
              <div className="topbar-chip">{selectedSymbol || "Pick a name"}</div>
              <div className="avatar-block">
                <div className="avatar">D</div>
                <div className="avatar-caption">
                  <span className="avatar-name">Daniel</span>
                  <span className="avatar-role">Trader</span>
                </div>
              </div>
            </div>
          </header>

          <main className="page-stack">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/radar" element={<RadarPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      <div className={`drawer-backdrop ${detailOpen ? "open" : ""}`} onClick={closeDetail} aria-hidden="true" />
      <aside className={`detail-drawer ${detailOpen ? "open" : ""}`} aria-label="Stock detail panel">
        <div className="detail-drawer-shell">
          <div className="detail-drawer-header">
            <div>
              <div className="detail-drawer-kicker">Stock detail</div>
              <div className="detail-drawer-title">{detail?.stock.symbol ?? (selectedSymbol || "Live data")}</div>
              <div className="detail-drawer-subtitle">{detail?.stock.name ?? "Live data panel"}</div>
            </div>
            <button className="drawer-close" type="button" onClick={closeDetail} aria-label="Close detail panel">
              ×
            </button>
          </div>

          {detailLoading ? <DetailSkeleton /> : null}
          {detailError ? <div className="empty-state">{detailError}</div> : null}

          {detail ? (
            <div className="detail-drawer-content">
              <div className="detail-chart-grid">
                <Card className="detail-chart-card detail-chart-card-large">
                  <CardHeader>
                    <CardTitle>Price path</CardTitle>
                    <CardDescription>The live trend that the market is pricing right now.</CardDescription>
                  </CardHeader>
                  <CardContent className="stack-gap">
                    <div className="detail-chart detail-chart-animated">
                      <svg viewBox="0 0 100 100" className="detail-chart-svg" aria-label="Price trend chart">
                        <path d={`${chartPath} L 100 90 L 0 90 Z`} className="detail-chart-fill" />
                        <path d={chartPath} className="detail-chart-line" />
                      </svg>
                    </div>
                    <div className="detail-chart-foot">
                      <span>Today</span>
                      <strong className={`stock-change ${detail.stock.changePct >= 0 ? "positive" : "negative"}`}>
                        {formatPercent(detail.stock.changePct)}
                      </strong>
                    </div>
                  </CardContent>
                </Card>

                <Card className="detail-chart-card">
                  <CardHeader>
                    <CardTitle>Return profile</CardTitle>
                    <CardDescription>How the tape has treated holders across key horizons.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="detail-bar-chart" aria-label="Return profile chart">
                      {performanceRows.map((item) => {
                        const value = Math.abs(item.value ?? 0);
                        const barHeight = Math.max(12, (value / performancePeak) * 100);
                        const positive = (item.value ?? 0) >= 0;
                        return (
                          <div key={item.label} className="detail-bar-column">
                            <div className={`detail-bar ${positive ? "positive" : "negative"}`} style={{ height: `${barHeight}%` }} />
                            <span>{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="detail-chart-card">
                  <CardHeader>
                    <CardTitle>Industry pulse</CardTitle>
                    <CardDescription>How close this name sits to the current sector lead.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="detail-ring-wrap">
                      <div className="score-ring score-ring-small" style={{ ["--score" as string]: peerProgress }}>
                        <div className="score-ring-inner">
                          <div className="score-ring-value">{Math.round(peerProgress)}%</div>
                          <div className="score-ring-label">sector rank</div>
                        </div>
                      </div>
                      <div className="detail-ring-copy">
                        <strong>{peerRank?.isNo1 ? "Leader" : `#${peerRank?.rank ?? 1}`}</strong>
                        <span>{peerRank?.sector ?? business?.sector ?? detail.stock.sector}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="verdict-card">
                <CardContent className="verdict-shell">
                  <div className="verdict-top">
                    <div>
                      <div className="detail-drawer-kicker">Decision</div>
                      <div className="verdict-action verdict-slide">{decisionAction}</div>
                      <div className="verdict-headline">{verdict?.headline ?? "Loading verdict..."}</div>
                    </div>
                    <div className="verdict-score-block">
                      <div className="verdict-score">{decisionScore}</div>
                      <div className="verdict-subtitle">{decisionConfidence}</div>
                    </div>
                  </div>

                  <div className="verdict-rail">
                    {(["BUY", "WAIT", "PASS"] as const).map((item) => (
                      <div key={item} className={`verdict-step ${decisionAction === item ? "active" : ""}`}>
                        <span className="verdict-step-label">{item}</span>
                        <span className="verdict-step-copy">
                          {item === "BUY" ? "Strong conviction" : item === "WAIT" ? "Needs confirmation" : "Not a clean setup"}
                        </span>
                      </div>
                    ))}
                    <div className="verdict-progress">
                      <div className="verdict-progress-track">
                        <div className="verdict-progress-fill" style={{ width: `${decisionScore}%` }} />
                      </div>
                      <div className="verdict-progress-meta">
                        <span>{decisionLabel}</span>
                        <span>{verdict?.analyst ?? business?.analystRating ?? "Hold"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="verdict-meter">
                    <div className="verdict-meter-track">
                      <div className="verdict-meter-fill" style={{ width: `${decisionScore}%` }} />
                    </div>
                    <div className="verdict-meter-meta">
                      <span>Analyst view</span>
                      <span>{business?.analystRating ?? "Hold"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="detail-grid">
                <Card className="detail-focus-card">
                  <CardHeader>
                    <CardDescription>{detail.stock.sector}</CardDescription>
                    <CardTitle className="detail-stock-head">{formatMoney(detail.stock.price)}</CardTitle>
                    <div className={`stock-change ${detail.stock.changePct >= 0 ? "positive" : "negative"}`}>
                      {formatPercent(detail.stock.changePct)} today
                    </div>
                  </CardHeader>
                  <CardContent className="stack-gap">
                    <div className="detail-meta-grid">
                      <div className="detail-meta">
                        <span>Strategy fit</span>
                        <strong>{decisionScore}/100</strong>
                      </div>
                      <div className="detail-meta">
                        <span>Weekly trend</span>
                        <strong>{formatPercent(detail.stock.weeklyTrend)}</strong>
                      </div>
                      <div className="detail-meta">
                        <span>Chart move</span>
                        <strong>{formatPercent(chartChange)}</strong>
                      </div>
                    </div>

                    <div className="detail-chart detail-chart-animated">
                      <svg viewBox="0 0 100 100" className="detail-chart-svg" aria-label="Price trend chart">
                        <path d={`${chartPath} L 100 90 L 0 90 Z`} className="detail-chart-fill" />
                        <path d={chartPath} className="detail-chart-line" />
                      </svg>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Business outlook</CardTitle>
                    <CardDescription>What the business, valuation, and analyst view say together.</CardDescription>
                  </CardHeader>
                  <CardContent className="stack-gap">
                    <div className="business-summary">{outlook?.summary ?? business?.companySummary ?? "No outlook yet."}</div>
                    <div className="business-callouts">
                      <div className={`business-callout ${outlook?.industryLeader ? "strong" : ""}`}>
                        <span>Industry</span>
                        <strong>{peerRank?.sector ?? business?.sector ?? detail.stock.sector}</strong>
                        <small>
                          {peerRank?.isNo1 ? "Leading the live sector watchlist" : `Rank ${peerRank?.rank ?? 1} of ${peerRank?.count ?? 1} peers`}
                        </small>
                      </div>
                      <div className="business-callout">
                        <span>Analyst</span>
                        <strong>{business?.analystRating ?? "Hold"}</strong>
                        <small>
                          Target {formatMoney(business?.targetMeanPrice)} vs {formatMoney(business?.currentPrice ?? detail.stock.price)}
                        </small>
                      </div>
                      <div className="business-callout">
                        <span>Long view</span>
                        <strong>
                          {performance?.trend === "positive"
                            ? "Momentum intact"
                            : performance?.trend === "negative"
                              ? "Needs patience"
                              : "Sideways setup"}
                        </strong>
                        <small>Momentum score {performance?.momentumScore ?? 0}/100</small>
                      </div>
                    </div>
                    <div className="business-grid">
                      <div className="business-pill">
                        <span>PE</span>
                        <strong>{formatMultiple(business?.peRatio)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>PBV</span>
                        <strong>{formatMultiple(business?.priceToBook)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>ROE</span>
                        <strong>{formatPercent(business?.roe)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>ROA</span>
                        <strong>{formatPercent(business?.roa)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>Margin</span>
                        <strong>{formatPercent(business?.profitMargin)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>Yield</span>
                        <strong>{formatPercent(business?.dividendYield)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>Growth</span>
                        <strong>{formatPercent(business?.revenueGrowth)}</strong>
                      </div>
                      <div className="business-pill">
                        <span>Earnings</span>
                        <strong>{formatPercent(business?.earningsGrowth)}</strong>
                      </div>
                    </div>
                    <div className="detail-chart detail-chart-animated business-mini-chart">
                      <svg viewBox="0 0 100 100" className="detail-chart-svg" aria-label="Business performance sparkline">
                        <path d={`${performancePath} L 100 90 L 0 90 Z`} className="detail-chart-fill" />
                        <path d={performancePath} className="detail-chart-line" />
                      </svg>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Performance history</CardTitle>
                  <CardDescription>Long-horizon returns and whether the current setup still has momentum.</CardDescription>
                </CardHeader>
                <CardContent className="performance-history">
                  <div className="performance-strip">
                    {performanceRows.map((item) => (
                      <div key={item.label} className="performance-chip">
                        <span>{item.label}</span>
                        <strong>{formatPercent(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                  {performanceRows.map((item) => (
                    <div key={item.label} className="history-row">
                      <div className="history-top">
                        <span>{item.label}</span>
                        <strong>{formatPercent(item.value)}</strong>
                      </div>
                      <div className="history-track">
                        <div
                          className={`history-fill ${((item.value ?? 0) >= 0 ? "positive" : "negative")}`}
                          style={{ width: `${Math.min(Math.abs(item.value ?? 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="detail-grid">
                <Card>
                  <CardHeader>
                    <CardTitle>Industry rank</CardTitle>
                    <CardDescription>How the stock stacks up against peers in the live watchlist.</CardDescription>
                  </CardHeader>
                  <CardContent className="peer-card">
                    <div className="peer-score">{peerRank?.rank ?? 1} / {peerRank?.count ?? 1}</div>
                    <div className="peer-copy">
                      {peerRank?.isNo1 ? "This name is currently leading its sector." : `The sector leader is ${peerRank?.leader ?? "n/a"}.`}
                    </div>
                    <div className="peer-subcopy">Sector: {peerRank?.sector ?? business?.sector ?? detail.stock.sector}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Technical analysis</CardTitle>
                    <CardDescription>Still useful, but now shown as part of the full decision stack.</CardDescription>
                  </CardHeader>
                  <CardContent className="tech-grid">
                    {techCards.map((item) => (
                      <div key={item.label} className="tech-pill">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                    <div className="tech-pill tech-pill-wide">
                      <span>Signal</span>
                      <strong>{tech?.signal ?? "neutral"}</strong>
                    </div>
                    <div className="tech-pill tech-pill-wide">
                      <span>Support / Resistance</span>
                      <strong>
                        {formatMoney(tech?.support)} / {formatMoney(tech?.resistance)}
                      </strong>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>News + AI recap</CardTitle>
                  <CardDescription>Recent headlines and a direct GPT summary of what matters most.</CardDescription>
                </CardHeader>
                <CardContent className="news-ai-grid">
                  <div className="stack-gap">
                    {(detail.news || []).slice(0, 4).map((item) =>
                      item.link ? (
                        <a
                          key={`${item.title}-${item.link}`}
                          className="news-item"
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <div className="news-title">{item.title}</div>
                          <div className="news-meta">
                            <span>{item.publisher ?? "News"}</span>
                            <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ""}</span>
                          </div>
                          {item.summary ? <div className="news-summary">{item.summary}</div> : null}
                        </a>
                      ) : (
                        <div key={item.title} className="news-item">
                          <div className="news-title">{item.title}</div>
                          <div className="news-meta">
                            <span>{item.publisher ?? "News"}</span>
                            <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ""}</span>
                          </div>
                          {item.summary ? <div className="news-summary">{item.summary}</div> : null}
                        </div>
                      )
                    )}
                    {!detail.news?.length ? <div className="empty-state">No recent news came back from the live feed.</div> : null}
                  </div>

                  <Card className="ai-panel">
                    <CardHeader>
                      <CardTitle>AI summary</CardTitle>
                      <CardDescription>Press the button for a short thesis, score, and reasoned call.</CardDescription>
                    </CardHeader>
                    <CardContent className="stack-gap">
                      <Button onClick={handleAnalyze} disabled={analysisLoading}>
                        {analysisLoading ? "Summarizing..." : "Ask GPT-5.4-mini"}
                      </Button>
                      {analysis ? (
                        <div className="analysis-stack">
                          <div className="analysis-score">{analysis.score}/100</div>
                          <div className="analysis-copy">{analysis.recommendation}</div>
                          <div className="analysis-copy">{analysis.summary}</div>
                          {analysis.future ? <div className="analysis-future">{analysis.future}</div> : null}
                          {analysis.reasons?.length ? (
                            <div className="analysis-list">
                              {analysis.reasons.map((reason) => (
                                <div key={reason} className="analysis-item">
                                  {reason}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
