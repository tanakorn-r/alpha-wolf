import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { brandTheme } from "./theme";
import { loadStockDetail, summarizeStock, type StockAnalysisResponse, type StockDetailResponse } from "./lib/api";
import { colorForSymbol, initialFor } from "./lib/symbolColor";
import { negative, panel, positive } from "./lib/ui";
import { useWolfStore } from "./store/useWolfStore";

type NavItem = {
  to?: string;
  label: string;
  kind: "dashboard" | "discover" | "search" | "insights";
  onClick?: () => void;
};

function NavIcon({ kind }: { kind: NavItem["kind"] }) {
  const common = "h-[18px] w-[18px] flex-none stroke-current fill-none stroke-[1.8]";
  switch (kind) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6.5 10.5V20h11V10.5" />
        </svg>
      );
    case "discover":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" />
          <path d="M14.8 9.2 16 8l-1.2 1.2M8 16l1.2-1.2M9.2 8 8 6.8M16 16.2 14.8 15" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "insights":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M5 19h14" />
          <path d="M7 15l3-4 3 2 4-7" />
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
  const block = "skeleton-block";
  return (
    <div className="flex flex-col gap-4" aria-label="Loading stock detail" aria-busy="true">
      <div className="grid grid-cols-[1.35fr_0.75fr_0.6fr] gap-3">
        <div className={block} style={{ height: 220 }} />
        <div className={block} style={{ height: 104 }} />
        <div className={block} style={{ height: 104 }} />
      </div>
      <div className={block} style={{ height: 140 }} />
      <div className="grid grid-cols-2 gap-4">
        <div className={block} style={{ height: 220 }} />
        <div className={block} style={{ height: 220 }} />
      </div>
    </div>
  );
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <div className="text-base font-bold text-slate-900">{title}</div>
      {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
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
  const watchlist = useWolfStore((state) => state.watchlist);

  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const pageTitle = location.pathname === "/discover" ? "Discover" : "Dashboard";

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
        if (active) setDetail(payload);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
        setDetailError("Unable to load the live detail panel right now.");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailOpen, selectedSymbol]);

  const overviewNavItems: NavItem[] = [
    { to: "/", label: "Dashboard", kind: "dashboard" },
    { to: "/discover", label: "Discover", kind: "discover" }
  ];

  const activityNavItems: NavItem[] = [
    {
      label: "Search",
      kind: "search",
      onClick: () => document.querySelector<HTMLInputElement>("#global-search")?.focus()
    },
    {
      label: "Insights",
      kind: "insights",
      onClick: () => selectedSymbol && useWolfStore.getState().openDetail(selectedSymbol)
    }
  ];

  const chartPath = useMemo(() => {
    const values = detail?.history.map((point) => point.close).filter((v): v is number => typeof v === "number") ?? [];
    return buildPath(values);
  }, [detail]);

  const performancePath = useMemo(() => buildPath(detail?.performance?.line ?? []), [detail]);

  const currentHistory = detail?.history ?? [];
  const currentClose = currentHistory.at(-1)?.close;
  const previousClose = currentHistory.at(-2)?.close;
  const chartChange =
    typeof currentClose === "number" && typeof previousClose === "number" && previousClose !== 0
      ? ((currentClose - previousClose) / previousClose) * 100
      : undefined;

  async function handleAnalyze() {
    if (!selectedSymbol) return;
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
    <div className="min-h-screen bg-violet-50">
      <div className="mx-auto flex max-w-[1560px] gap-5 p-5">
        <aside className="sticky top-5 flex h-[calc(100vh-40px)] w-64 flex-none flex-col gap-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-violet-600 text-sm font-extrabold text-white">
              AW
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold text-slate-900">{brandTheme.name}</span>
              <span className="text-[11px] text-slate-400">{brandTheme.tagline}</span>
            </div>
          </div>

          <div>
            <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Overview</div>
            <nav className="flex flex-col gap-1">
              {overviewNavItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to!}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                      isActive ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-violet-50 hover:text-slate-900"
                    }`
                  }
                >
                  <NavIcon kind={item.kind} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div>
            <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Activity</div>
            <nav className="flex flex-col gap-1">
              {activityNavItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 transition-colors hover:bg-violet-50 hover:text-slate-900"
                >
                  <NavIcon kind={item.kind} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">My Watchlist</div>
            <div className="flex flex-col gap-1">
              {watchlist.length ? (
                watchlist.map((stock) => {
                  const color = colorForSymbol(stock.symbol);
                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      onClick={() => useWolfStore.getState().openDetail(stock.symbol)}
                      className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-violet-50"
                    >
                      <span
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-extrabold"
                        style={{ background: color.bg, color: color.fg }}
                      >
                        {initialFor(stock.symbol)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-bold text-slate-900">{stock.symbol}</span>
                        <span className="truncate text-[11px] text-slate-400">{stock.sector}</span>
                      </span>
                      <span className="whitespace-nowrap text-[13px] font-bold text-slate-900">{formatMoney(stock.price)}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2 py-2 text-xs text-slate-400">Loading live names...</div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl bg-gradient-to-br from-violet-600 to-slate-900 p-4 text-white">
            <div className="text-sm font-bold leading-snug">Unlock deeper AI analysis</div>
            <div className="text-xs leading-relaxed text-violet-100">
              Get GPT-driven verdicts, technicals, and sector insight on every name.
            </div>
            <button
              type="button"
              onClick={() => selectedSymbol && useWolfStore.getState().openDetail(selectedSymbol)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-violet-700"
            >
              Open AI summary
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex items-center gap-4 rounded-2xl bg-white px-5 py-3.5 shadow-sm">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">
                Overview <span className="text-slate-300">/</span> <span className="font-semibold text-slate-600">{pageTitle}</span>
              </span>
            </div>

            <label className="flex min-h-[42px] flex-1 items-center gap-2.5 rounded-full bg-violet-50 px-4" htmlFor="global-search">
              <span className="text-slate-400">⌕</span>
              <input
                id="global-search"
                placeholder="Search stocks, strategies, or symbols"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-bold text-violet-600">Live</span>
              <span className="hidden rounded-full bg-violet-50 px-3 py-2 text-xs font-bold text-slate-600 sm:inline">
                {selectedSymbol || "Pick a name"}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">D</div>
                <div className="hidden flex-col leading-tight md:flex">
                  <span className="text-xs font-bold text-slate-900">Daniel</span>
                  <span className="text-[11px] text-slate-400">Trader</span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex min-w-0 flex-col gap-5">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-30 bg-slate-900/30 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={closeDetail}
        aria-hidden="true"
      />
      <aside
        className={`fixed right-0 top-0 z-40 h-screen w-full max-w-[560px] overflow-y-auto bg-violet-50 shadow-2xl transition-transform ${
          detailOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Stock detail panel"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-violet-500">Stock detail</div>
              <div className="text-2xl font-extrabold text-slate-900">{detail?.stock.symbol ?? (selectedSymbol || "Live data")}</div>
              <div className="text-sm text-slate-400">{detail?.stock.name ?? "Live data panel"}</div>
            </div>
            <button
              type="button"
              onClick={closeDetail}
              aria-label="Close detail panel"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-lg text-slate-500 hover:bg-violet-100"
            >
              ×
            </button>
          </div>

          {detailLoading ? (
            <div className={panel}>
              <DetailSkeleton />
            </div>
          ) : null}
          {detailError ? <div className={panel}>{detailError}</div> : null}

          {detail ? (
            <>
              <div className="grid grid-cols-[1.35fr_0.75fr] gap-4">
                <div className={panel}>
                  <PanelHeader title="Price path" description="The live trend that the market is pricing right now." />
                  <svg viewBox="0 0 100 100" className="h-40 w-full" aria-label="Price trend chart">
                    <path d={`${chartPath} L 100 90 L 0 90 Z`} fill="rgba(124,92,252,0.12)" />
                    <path d={chartPath} fill="none" stroke="#7c5cfc" strokeWidth="2" />
                  </svg>
                  <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                    <span>Today</span>
                    <strong className={`text-sm ${detail.stock.changePct >= 0 ? positive : negative}`}>
                      {formatPercent(detail.stock.changePct)}
                    </strong>
                  </div>
                </div>

                <div className={panel}>
                  <PanelHeader title="Industry pulse" description="Distance to the current sector lead." />
                  <div className="flex items-center gap-4">
                    <div
                      className="relative grid h-20 w-20 flex-none place-items-center rounded-full"
                      style={{ background: `conic-gradient(#7c5cfc ${peerProgress}%, #ede9fe 0)` }}
                    >
                      <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-white text-center">
                        <span className="text-sm font-extrabold text-slate-900">{Math.round(peerProgress)}%</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <strong className="text-sm font-bold text-slate-900">{peerRank?.isNo1 ? "Leader" : `#${peerRank?.rank ?? 1}`}</strong>
                      <span className="text-xs text-slate-400">{peerRank?.sector ?? business?.sector ?? detail.stock.sector}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={panel}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-500">Decision</div>
                    <div className="text-2xl font-extrabold text-slate-900">{decisionAction}</div>
                    <div className="text-sm text-slate-500">{verdict?.headline ?? "Loading verdict..."}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-extrabold text-violet-600">{decisionScore}</div>
                    <div className="text-xs font-semibold text-slate-400">{decisionConfidence}</div>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-violet-50">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${decisionScore}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Analyst view</span>
                  <span className="font-semibold text-slate-600">{business?.analystRating ?? verdict?.analyst ?? "Hold"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={panel}>
                  <div className="text-xs text-slate-400">{detail.stock.sector}</div>
                  <div className="text-2xl font-extrabold text-slate-900">{formatMoney(detail.stock.price)}</div>
                  <div className={`text-sm font-semibold ${detail.stock.changePct >= 0 ? positive : negative}`}>
                    {formatPercent(detail.stock.changePct)} today
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-violet-50 px-2 py-2">
                      <div className="text-[10px] text-slate-400">Fit</div>
                      <div className="text-sm font-bold text-slate-900">{decisionScore}/100</div>
                    </div>
                    <div className="rounded-xl bg-violet-50 px-2 py-2">
                      <div className="text-[10px] text-slate-400">Weekly</div>
                      <div className="text-sm font-bold text-slate-900">{formatPercent(detail.stock.weeklyTrend)}</div>
                    </div>
                    <div className="rounded-xl bg-violet-50 px-2 py-2">
                      <div className="text-[10px] text-slate-400">Move</div>
                      <div className="text-sm font-bold text-slate-900">{formatPercent(chartChange)}</div>
                    </div>
                  </div>
                  <svg viewBox="0 0 100 100" className="mt-3 h-20 w-full" aria-label="Business performance sparkline">
                    <path d={`${performancePath} L 100 90 L 0 90 Z`} fill="rgba(124,92,252,0.1)" />
                    <path d={performancePath} fill="none" stroke="#7c5cfc" strokeWidth="2" />
                  </svg>
                </div>

                <div className={panel}>
                  <PanelHeader title="Business outlook" description="Valuation and analyst view together." />
                  <div className="mb-3 text-sm text-slate-600">{outlook?.summary ?? business?.companySummary ?? "No outlook yet."}</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "PE", value: formatMultiple(business?.peRatio) },
                      { label: "PBV", value: formatMultiple(business?.priceToBook) },
                      { label: "ROE", value: formatPercent(business?.roe) },
                      { label: "ROA", value: formatPercent(business?.roa) },
                      { label: "Margin", value: formatPercent(business?.profitMargin) },
                      { label: "Yield", value: formatPercent(business?.dividendYield) },
                      { label: "Growth", value: formatPercent(business?.revenueGrowth) },
                      { label: "Earnings", value: formatPercent(business?.earningsGrowth) }
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-violet-50 px-1 py-2">
                        <div className="text-[10px] text-slate-400">{item.label}</div>
                        <div className="text-xs font-bold text-slate-900">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={panel}>
                <PanelHeader title="Performance history" description="Long-horizon returns across key windows." />
                <div className="flex flex-col gap-3">
                  {performanceRows.map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-400">{item.label}</span>
                        <strong className={(item.value ?? 0) >= 0 ? positive : negative}>{formatPercent(item.value)}</strong>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-50">
                        <div
                          className={`h-full rounded-full ${(item.value ?? 0) >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                          style={{ width: `${Math.min((Math.abs(item.value ?? 0) / performancePeak) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={panel}>
                  <PanelHeader title="Industry rank" description="How this name stacks up against peers." />
                  <div className="text-2xl font-extrabold text-slate-900">
                    {peerRank?.rank ?? 1} / {peerRank?.count ?? 1}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {peerRank?.isNo1 ? "This name is currently leading its sector." : `The sector leader is ${peerRank?.leader ?? "n/a"}.`}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">Sector: {peerRank?.sector ?? business?.sector ?? detail.stock.sector}</div>
                </div>

                <div className={panel}>
                  <PanelHeader title="Technical analysis" description="Quant signals behind the verdict." />
                  <div className="grid grid-cols-2 gap-2">
                    {techCards.map((item) => (
                      <div key={item.label} className="rounded-xl bg-violet-50 px-2 py-2">
                        <div className="text-[10px] text-slate-400">{item.label}</div>
                        <div className="text-xs font-bold text-slate-900">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-xs">
                    <span className="text-slate-400">Signal</span>
                    <span className="font-bold text-slate-900">{tech?.signal ?? "neutral"}</span>
                  </div>
                </div>
              </div>

              <div className={panel}>
                <PanelHeader title="News + AI recap" description="Recent headlines and a direct GPT summary." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    {(detail.news || []).slice(0, 4).map((item) => {
                      const content = (
                        <>
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{item.publisher ?? "News"}</span>
                            <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ""}</span>
                          </div>
                          {item.summary ? <div className="mt-1 text-xs text-slate-500">{item.summary}</div> : null}
                        </>
                      );
                      return item.link ? (
                        <a
                          key={`${item.title}-${item.link}`}
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-violet-50 p-3 hover:bg-violet-100"
                        >
                          {content}
                        </a>
                      ) : (
                        <div key={item.title} className="rounded-xl bg-violet-50 p-3">
                          {content}
                        </div>
                      );
                    })}
                    {!detail.news?.length ? <div className="text-sm text-slate-400">No recent news came back from the live feed.</div> : null}
                  </div>

                  <div className="rounded-2xl bg-violet-50 p-4">
                    <div className="mb-1 text-sm font-bold text-slate-900">AI summary</div>
                    <div className="mb-3 text-xs text-slate-500">Press the button for a thesis, score, and reasoned call.</div>
                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={analysisLoading}
                      className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {analysisLoading ? "Summarizing..." : "Ask GPT-5.4-mini"}
                    </button>
                    {analysis ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="text-xl font-extrabold text-violet-600">{analysis.score}/100</div>
                        <div className="text-sm font-semibold text-slate-900">{analysis.recommendation}</div>
                        <div className="text-sm text-slate-600">{analysis.summary}</div>
                        {analysis.future ? <div className="text-xs italic text-slate-500">{analysis.future}</div> : null}
                        {analysis.reasons?.length ? (
                          <ul className="list-disc pl-4 text-xs text-slate-500">
                            {analysis.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
