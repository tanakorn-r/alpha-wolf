import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { strategyDescriptions, strategyLabels } from "../data/market";
import { loadDiscoveries, loadPortfolio, loadQuantPerspective, loadStockDetail, loadTodayPerformance, summarizeStock, type DiscoveryItem, type QuantPerspectiveResponse, type StockAnalysisResponse, type StockDetailResponse, type TodayPerformanceResponse } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

const panel = "rounded-2xl border border-[#2a2a31] bg-[#161619]";
const input = "h-12 rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-4 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function AnalystPage() {
  const strategy = useWolfStore((state) => state.selectedStrategy);
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const setSelectedSymbol = useWolfStore((state) => state.setSelectedSymbol);
  const [draftSymbol, setDraftSymbol] = useState(selectedSymbol);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [quant, setQuant] = useState<QuantPerspectiveResponse | null>(null);
  const [todayRead, setTodayRead] = useState<TodayPerformanceResponse | null>(null);
  const [todayModalOpen, setTodayModalOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [quantLoading, setQuantLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const deferredQuery = useDeferredValue(draftSymbol.trim());
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const activeSymbol = selectedSymbol || portfolioQuery.data?.holdings[0]?.symbol || "";
  const hasActiveSymbol = Boolean(activeSymbol);
  const detailQuery = useQuery({
    queryKey: ["analyst-detail", activeSymbol, strategy],
    queryFn: () => loadStockDetail(activeSymbol, strategy),
    enabled: hasActiveSymbol,
  });
  const searchQuery = useQuery({
    queryKey: ["analyst-search", deferredQuery],
    queryFn: () => loadDiscoveries({ q: deferredQuery, kind: "stock", limit: 6 }),
    enabled: deferredQuery.length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedSymbol && portfolioQuery.data?.holdings[0]?.symbol) {
      const symbol = portfolioQuery.data.holdings[0].symbol;
      setSelectedSymbol(symbol);
      setDraftSymbol(symbol);
    }
  }, [portfolioQuery.data, selectedSymbol, setSelectedSymbol]);

  useEffect(() => {
    if (selectedSymbol) {
      setDraftSymbol(selectedSymbol);
      setAnalysis(null);
      setQuant(null);
      setTodayRead(null);
      setError("");
    }
  }, [selectedSymbol]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function runAnalysis(symbolOverride?: string) {
    const nextSymbol = (symbolOverride ?? draftSymbol).trim().toUpperCase();
    if (!nextSymbol) return;
    setSelectedSymbol(nextSymbol);
    setSearchOpen(false);
    setError("");
    setAnalyzing(true);
    try {
      const result = await summarizeStock(nextSymbol, strategy);
      setAnalysis(result);
    } catch {
      setError("AI analyst could not produce a target price for this stock yet.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runQuantPerspective(symbolOverride?: string) {
    const nextSymbol = (symbolOverride ?? draftSymbol).trim().toUpperCase();
    if (!nextSymbol) return;
    setSelectedSymbol(nextSymbol);
    setSearchOpen(false);
    setError("");
    setQuantLoading(true);
    try {
      const result = await loadQuantPerspective(nextSymbol, strategy);
      setQuant(result);
    } catch {
      setError("Quant perspective could not be generated for this stock yet.");
    } finally {
      setQuantLoading(false);
    }
  }

  async function runTodayPerformance(symbolOverride?: string) {
    const nextSymbol = (symbolOverride ?? draftSymbol).trim().toUpperCase();
    if (!nextSymbol) return;
    setSelectedSymbol(nextSymbol);
    setSearchOpen(false);
    setError("");
    setTodayLoading(true);
    try {
      const result = await loadTodayPerformance(nextSymbol, strategy);
      setTodayRead(result);
      setTodayModalOpen(true);
    } catch {
      setError("Today performance AI could not read this session yet.");
    } finally {
      setTodayLoading(false);
    }
  }

  const detail = detailQuery.data;
  const target = analysis?.targetPrice;
  const entry = analysis?.entryPrice;
  const quoteCurrency = detail?.stock.currency ?? "USD";
  const highlightTone = (analysis?.tone ?? "warn") === "good" ? "border-[#285f48] bg-[radial-gradient(circle_at_top_left,rgba(62,207,142,0.18),transparent_42%),#161619]" : (analysis?.tone ?? "warn") === "bad" ? "border-[#663438] bg-[radial-gradient(circle_at_top_left,rgba(242,87,92,0.15),transparent_42%),#161619]" : "border-[#5a4724] bg-[radial-gradient(circle_at_top_left,rgba(245,196,81,0.13),transparent_42%),#161619]";
  const snapshotLoading = hasActiveSymbol && (detailQuery.isPending || detailQuery.isFetching);
  const tradingViewUrl = activeSymbol ? buildTradingViewUrl(activeSymbol) : "";
  const suggestions = useMemo(() => {
    const live = searchQuery.data?.live ?? [];
    const items = searchQuery.data?.items ?? [];
    const merged = new Map<string, DiscoveryItem>();
    for (const item of items) {
      if (item.symbol) merged.set(item.symbol, item);
    }
    for (const stock of live) {
      if (!merged.has(stock.symbol)) {
        merged.set(stock.symbol, {
          symbol: stock.symbol,
          name: stock.name,
          kind: "stock",
          query: deferredQuery,
          exchange: stock.exchange,
          sector: stock.sector,
          industry: stock.industry,
          currency: stock.currency,
          price: stock.price,
          changePct: stock.changePct,
        });
      }
    }
    return Array.from(merged.values()).slice(0, 6);
  }, [deferredQuery, searchQuery.data]);
  const showSuggestions = searchOpen && deferredQuery.length >= 1 && !analyzing;

  function exportWolfBrief() {
    if (!activeSymbol || (!analysis && !quant && !todayRead) || typeof window === "undefined") return;
    const reportWindow = window.open("", "_blank", "width=1080,height=900");
    if (!reportWindow) return;

    const escapeHtml = (value: string) => value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const bullets = (analysis?.bullets ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const quantChecks = (quant?.checks ?? []).map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)} · ${escapeHtml(item.insight)}</li>`).join("");

    const html = `
      <html>
        <head>
          <title>Alpha Wolf Brief · ${escapeHtml(activeSymbol)}</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; background:#0f1013; color:#ececee; margin:0; padding:32px; }
            .wrap { max-width: 940px; margin: 0 auto; }
            .brand { display:flex; align-items:center; gap:10px; color:#3ecf8e; text-transform:uppercase; letter-spacing:.16em; font-size:12px; }
            h1,h2,h3 { margin:0; }
            h1 { font-size:34px; margin-top:10px; }
            .muted { color:#9a9aa3; }
            .grid { display:grid; gap:16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top:20px; }
            .card { border:1px solid #2a2a31; background:#161619; border-radius:18px; padding:18px; }
            .label { color:#7d7d86; font-size:11px; text-transform:uppercase; letter-spacing:.16em; margin-bottom:8px; }
            .value { font-size:28px; font-weight:700; }
            .section { margin-top:22px; }
            ul { margin:10px 0 0 18px; padding:0; }
            li { margin:8px 0; }
            .pill { display:inline-block; border:1px solid #2a2a31; border-radius:999px; padding:6px 10px; margin-top:8px; }
            .good { color:#3ecf8e; }
            .warn { color:#f5c451; }
            .bad { color:#f2575c; }
            @media print { body { background:#fff; color:#111; } .card { break-inside: avoid; background:#fff; } .muted,.label { color:#555; } }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="brand">Alpha Wolf · Wolf Brief</div>
            <h1>${escapeHtml(activeSymbol)}${detail?.stock.name ? ` · ${escapeHtml(detail.stock.name)}` : ""}</h1>
            <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>

            <div class="grid">
              <div class="card">
                <div class="label">Current price</div>
                <div class="value">${escapeHtml(formatCurrency(detail?.stock.price, quoteCurrency))}</div>
              </div>
              <div class="card">
                <div class="label">Today</div>
                <div class="value">${escapeHtml(formatPercent(detail?.stock.changePct))}</div>
              </div>
            </div>

            ${analysis ? `
              <div class="section card">
                <div class="label">AI Analyst</div>
                <h2>${escapeHtml(analysis.headline)}</h2>
                <div class="pill ${analysis.tone}">${escapeHtml(analysis.signal)} · ${analysis.confidence}/100 conviction</div>
                <p>${escapeHtml(analysis.summary)}</p>
                <p><strong>Target:</strong> ${escapeHtml(formatCurrency(analysis.targetPrice?.targetPrice ?? undefined, quoteCurrency))}</p>
                <p><strong>Buy near:</strong> ${escapeHtml(formatCurrency(analysis.entryPrice?.entryPrice ?? undefined, quoteCurrency))}</p>
                <p><strong>Why:</strong> ${escapeHtml(analysis.targetPrice?.basis ?? "")}</p>
                ${bullets ? `<ul>${bullets}</ul>` : ""}
              </div>
            ` : ""}

            ${todayRead ? `
              <div class="section card">
                <div class="label">Today Performance AI</div>
                <h2>${escapeHtml(todayRead.headline)}</h2>
                <div class="pill ${todayRead.tone}">${escapeHtml(todayRead.signal)} · ${todayRead.buyScore}/100 buy score</div>
                <p>${escapeHtml(todayRead.summary)}</p>
                <p><strong>Session read:</strong> ${escapeHtml(todayRead.sessionRead)}</p>
                <p><strong>What changed:</strong> ${escapeHtml(todayRead.whatChangedToday)}</p>
                <p><strong>Key level:</strong> ${escapeHtml(todayRead.keyLevel)}</p>
                <p><strong>Action:</strong> ${escapeHtml(todayRead.action)}</p>
                <p><strong>Risk:</strong> ${escapeHtml(todayRead.risk)}</p>
              </div>
            ` : ""}

            ${quant ? `
              <div class="section card">
                <div class="label">Quant Perspective</div>
                <h2>${escapeHtml(quant.hook)}</h2>
                <div class="pill ${quant.tone}">${escapeHtml(quant.investability)} · ${quant.buyScore}/100 buy score</div>
                <p>${escapeHtml(quant.summary)}</p>
                <p><strong>Buy plan:</strong> ${escapeHtml(quant.buyPlan)}</p>
                <p><strong>Setup:</strong> ${escapeHtml(quant.setup)}</p>
                <p><strong>Trigger:</strong> ${escapeHtml(quant.trigger)}</p>
                <p><strong>Risk:</strong> ${escapeHtml(quant.risk)}</p>
                ${quantChecks ? `<ul>${quantChecks}</ul>` : ""}
              </div>
            ` : ""}
          </div>
          <script>setTimeout(() => window.print(), 200);</script>
        </body>
      </html>
    `;

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
  }

  return (
    <section className="flex flex-col gap-5 text-[#ececee]">
      <div className={`${panel} p-5`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[280px] flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Target price desk</div>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.04em]">Ask AI where this stock could go next.</h2>
            <p className="mt-2 max-w-[760px] text-sm leading-[1.65] text-[#8c8c95]">
              We send the live technicals, business snapshot, financial quality, performance, benchmark comparison, sector context, and event timing into the analyst request only when you ask.
            </p>
          </div>
          <div className="rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Selected strategy</div>
            <div className="mt-1 text-base font-semibold text-[#3ecf8e]">{strategyLabels[strategy]}</div>
            <div className="mt-1 max-w-[220px] text-xs leading-[1.5] text-[#8c8c95]">{strategyDescriptions[strategy]}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <div ref={searchBoxRef} className="relative min-w-[260px] flex-1">
            <input
              value={draftSymbol}
              onChange={(event) => setDraftSymbol(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter") void runAnalysis();
              }}
              placeholder="Search ticker or company, e.g. KO, Coca-Cola, KKP"
              className={`${input} w-full`}
            />
            {showSuggestions ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-[#2a2a31] bg-[#0e0e10] shadow-[0_18px_50px_rgba(0,0,0,.45)]">
                {searchQuery.isFetching ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-[#8c8c95]">
                    <LoadingSpinner size={12} />
                    Searching stocks…
                  </div>
                ) : null}
                {!searchQuery.isFetching && suggestions.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      setDraftSymbol(item.symbol);
                      setSelectedSymbol(item.symbol);
                      setSearchOpen(false);
                    }}
                    className="grid w-full grid-cols-[1fr_auto] gap-3 border-t border-[#1f1f24] px-4 py-3 text-left first:border-t-0 hover:bg-[#161619]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-[#ececee]">{item.symbol}</span>
                        <span className="rounded-md border border-[#2a2a31] px-2 py-0.5 text-[10px] text-[#8c8c95]">
                          {item.symbol.endsWith(".BK") ? "Thai SET" : "US"}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[#8c8c95]">{item.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs text-[#ececee]">{item.price != null ? formatCurrency(item.price, item.currency ?? "USD") : "—"}</div>
                      <div className={`mt-1 font-mono text-[11px] ${(item.changePct ?? 0) >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>
                        {item.changePct != null ? formatPercent(item.changePct) : "—"}
                      </div>
                    </div>
                  </button>
                ))}
                {!searchQuery.isFetching && !suggestions.length ? (
                  <div className="px-4 py-3 text-xs text-[#8c8c95]">No matching stocks found.</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={analyzing || !draftSymbol.trim()}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#3ecf8e] px-5 text-sm font-bold text-[#06120c] disabled:opacity-40"
          >
            {analyzing ? <LoadingSpinner size={14} /> : null}
            {analyzing ? "Running AI…" : "Get target price"}
          </button>
          <PremiumOutlineButton
            onClick={() => void runTodayPerformance()}
            disabled={todayLoading || !draftSymbol.trim()}
            loading={todayLoading}
            label={todayLoading ? "Reading today…" : "Ask AI for today’s move"}
          />
          <a
            href={tradingViewUrl || undefined}
            target="_blank"
            rel="noreferrer"
            className={`flex h-12 items-center gap-2 rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-5 text-sm font-semibold text-[#ececee] ${tradingViewUrl ? "hover:border-[#3ecf8e] hover:text-[#3ecf8e]" : "pointer-events-none opacity-40"}`}
          >
            Open TradingView
          </a>
          <button
            type="button"
            onClick={exportWolfBrief}
            disabled={!activeSymbol || (!analysis && !quant && !todayRead)}
            className="flex h-12 items-center gap-2 rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-5 text-sm font-semibold text-[#ececee] disabled:opacity-40 hover:border-[#74a4ff] hover:text-[#74a4ff]"
          >
            Export Wolf Brief
          </button>
        </div>

        {portfolioQuery.data?.holdings.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {portfolioQuery.data.holdings.slice(0, 8).map((holding) => (
              <button
                key={holding.symbol}
                type="button"
                onClick={() => {
                  setDraftSymbol(holding.symbol);
                  void runAnalysis(holding.symbol);
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${activeSymbol === holding.symbol ? "border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee]"}`}
              >
                {analyzing && draftSymbol === holding.symbol ? <LoadingSpinner size={12} /> : null}
                {holding.symbol}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">{error}</div>
      ) : null}

      {snapshotLoading && !analyzing ? <div className="flex items-center gap-2 rounded-lg border border-[#2a2a31] bg-[#161619] px-3 py-2 text-xs text-[#8c8c95]"><LoadingSpinner size={12} />Loading live stock snapshot…</div> : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={`${panel} ${highlightTone} overflow-hidden p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">AI target price</div>
              <div className="mt-2 text-[14px] text-[#8c8c95]">
                {(detail?.stock.symbol ?? activeSymbol) || "Pick a stock"}{detail?.stock.name ? ` · ${detail.stock.name}` : ""}
              </div>
            </div>
            {analysis?.signal ? (
              <span className="rounded-full border border-[#2a2a31] bg-[#0e0e10]/70 px-3 py-1.5 font-mono text-xs text-[#ececee]">
                {analysis.signal}
              </span>
            ) : null}
          </div>

          {analyzing ? (
            <div className="mt-12 flex items-center gap-3 text-[#8c8c95]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />
              AI is building the target from live market data…
            </div>
          ) : target ? (
            <>
              <div className="mt-8 flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-[12px] uppercase tracking-[0.18em] text-[#5a5a62]">12M target price</div>
                  <div className="mt-2 font-mono text-[52px] font-semibold leading-none tracking-[-0.05em] text-[#ececee]">
                    {formatCurrency(target.targetPrice ?? undefined, quoteCurrency)}
                  </div>
                  <div className="mt-2 max-w-[460px] text-sm text-[#8c8c95]">
                    This is the AI&apos;s forward price objective over the stated horizon, not an automatic sell-now number.
                  </div>
                </div>
                <div className="mb-1 rounded-2xl border border-[#2a2a31] bg-[#0e0e10]/80 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">Implied move</div>
                  <div className={`mt-1 font-mono text-[24px] font-semibold ${(target.impliedUpsidePct ?? 0) >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>
                    {formatPercent(target.impliedUpsidePct ?? undefined)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <AnalystMetric label="Buy near" value={formatCurrency(entry?.entryPrice ?? undefined, quoteCurrency)} />
                <AnalystMetric label="Current price" value={formatCurrency(target.currentPrice ?? undefined, quoteCurrency)} />
                <AnalystMetric label="Time horizon" value={target.timeHorizon} />
                <AnalystMetric label="AI confidence" value={`${analysis.confidence}/100`} />
              </div>

              <div className="mt-4 rounded-2xl border border-[#2a2a31] bg-[#0e0e10]/75 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">How to read this</div>
                    <p className="mt-2 text-sm leading-[1.7] text-[#cfcfd4]">
                      Buy near is the preferred entry area. 12M target is where the AI thinks the stock could trade over the horizon if the thesis plays out.
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">What it does not mean</div>
                    <p className="mt-2 text-sm leading-[1.7] text-[#cfcfd4]">
                      A higher target does not always mean buy now. If current price is well above the preferred entry, the stock can still be attractive but poorly timed today.
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Current AI stance</div>
                    <p className="mt-2 text-sm leading-[1.7] text-[#cfcfd4]">
                      {analysis.signal}: buy only when price and setup align with the suggested entry plan, rather than chasing the full target gap blindly.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#2a2a31] bg-[#0e0e10]/75 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Why this target</div>
                <p className="mt-2 text-sm leading-[1.7] text-[#cfcfd4]">{target.basis}</p>
              </div>
            </>
          ) : (
            <div className="mt-12 rounded-2xl border border-dashed border-[#2a2a31] bg-[#0e0e10]/55 p-8 text-center text-sm text-[#8c8c95]">
              Ask the AI analyst for a stock target price and we will surface the upside here.
            </div>
          )}
        </div>

        <div className="grid gap-5">
          <div className={`${panel} p-5`}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Live snapshot</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AnalystMetric label="Price now" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? formatCurrency(detail?.stock.price, quoteCurrency) : "Pick a stock"} />
              <AnalystMetric label="Today" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? formatPercent(detail?.stock.changePct) : "—"} tone={hasActiveSymbol && (detail?.stock.changePct ?? 0) >= 0 ? "good" : hasActiveSymbol ? "bad" : undefined} />
              <AnalystMetric label="Sector" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? detail?.stock.sector ?? "—" : "Pick a stock"} />
              <AnalystMetric label="Industry" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? detail?.stock.industry ?? "—" : "Pick a stock"} />
            </div>
            <div className="mt-4 rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-4 py-3 text-sm text-[#9fa0ab]">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#5a5a62]">Premium session read</div>
              <div className="mt-2 leading-[1.7] text-[#c9cada]">
                Today&apos;s move lives in the premium session layer. Use the rainbow action above to open the full intraday read with the session map, key level, and next move.
              </div>
            </div>
          </div>

          {todayRead ? (
            <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(#141418,#141418)_padding-box,linear-gradient(120deg,#8d73ff,#46d6a0,#ffd86e,#ff6d73)_border-box] border border-transparent p-5 shadow-[0_18px_60px_rgba(124,92,252,.18)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#ffffff18] bg-[linear-gradient(90deg,rgba(124,92,252,.18),rgba(62,207,142,.14),rgba(245,196,81,.16))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff3c5] shadow-[0_0_30px_rgba(124,92,252,.12)]">
                    Wolf intraday edge
                  </div>
                  <div className="mt-3 text-lg font-semibold text-[#ececee]">{todayRead.headline}</div>
                  <p className="mt-2 text-sm leading-[1.7] text-[#bdbdcc]">{todayRead.summary}</p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${todayRead.tone === "good" ? "border-[#285f48] bg-[#133025] text-[#3ecf8e]" : todayRead.tone === "bad" ? "border-[#663438] bg-[#2a1719] text-[#f2575c]" : "border-[#5a4724] bg-[#241d11] text-[#f5c451]"}`}>
                  {todayRead.buyScore}/100 buy score
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AnalystMetric label="Session read" value={todayRead.signal} />
                <AnalystMetric label="Key level" value={todayRead.keyLevel} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#9fa0ab]">Today-only read. Open the premium view for the full session breakdown and color chart.</div>
                <button
                  type="button"
                  onClick={() => setTodayModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(#111114,#111114)_padding-box,linear-gradient(90deg,#8d73ff,#46d6a0,#ffd86e,#ff6d73)_border-box] border border-transparent px-4 py-2 text-sm font-semibold text-[#f8f4ff] shadow-[0_8px_24px_rgba(124,92,252,.16)]"
                >
                  Open premium view
                </button>
              </div>
            </div>
          ) : null}

          <div className={`${panel} p-5`}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Market consensus</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AnalystMetric label="Wall St. target" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? formatCurrency(detail?.business?.targetMeanPrice ?? undefined, quoteCurrency) : "Pick a stock"} />
              <AnalystMetric label="Analyst rating" value={snapshotLoading ? "Loading…" : hasActiveSymbol ? detail?.business?.analystRating ?? "—" : "Pick a stock"} />
            </div>
          </div>
        </div>
      </div>

      {analysis ? (
        <div className="flex flex-col gap-5">
          <AiVerdictCard value={analysis} onRerun={() => void runAnalysis(activeSymbol)} size="modal" />
          <div className="overflow-hidden rounded-[28px] border border-[#4a3a12] bg-[linear-gradient(135deg,rgba(124,92,252,0.16),rgba(62,207,142,0.12),rgba(245,196,81,0.14),rgba(242,87,92,0.12))] p-[1px] shadow-[0_20px_60px_rgba(124,92,252,.12)]">
            <div className="rounded-[27px] bg-[radial-gradient(circle_at_top_left,rgba(124,92,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(62,207,142,0.10),transparent_24%),#111114] p-6">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-[780px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#ffffff1a] bg-[#ffffff0d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5c451]">
                    Deep Quant Layer
                  </div>
                  <h3 className="mt-4 text-[28px] font-bold tracking-[-0.04em] text-[#f7f7fb]">Want the deeper technical read?</h3>
                  <p className="mt-3 text-sm leading-[1.8] text-[#b9b9c4]">
                    The first AI answer tells you the price objective and base case. This second layer is the premium quant read: exact setup quality, technical trigger, failure risk, and what to inspect on TradingView before committing money.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#ffffff14] bg-[#0b0b0f]/80 px-4 py-3 text-right">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#8f8fa3]">Second AI pass</div>
                  <div className="mt-1 text-lg font-semibold text-[#f7f7fb]">Quant perspective</div>
                  <div className="mt-1 text-xs text-[#8f8fa3]">Built after the main forecast</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runQuantPerspective(activeSymbol)}
                  disabled={!activeSymbol || quantLoading}
                  className="flex h-12 items-center gap-2 rounded-xl bg-[linear-gradient(90deg,#7c5cfc,#3ecf8e,#f5c451)] px-5 text-sm font-bold text-[#08110d] shadow-[0_10px_30px_rgba(124,92,252,.18)] transition-transform hover:scale-[1.01] disabled:opacity-40"
                >
                  {quantLoading ? <LoadingSpinner size={14} /> : null}
                  {quantLoading ? "Running quant AI…" : "Unlock Quant Perspective"}
                </button>
                <div className="text-xs text-[#8f8fa3]">
                  Separate AI call focused on timing, momentum, risk, and chart confirmation.
                </div>
              </div>
            </div>
          </div>

          <QuantPerspectiveCard
            quant={quant}
            tradingViewUrl={tradingViewUrl}
            loading={quantLoading}
            detail={detail}
            analysis={analysis}
          />
        </div>
      ) : null}
      {todayModalOpen && todayRead ? (
        <TodayPerformanceModal
          onClose={() => setTodayModalOpen(false)}
          todayRead={todayRead}
          detail={detail}
          analysis={analysis}
          currency={quoteCurrency}
        />
      ) : null}
    </section>
  );
}

function AnalystMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-[#2a2a31] bg-[#0e0e10] px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">{label}</div>
      <div className={`mt-1.5 text-sm font-semibold ${tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : "text-[#ececee]"}`}>{value}</div>
    </div>
  );
}

function ActionStrip({ title, body, tone }: { title: string; body: string; tone: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good"
    ? "border-[#285f48] bg-[linear-gradient(180deg,#122219,#0f1713)] text-[#dff8ec]"
    : tone === "bad"
      ? "border-[#663438] bg-[linear-gradient(180deg,#251416,#1a1012)] text-[#ffd8da]"
      : "border-[#5a4724] bg-[linear-gradient(180deg,#241d12,#19140d)] text-[#f6e7be]";
  const { eyebrow, headline, detail, tags } = buildInsightPresentation(title, body);
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.03)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-65">{eyebrow}</div>
          <div className="mt-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.03em]">{headline}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-full border ${
          tone === "good" ? "border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e]"
          : tone === "bad" ? "border-[#f2575c]/30 bg-[#f2575c]/10 text-[#f2575c]"
          : "border-[#f5c451]/30 bg-[#f5c451]/10 text-[#f5c451]"
        }`}>
          {tone === "good" ? "↗" : tone === "bad" ? "!" : "•"}
        </div>
      </div>
      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#ffffff12] bg-[#ffffff08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] opacity-80">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 text-sm leading-[1.7] opacity-90">{detail}</div>
    </div>
  );
}

function buildInsightPresentation(title: string, body: string) {
  const cleaned = body.trim().replace(/\s+/g, " ");
  const loweredTitle = title.toLowerCase();

  let headline = cleaned;
  let detail = "";

  if (loweredTitle === "what changed today") {
    const [lead, rest] = splitOnPrimary(cleaned);
    headline = simplifyLead(lead.replace(/^nothing important changed;?\s*/i, "No structural change"));
    detail = rest || "Price stayed in range and did not force a new decision yet.";
  } else if (loweredTitle === "action") {
    const [lead, rest] = splitOnPrimary(cleaned);
    headline = simplifyLead(lead);
    detail = rest || "Wait for price to prove the next move before adding.";
  } else if (loweredTitle === "false signal risk") {
    const stripped = cleaned.replace(/^This could be misleading if\s*/i, "");
    const [lead, rest] = splitOnPrimary(stripped);
    headline = simplifyLead(lead);
    detail = rest || "A failed test at resistance could flip the read quickly.";
  } else {
    const [lead, rest] = splitOnPrimary(cleaned);
    headline = simplifyLead(lead);
    detail = rest || "The bigger trend is still intact, but the move is not accelerating yet.";
  }

  return {
    eyebrow: title,
    headline,
    detail,
    tags: extractInsightTags(body),
  };
}

function splitOnPrimary(text: string): [string, string] {
  const separator = text.match(/;|:|\.(\s|$)/);
  if (!separator || separator.index == null) return [text, ""];
  const end = separator.index + 1;
  return [text.slice(0, end).replace(/[;:.]\s*$/, "").trim(), text.slice(end).trim()];
}

function simplifyLead(text: string) {
  return text
    .replace(/^today's move is normal for a stock that has been trending up[: ]*/i, "Trend intact")
    .replace(/^hold for now[: ]*/i, "Hold for now")
    .replace(/^consider adding only /i, "Add only ")
    .replace(/^the stock remained in range and did not confirm /i, "Still waiting for ")
    .replace(/^it stayed above /i, "Above ")
    .replace(/\bthe stock\b/gi, "Name")
    .trim();
}

function extractInsightTags(text: string) {
  const tags = new Set<string>();
  const rangeMatch = text.match(/\b\d+(?:\.\d+)?-\d+(?:\.\d+)?\b/g) ?? [];
  for (const match of rangeMatch.slice(0, 2)) tags.add(match);
  const priceMatch = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const match of priceMatch.slice(0, 2)) tags.add(match);
  const keywords = ["support", "resistance", "breakout", "20-day", "50-day", "200-day", "range"];
  for (const keyword of keywords) {
    if (new RegExp(`\\b${keyword.replace("-", "\\-")}\\b`, "i").test(text)) tags.add(keyword);
  }
  return Array.from(tags).slice(0, 4);
}

function PremiumOutlineButton({
  onClick,
  disabled,
  loading,
  label,
  compact = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-xl p-[1.5px] shadow-[0_10px_26px_rgba(124,92,252,.14)] transition-transform hover:scale-[1.01] disabled:opacity-40 ${compact ? "w-full" : ""}`}
    >
      <span className="absolute inset-0 bg-[linear-gradient(90deg,#8d73ff,#46d6a0,#ffd86e,#ff6d73,#8d73ff)] opacity-95" />
      <span className={`relative flex items-center justify-center gap-2 rounded-[11px] bg-[#121216] px-5 font-bold text-[#f6f2ff] ${compact ? "h-11 w-full text-sm" : "h-12 text-sm"}`}>
        {loading ? <LoadingSpinner size={14} /> : null}
        {label}
      </span>
    </button>
  );
}

function TodayPerformanceModal({
  onClose,
  todayRead,
  detail,
  analysis,
  currency,
}: {
  onClose: () => void;
  todayRead: TodayPerformanceResponse;
  detail: StockDetailResponse | undefined;
  analysis: StockAnalysisResponse | null;
  currency: string;
}) {
  const chartData = useMemo(() => buildTodayChartData(detail, analysis), [detail, analysis]);
  const chartDomain = useMemo(() => buildTodayChartDomain(chartData, detail, analysis), [chartData, detail, analysis]);
  const latestMove = detail?.stock.changePct ?? 0;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[30px] bg-[linear-gradient(#101116,#101116)_padding-box,linear-gradient(125deg,#8d73ff,#46d6a0,#ffd86e,#ff6d73)_border-box] border border-transparent shadow-[0_30px_120px_rgba(0,0,0,.55),0_0_80px_rgba(124,92,252,.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#2a2a31] px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffffff14] bg-[linear-gradient(90deg,rgba(124,92,252,.18),rgba(62,207,142,.14),rgba(245,196,81,.16))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff3c5] shadow-[0_0_30px_rgba(124,92,252,.14)]">
              Premium today performance
            </div>
            <h2 className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-[#f4f5fb]">{todayRead.headline}</h2>
            <p className="mt-2 max-w-[760px] text-sm leading-[1.8] text-[#bfc0cb]">{todayRead.summary}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#2a2a31] bg-[#0e0e10] px-3 py-2 text-sm text-[#bfc0cb] hover:text-[#ececee]">Close</button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[26px] bg-[linear-gradient(#151621,#151621)_padding-box,linear-gradient(125deg,rgba(141,115,255,.9),rgba(70,214,160,.75),rgba(255,216,110,.82))_border-box] border border-transparent p-4 shadow-[0_12px_50px_rgba(124,92,252,.14)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#a99be7]">Session map</div>
                  <div className="mt-1 text-sm text-[#c6c7d5]">Recent price path, support, resistance, preferred entry, and 12M target.</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${latestMove >= 0 ? "border-[#285f48] bg-[#133025] text-[#3ecf8e]" : "border-[#663438] bg-[#2a1719] text-[#f2575c]"}`}>
                  {formatPercent(latestMove)} today
                </div>
              </div>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 16, right: 18, left: 2, bottom: 6 }}>
                    <defs>
                      <linearGradient id="todayGlowFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8d73ff" stopOpacity={0.48} />
                        <stop offset="45%" stopColor="#46d6a0" stopOpacity={0.24} />
                        <stop offset="70%" stopColor="#ffd86e" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#0e0e10" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#352e58" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#9c94d6", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis domain={chartDomain} tick={{ fill: "#9c94d6", fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(value) => formatCompactPrice(Number(value))} />
                    <Tooltip
                      contentStyle={{ background: "#16161c", border: "1px solid #3a3560", borderRadius: 10, color: "#ececee" }}
                      formatter={(value, name) => [formatCurrency(Number(value ?? 0), currency), String(name)]}
                    />
                    {detail?.technicals.support != null ? <ReferenceLine y={detail.technicals.support} stroke="#3ecf8e" strokeDasharray="5 5" label={{ value: `Support ${formatCompactPrice(detail.technicals.support)}`, position: "insideBottomLeft", fill: "#67e5ab", fontSize: 10, dx: 8 }} /> : null}
                    {detail?.technicals.resistance != null ? <ReferenceLine y={detail.technicals.resistance} stroke="#f5c451" strokeDasharray="5 5" label={{ value: `Resistance ${formatCompactPrice(detail.technicals.resistance)}`, position: "insideTopLeft", fill: "#ffd56f", fontSize: 10, dx: 8 }} /> : null}
                    {analysis?.entryPrice?.entryPrice != null ? <ReferenceLine y={analysis.entryPrice.entryPrice} stroke="#67e5ab" strokeDasharray="3 5" label={{ value: `Entry ${formatCompactPrice(analysis.entryPrice.entryPrice)}`, position: "right", fill: "#67e5ab", fontSize: 10 }} /> : null}
                    {analysis?.targetPrice?.targetPrice != null ? <ReferenceLine y={analysis.targetPrice.targetPrice} stroke="#b8a8ff" strokeDasharray="3 5" label={{ value: `Target ${formatCompactPrice(analysis.targetPrice.targetPrice)}`, position: "right", fill: "#b8a8ff", fontSize: 10 }} /> : null}
                    <Area type="monotone" dataKey="close" stroke="#8d73ff" strokeWidth={3} fill="url(#todayGlowFill)" />
                    <Line type="monotone" dataKey="sma20" stroke="#46d6a0" strokeWidth={2.3} dot={false} name="SMA20" />
                    <Line type="monotone" dataKey="sma50" stroke="#ffd86e" strokeWidth={2.3} dot={false} name="SMA50" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ActionStrip title="Session read" body={todayRead.sessionRead} tone={todayRead.tone} />
              <ActionStrip title="What changed today" body={todayRead.whatChangedToday} tone={todayRead.tone} />
              <ActionStrip title="Action" body={todayRead.action} tone={todayRead.tone} />
              <ActionStrip title="False signal risk" body={todayRead.risk} tone="warn" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-[linear-gradient(#111217,#111217)_padding-box,linear-gradient(125deg,rgba(141,115,255,.82),rgba(70,214,160,.62),rgba(255,216,110,.72))_border-box] border border-transparent p-4 shadow-[0_10px_40px_rgba(124,92,252,.12)]">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#5a5a62]">Today score</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-[42px] font-bold tracking-[-0.05em] text-[#f4f5fb]">{todayRead.buyScore}<span className="text-lg text-[#8c8c95]">/100</span></div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${todayRead.tone === "good" ? "border-[#285f48] bg-[#133025] text-[#3ecf8e]" : todayRead.tone === "bad" ? "border-[#663438] bg-[#2a1719] text-[#f2575c]" : "border-[#5a4724] bg-[#241d11] text-[#f5c451]"}`}>{todayRead.signal}</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <AnalystMetric label="Price now" value={formatCurrency(detail?.stock.price, currency)} />
              <AnalystMetric label="Today move" value={formatPercent(detail?.stock.changePct)} tone={(detail?.stock.changePct ?? 0) >= 0 ? "good" : "bad"} />
              <AnalystMetric label="Key level" value={todayRead.keyLevel} />
              <AnalystMetric label="Strategy lens" value={detail?.strategy ? strategyLabels[detail.strategy as keyof typeof strategyLabels] ?? "Current strategy" : "Current strategy"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuantPerspectiveCard({
  quant,
  tradingViewUrl,
  loading,
  detail,
  analysis,
}: {
  quant: QuantPerspectiveResponse | null;
  tradingViewUrl: string;
  loading: boolean;
  detail: StockDetailResponse | undefined;
  analysis: StockAnalysisResponse | null;
}) {
  const toneStyles = quant?.tone === "good"
    ? "border-[#285f48] bg-[#133025] text-[#3ecf8e]"
    : quant?.tone === "bad"
      ? "border-[#663438] bg-[#2a1719] text-[#f2575c]"
      : "border-[#5a4724] bg-[#241d11] text-[#f5c451]";
  const quantChart = useMemo(() => buildQuantChartData(detail, analysis), [detail, analysis]);
  const quantDomain = useMemo(() => buildQuantChartDomain(quantChart, detail), [quantChart, detail]);
  const support = detail?.technicals.support;
  const resistance = detail?.technicals.resistance;
  const entryPoint = analysis?.entryPrice?.entryPrice ?? null;
  const targetPoint = analysis?.targetPrice?.targetPrice ?? null;
  const tradePlan = useMemo(() => buildQuantTradePlan(detail, analysis), [detail, analysis]);

  return (
    <div className={`${panel} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Quant perspective</div>
          <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em]">Technical perspective beyond the base case</h3>
          <p className="mt-2 max-w-[820px] text-sm leading-[1.7] text-[#8c8c95]">
            This is a separate AI read focused on chart structure, timing, momentum, risk, and the exact technical signals worth checking before taking action.
          </p>
        </div>
        {quant ? <div className={`rounded-2xl border px-4 py-3 ${toneStyles}`}><div className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">Investability</div><div className="mt-1 text-lg font-semibold">{quant.investability}</div></div> : null}
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#2a2a31] bg-[#0e0e10] p-6 text-[#8c8c95]">
          <LoadingSpinner size={16} />
          Quant AI is reviewing trend, RSI, momentum, moving averages, and chart risk…
        </div>
      ) : null}

      {quant ? <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-[#2a2a31] bg-[#0e0e10] p-4">
          <div className="overflow-hidden rounded-2xl border border-[#4a4291] bg-[linear-gradient(135deg,rgba(124,92,252,0.20),rgba(62,207,142,0.10),rgba(245,196,81,0.12))] p-[1px]">
            <div className="rounded-[15px] bg-[radial-gradient(circle_at_top_left,rgba(124,92,252,0.16),transparent_34%),#131318] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#b8a8ff]">Near-term hook</div>
                  <div className="mt-2 max-w-[760px] text-[19px] font-bold leading-[1.45] tracking-[-0.02em] text-[#f5f3ff]">{quant.hook}</div>
                </div>
                <div className="rounded-full border border-[#ffffff1a] bg-[#ffffff0b] px-3 py-1.5 text-right">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#9086c8]">Timing</div>
                  <div className="mt-0.5 text-xs font-semibold text-[#f5c451]">{quant.nextActionWindow}</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-[#ffffff14] bg-[#0d0d11]/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#9086c8]">Where your buy is</div>
                <div className="mt-1 text-sm font-semibold text-[#dff8ec]">{quant.buyPlan}</div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#285f48] bg-[#0d1511] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#6fbf97]">Patient buy</div>
                    <div className="mt-1 text-lg font-semibold text-[#dff8ec]">{tradePlan.patientPriceLabel}</div>
                    <div className="mt-2 text-xs leading-[1.6] text-[#96d8b5]">{tradePlan.patientRule}</div>
                  </div>
                  <div className="rounded-xl border border-[#6b5320] bg-[#18140d] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#ffd56f]">Aggressive breakout</div>
                    <div className="mt-1 text-lg font-semibold text-[#fff1c2]">{tradePlan.breakoutPriceLabel}</div>
                    <div className="mt-2 text-xs leading-[1.6] text-[#f3dc98]">{tradePlan.breakoutRule}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs leading-[1.6] text-[#a9a9b5]">{tradePlan.styleNote}</div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#285f48] bg-[#0d1511] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#6fbf97]">AI entry point</div>
                  <div className="mt-1 text-sm font-semibold text-[#dff8ec]">
                    {entryPoint != null ? formatCurrency(entryPoint, detail?.stock.currency) : "Not available yet"}
                  </div>
                  <div className="mt-2 text-xs leading-[1.6] text-[#96d8b5]">Best risk and reward zone if price comes to you.</div>
                </div>
                <div className="rounded-xl border border-[#4a4291] bg-[#121125] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#b8a8ff]">AI target</div>
                  <div className="mt-1 text-sm font-semibold text-[#f5f3ff]">
                    {targetPoint != null ? formatCurrency(targetPoint, detail?.stock.currency) : "Not available yet"}
                  </div>
                  <div className="mt-2 text-xs leading-[1.6] text-[#d8d3f2]">12M upside case if the thesis works. Not the trigger for today&apos;s buy.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Quant read</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-[#ececee]">{quant.signal}</div>
            <div className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${toneStyles}`}>
              <span>{quant.buyScore}/100</span>
              <span className="text-[10px] uppercase tracking-[0.12em] opacity-80">Buy score</span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-[1.7] text-[#cfcfd4]">{quant.summary}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quant.checks.map((check) => (
              <div key={check.label} className="rounded-xl border border-[#2a2a31] bg-[#141417] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">{check.label}</div>
                <div className="mt-1.5 text-sm font-semibold text-[#ececee]">{check.value}</div>
                <div className={`mt-1 text-xs ${check.status === "good" ? "text-[#3ecf8e]" : check.status === "warn" ? "text-[#f5c451]" : "text-[#f2575c]"}`}>{check.insight}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-[#312c54] bg-[linear-gradient(180deg,rgba(124,92,252,0.12),rgba(16,16,20,0.92))] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[#afa3eb]">Quant plot</div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <LegendPill color="#7c5cfc" label="Price" />
                <LegendPill color="#3ecf8e" label="SMA20" />
                <LegendPill color="#f5c451" label="SMA50" />
                <LegendPill color="#f2575c" label="SMA200" />
              </div>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={quantChart} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#2b2841" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8e86c8", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                  <YAxis domain={quantDomain} tick={{ fill: "#8e86c8", fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickCount={5} tickFormatter={(value) => formatCompactPrice(Number(value))} />
                  <Tooltip
                    contentStyle={{ background: "#16161c", border: "1px solid #3a3560", borderRadius: 10, color: "#ececee" }}
                    formatter={(value, name) => [formatCurrency(Number(value ?? 0), detail?.stock.currency), String(name)]}
                  />
                  {support ? <ReferenceLine y={support} stroke="#3ecf8e" strokeDasharray="5 5" label={{ value: `Support ${formatCompactPrice(support)}`, position: "insideBottomLeft", fill: "#67e5ab", fontSize: 10, dx: 8 }} /> : null}
                  {resistance ? <ReferenceLine y={resistance} stroke="#f5c451" strokeDasharray="5 5" label={{ value: `Resistance ${formatCompactPrice(resistance)}`, position: "insideTopLeft", fill: "#ffd56f", fontSize: 10, dx: 8 }} /> : null}
                  {entryPoint != null ? <ReferenceLine y={entryPoint} stroke="#67e5ab" strokeDasharray="3 5" label={{ value: `Entry ${formatCompactPrice(entryPoint)}`, position: "right", fill: "#67e5ab", fontSize: 10 }} /> : null}
                  {targetPoint != null ? <ReferenceLine y={targetPoint} stroke="#b8a8ff" strokeDasharray="3 5" label={{ value: `Target ${formatCompactPrice(targetPoint)}`, position: "right", fill: "#b8a8ff", fontSize: 10 }} /> : null}
                  <Line type="monotone" dataKey="close" stroke="#7c5cfc" strokeWidth={2.5} dot={false} name="Price" />
                  <Line type="monotone" dataKey="sma20" stroke="#3ecf8e" strokeWidth={1.8} dot={false} name="SMA20" />
                  <Line type="monotone" dataKey="sma50" stroke="#f5c451" strokeWidth={1.8} dot={false} name="SMA50" />
                  <Line type="monotone" dataKey="sma200" stroke="#f2575c" strokeWidth={1.8} dot={false} name="SMA200" />
                  <Line type="monotone" dataKey="projection" stroke="#c5b7ff" strokeWidth={2} strokeDasharray="7 5" dot={false} connectNulls name="AI projection" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2a2a31] bg-[#0e0e10] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7c72b9]">What to watch next</div>
          <div className="mt-3 space-y-3 text-sm text-[#cfcfd4]">
            <div className="rounded-xl border border-[#2f5f47] bg-[linear-gradient(135deg,rgba(62,207,142,0.12),rgba(62,207,142,0.03))] px-4 py-3">
              <div className="font-semibold text-[#67e5ab]">Setup</div>
              <div className="mt-1 text-[#c7f4dc]">{quant.setup}</div>
            </div>
            <div className="rounded-xl border border-[#6b5320] bg-[linear-gradient(135deg,rgba(245,196,81,0.14),rgba(245,196,81,0.04))] px-4 py-3">
              <div className="font-semibold text-[#ffd56f]">Trigger</div>
              <div className="mt-1 text-[#f8e8bc]">{quant.trigger}</div>
            </div>
            <div className="rounded-xl border border-[#6a373b] bg-[linear-gradient(135deg,rgba(242,87,92,0.16),rgba(242,87,92,0.05))] px-4 py-3">
              <div className="font-semibold text-[#ff8d92]">Risk</div>
              <div className="mt-1 text-[#ffd3d5]">{quant.risk}</div>
            </div>
            <div className="rounded-xl border border-[#4a4291] bg-[linear-gradient(135deg,rgba(124,92,252,0.18),rgba(124,92,252,0.05))] px-4 py-3">
              <div className="font-semibold text-[#b9a7ff]">TradingView focus</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[#dfd7ff] marker:text-[#a992ff]">
                {quant.tradingViewFocus.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <a
              href={tradingViewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-[#3e4b8d] bg-[linear-gradient(135deg,rgba(124,92,252,0.18),rgba(62,207,142,0.10),rgba(245,196,81,0.10))] px-4 py-3 hover:border-[#7c5cfc]"
            >
              <div>
                <div className="font-semibold text-[#f4f1ff]">Open full chart in TradingView</div>
                <div className="mt-1 text-xs text-[#d6d0ef]">Check structure, volume, and your own indicators on the live chart.</div>
              </div>
              <span className="text-sm font-semibold text-[#f5c451]">Open</span>
            </a>
          </div>
        </div>
        </div>
      </div> : null}
    </div>
  );
}

function buildQuantChartData(detail: StockDetailResponse | undefined, analysis: StockAnalysisResponse | null) {
  const history = detail?.history ?? [];
  const trimmed = history.slice(-90);
  const closes = trimmed.map((point) => point.close ?? 0);
  const base = trimmed.map((point, index) => ({
    label: point.date.slice(5),
    close: point.close,
    sma20: rollingAverage(closes, index, 20),
    sma50: rollingAverage(closes, index, 50),
    sma200: rollingAverage(closes, index, 200),
    projection: null as number | null,
  }));
  if (!base.length) return base;

  const currentClose = base[base.length - 1].close;
  const targetPrice = analysis?.targetPrice?.targetPrice ?? null;
  if (targetPrice != null) {
    base[base.length - 1] = { ...base[base.length - 1], projection: currentClose };
    base.push({
      label: "Target",
      close: null as unknown as number,
      sma20: null,
      sma50: null,
      sma200: null,
      projection: targetPrice,
    });
  }
  return base;
}

function buildTodayChartData(detail: StockDetailResponse | undefined, analysis: StockAnalysisResponse | null) {
  const history = detail?.history ?? [];
  const trimmed = history.slice(-30);
  const closes = trimmed.map((point) => point.close ?? 0);
  return trimmed.map((point, index) => ({
    label: point.date.slice(5),
    close: point.close,
    sma20: rollingAverage(closes, index, 20),
    sma50: rollingAverage(closes, index, 50),
    entry: analysis?.entryPrice?.entryPrice ?? null,
    target: analysis?.targetPrice?.targetPrice ?? null,
  }));
}

function buildTodayChartDomain(
  points: Array<{ close: number; sma20: number | null; sma50: number | null }>,
  detail: StockDetailResponse | undefined,
  analysis: StockAnalysisResponse | null,
): [number, number] {
  const values = points.flatMap((point) => [point.close, point.sma20, point.sma50]).filter((value): value is number => value != null && Number.isFinite(value));
  if (detail?.technicals.support != null) values.push(detail.technicals.support);
  if (detail?.technicals.resistance != null) values.push(detail.technicals.resistance);
  if (analysis?.entryPrice?.entryPrice != null) values.push(analysis.entryPrice.entryPrice);
  if (analysis?.targetPrice?.targetPrice != null) values.push(analysis.targetPrice.targetPrice);
  if (!values.length) return [0, 100];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.06, 1);
  const padding = span * 0.18;
  return [Math.max(0, min - padding), max + padding];
}

function buildQuantChartDomain(
  points: Array<{ close: number; sma20: number | null; sma50: number | null; sma200: number | null }>,
  detail: StockDetailResponse | undefined,
): [number, number] {
  const values = points.flatMap((point) => [point.close, point.sma20, point.sma50, point.sma200]).filter((value): value is number => value != null && Number.isFinite(value));
  if (detail?.technicals.support != null) values.push(detail.technicals.support);
  if (detail?.technicals.resistance != null) values.push(detail.technicals.resistance);
  if (!values.length) return [0, 100];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.08, 1);
  const padding = span * 0.18;
  return [min - padding, max + padding];
}

function rollingAverage(values: number[], index: number, window: number) {
  const start = Math.max(0, index - window + 1);
  const slice = values.slice(start, index + 1).filter((value) => Number.isFinite(value));
  if (!slice.length) return null;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function formatCompactPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff14] bg-[#ffffff08] px-2 py-1 text-[#d8d3f2]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function buildTradingViewUrl(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.endsWith(".BK")) {
    return `https://www.tradingview.com/symbols/SET-${normalized.replace(".BK", "")}/`;
  }
  return `https://www.tradingview.com/symbols/NYSE-${normalized}/`;
}

function buildQuantTradePlan(detail: StockDetailResponse | undefined, analysis: StockAnalysisResponse | null) {
  const currency = detail?.stock.currency;
  const currentPrice = detail?.stock.price ?? analysis?.targetPrice?.currentPrice ?? null;
  const entryPrice = analysis?.entryPrice?.entryPrice ?? detail?.technicals.support ?? null;
  const support = detail?.technicals.support ?? entryPrice;
  const breakoutPrice = detail?.technicals.resistance ?? currentPrice ?? entryPrice;
  const avgVolume = detail?.technicals.avgVolume ?? null;
  const volumeMultiple = 1.2;
  const breakoutVolume = avgVolume != null ? Math.round(avgVolume * volumeMultiple) : null;

  const patientPriceLabel = entryPrice != null ? formatCurrency(entryPrice, currency) : "Wait for pullback";
  const breakoutPriceLabel = breakoutPrice != null ? formatCurrency(breakoutPrice, currency) : "Wait for breakout";

  const patientRule = entryPrice != null
    ? `Preferred entry zone. Buy closer to ${formatCurrency(entryPrice, currency)}${support != null ? ` while price still holds above ${formatCurrency(support, currency)} support` : ""}.`
    : "Wait for price to come back into a lower-risk entry area before adding.";

  const breakoutRule = breakoutPrice != null
    ? breakoutVolume != null && avgVolume != null
      ? `Only buy if the day closes above ${formatCurrency(breakoutPrice, currency)} and volume is at least ${formatNumber(breakoutVolume)} shares, which is 1.2x the 20-day average of ${formatNumber(avgVolume)}.`
      : `Only buy if the day closes above ${formatCurrency(breakoutPrice, currency)} with clearly stronger-than-normal volume.`
    : "Wait for a clean breakout above resistance before chasing momentum.";

  const styleNote = entryPrice != null && breakoutPrice != null
    ? `Patient means waiting nearer ${formatCurrency(entryPrice, currency)} for better risk and reward. Aggressive means paying up above ${formatCurrency(breakoutPrice, currency)} only after momentum is confirmed.`
    : "Patient means waiting for a better price. Aggressive means buying only after momentum clearly confirms the move.";

  return {
    patientPriceLabel,
    breakoutPriceLabel,
    patientRule,
    breakoutRule,
    styleNote,
  };
}
