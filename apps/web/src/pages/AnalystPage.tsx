import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { strategyLabels } from "../data/market";
import { loadPortfolio, loadStockDetail, summarizeStock, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

const panel = "rounded-2xl border border-[#2a2a31] bg-[#161619]";
const input = "h-12 rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-4 text-sm text-[#ececee] outline-none focus:border-[#3ecf8e]";

export function AnalystPage() {
  const strategy = useWolfStore((state) => state.selectedStrategy);
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const setSelectedSymbol = useWolfStore((state) => state.setSelectedSymbol);
  const [draftSymbol, setDraftSymbol] = useState(selectedSymbol);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const activeSymbol = selectedSymbol || portfolioQuery.data?.holdings[0]?.symbol || "";
  const detailQuery = useQuery({
    queryKey: ["analyst-detail", activeSymbol, strategy],
    queryFn: () => loadStockDetail(activeSymbol, strategy),
    enabled: Boolean(activeSymbol),
  });

  useEffect(() => {
    if (!selectedSymbol && portfolioQuery.data?.holdings[0]?.symbol) {
      const symbol = portfolioQuery.data.holdings[0].symbol;
      setSelectedSymbol(symbol);
      setDraftSymbol(symbol);
    }
  }, [portfolioQuery.data, selectedSymbol, setSelectedSymbol]);

  useEffect(() => {
    if (selectedSymbol) setDraftSymbol(selectedSymbol);
  }, [selectedSymbol]);

  async function runAnalysis(symbolOverride?: string) {
    const nextSymbol = (symbolOverride ?? draftSymbol).trim().toUpperCase();
    if (!nextSymbol) return;
    setSelectedSymbol(nextSymbol);
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

  const detail = detailQuery.data;
  const target = analysis?.targetPrice;
  const quoteCurrency = detail?.stock.currency ?? "USD";
  const highlightTone = (analysis?.tone ?? "warn") === "good" ? "border-[#285f48] bg-[radial-gradient(circle_at_top_left,rgba(62,207,142,0.18),transparent_42%),#161619]" : (analysis?.tone ?? "warn") === "bad" ? "border-[#663438] bg-[radial-gradient(circle_at_top_left,rgba(242,87,92,0.15),transparent_42%),#161619]" : "border-[#5a4724] bg-[radial-gradient(circle_at_top_left,rgba(245,196,81,0.13),transparent_42%),#161619]";

  return (
    <section className="flex flex-col gap-5 text-[#ececee]">
      <div className={`${panel} p-5`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[280px] flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Target price desk</div>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.04em]">Ask AI where this stock could go next.</h2>
            <p className="mt-2 max-w-[760px] text-sm leading-[1.65] text-[#8c8c95]">
              We send the live technicals, business snapshot, performance, benchmark comparison, sector context, and dividend timing into the analyst request only when you ask.
            </p>
          </div>
          <div className="rounded-xl border border-[#2a2a31] bg-[#0e0e10] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Strategy lens</div>
            <div className="mt-1 text-base font-semibold text-[#3ecf8e]">{strategyLabels[strategy]}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <input
            value={draftSymbol}
            onChange={(event) => setDraftSymbol(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runAnalysis();
            }}
            placeholder="Enter ticker, e.g. KO or KKP.BK"
            className={`${input} min-w-[260px] flex-1`}
          />
          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={analyzing || !draftSymbol.trim()}
            className="h-12 rounded-xl bg-[#3ecf8e] px-5 text-sm font-bold text-[#06120c] disabled:opacity-40"
          >
            {analyzing ? "Running AI…" : "Get target price"}
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
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${activeSymbol === holding.symbol ? "border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#0e0e10] text-[#8c8c95] hover:text-[#ececee]"}`}
              >
                {holding.symbol}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-[#663438] bg-[#2c1719] px-4 py-3 text-sm text-[#f2575c]">{error}</div>
      ) : null}

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
                  <div className="text-[12px] uppercase tracking-[0.18em] text-[#5a5a62]">Target</div>
                  <div className="mt-2 font-mono text-[52px] font-semibold leading-none tracking-[-0.05em] text-[#ececee]">
                    {formatCurrency(target.targetPrice ?? undefined, quoteCurrency)}
                  </div>
                </div>
                <div className="mb-1 rounded-2xl border border-[#2a2a31] bg-[#0e0e10]/80 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#5a5a62]">Implied move</div>
                  <div className={`mt-1 font-mono text-[24px] font-semibold ${(target.impliedUpsidePct ?? 0) >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>
                    {formatPercent(target.impliedUpsidePct ?? undefined)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <AnalystMetric label="Current price" value={formatCurrency(target.currentPrice ?? undefined, quoteCurrency)} />
                <AnalystMetric label="Time horizon" value={target.timeHorizon} />
                <AnalystMetric label="AI confidence" value={`${analysis.confidence}/100`} />
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
              <AnalystMetric label="Price now" value={formatCurrency(detail?.stock.price, quoteCurrency)} />
              <AnalystMetric label="Today" value={formatPercent(detail?.stock.changePct)} tone={(detail?.stock.changePct ?? 0) >= 0 ? "good" : "bad"} />
              <AnalystMetric label="Sector" value={detail?.stock.sector ?? "—"} />
              <AnalystMetric label="Industry" value={detail?.stock.industry ?? "—"} />
            </div>
          </div>

          <div className={`${panel} p-5`}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Market consensus</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AnalystMetric label="Wall St. target" value={formatCurrency(detail?.business?.targetMeanPrice ?? undefined, quoteCurrency)} />
              <AnalystMetric label="Analyst rating" value={detail?.business?.analystRating ?? "—"} />
            </div>
          </div>
        </div>
      </div>

      {analysis ? <AiVerdictCard value={analysis} onRerun={() => void runAnalysis(activeSymbol)} size="modal" /> : null}
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
