import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AiVerdictCard } from "../../components/AiVerdictCard";
import { AgentByline } from "../../components/agents/AgentByline";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PremiumAiButton } from "../../components/PremiumAiButton";
import { TickerPerformanceChart } from "../../components/charts/TickerPerformanceChart";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { formatBig, formatCurrency, formatMoney, formatMultiple, formatNumber, formatPercent, formatShortDate } from "../../lib/format";
import { loadMarketComparison, loadPortfolio, loadQuantPerspective, loadStockDetail, loadStockResearch, saveHolding, summarizeStock, type MarketComparisonResponse, type QuantPerspectiveResponse, type StockAnalysisResponse, type StockDetailResponse, type StockNewsItem, type StockResearchResponse } from "../../lib/api";
import { negative, panel, positive } from "../../lib/ui";
import { useWolfStore } from "../../store/useWolfStore";
import { agentLoadingTitle, PremiumLoading } from "../hunt-ai/ui";

const returnWindows = ["ytd", "1y", "2y", "3y", "4y"] as const;
type ResearchTab = "overview" | "consensus" | "financials" | "calendar" | "market" | "news";
type ReturnWindow = (typeof returnWindows)[number];

export function StockDetailDrawer() {
  const selectedSymbol = useWolfStore((state) => state.selectedSymbol);
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const selectedMode = useWolfStore((state) => state.selectedMode);
  const activeAgentId = useWolfStore((state) => state.activeAgentId);
  const detailOpen = useWolfStore((state) => state.detailOpen);
  const closeDetail = useWolfStore((state) => state.closeDetail);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [huntAdvice, setHuntAdvice] = useState<QuantPerspectiveResponse | null>(null);
  const [huntLoading, setHuntLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ResearchTab>("overview");
  const [research, setResearch] = useState<StockResearchResponse | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [market, setMarket] = useState<MarketComparisonResponse | null>(null);
  const [addStatus, setAddStatus] = useState("");
  const drawerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["stock-detail", selectedSymbol, selectedStrategy, selectedMode],
    queryFn: () => loadStockDetail(selectedSymbol, selectedStrategy, selectedMode ?? undefined),
    enabled: detailOpen && Boolean(selectedSymbol)
  });
  const detail = detailQuery.data ?? null;
  const loading = detailQuery.isPending && detailOpen;
  const planQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio, enabled: detailOpen });
  const portfolioHolding = planQuery.data?.holdings.find((item) => item.symbol === selectedSymbol);
  const addHoldingMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Stock detail is not loaded.");
      const price = detail.stock.price;
      if (!Number.isFinite(price) || price <= 0) throw new Error("This stock does not have a valid live price.");
      const portfolio = planQuery.data ?? await loadPortfolio();
      const existing = portfolio.holdings.find((holding) => holding.symbol === detail.stock.symbol);
      const boughtShares = 1;
      const totalShares = (existing?.shares ?? 0) + boughtShares;
      const totalCost = (existing?.shares ?? 0) * (existing?.averageCost ?? 0) + price * boughtShares;
      return saveHolding({
        symbol: detail.stock.symbol,
        shares: totalShares,
        averageCost: totalCost / totalShares,
        strategy: existing?.strategy ?? selectedStrategy,
        monthlyDca: existing?.monthlyDca ?? 0,
      });
    },
    onMutate: () => setAddStatus(""),
    onSuccess: () => {
      setAddStatus("Added 1 share to portfolio.");
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (err) => {
      setAddStatus(err instanceof Error ? err.message : "Could not add this stock to portfolio.");
    },
  });

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    drawerRef.current?.scrollTo({ top: 0 });
    setError("");
    setAnalysis(null);
    setHuntAdvice(null);
    setResearch(null);
    setTab("overview");
    setMarket(null);
    setAddStatus("");
  }, [detailOpen, selectedSymbol]);

  useEffect(() => {
    setAnalysis(null);
    setHuntAdvice(null);
  }, [activeAgentId]);

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDetail(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [detailOpen, closeDetail]);

  async function analyze() {
    if (!selectedSymbol) return;
    setError("");
    setAnalyzing(true);
    try {
      setAnalysis(await summarizeStock(selectedSymbol, selectedStrategy, activeAgentId));
    } catch {
      setError("AI analysis is unavailable. Check the API configuration.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runAlphaHunt() {
    if (!selectedSymbol) return;
    setError("");
    setHuntLoading(true);
    try {
      setHuntAdvice(await loadQuantPerspective(selectedSymbol, selectedStrategy, selectedMode ?? undefined, activeAgentId));
    } catch {
      setError("Alpha Hunt is unavailable. Check the API configuration.");
    } finally {
      setHuntLoading(false);
    }
  }

  async function selectTab(nextTab: ResearchTab) {
    setTab(nextTab);
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    if (nextTab === "overview" || !selectedSymbol) return;
    setResearchLoading(true);
    try {
      if (nextTab === "market") {
        if (!market) setMarket(await loadMarketComparison(selectedSymbol));
      } else if (!research) {
        setResearch(await loadStockResearch(selectedSymbol));
      }
    } catch { setError("The extended yfinance research feed is unavailable."); } finally { setResearchLoading(false); }
  }

  return (
    <>
      <button type="button" aria-label="Close stock detail" onClick={closeDetail} className={`aw-overlay fixed inset-0 z-30 bg-slate-900/30 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside ref={drawerRef} onClick={closeDetail} className={`aw-drawer fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-6 py-8 transition-opacity ${detailOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-label="Stock detail panel">
        <div onClick={(event) => event.stopPropagation()} className="relative min-w-0 w-full max-w-[940px] overflow-hidden rounded-2xl border border-[#2a2a31] bg-[#0e0e10] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <DrawerHeader
            detail={detail}
            symbol={selectedSymbol}
            holdingShares={portfolioHolding?.shares}
            adding={addHoldingMutation.isPending}
            onAdd={() => addHoldingMutation.mutate()}
            onClose={closeDetail}
          />
          <div className="flex min-w-0 max-h-[calc(100vh-180px)] flex-col gap-4 overflow-x-hidden overflow-y-auto p-[22px]">
            {loading ? <DetailSkeleton symbol={selectedSymbol} /> : null}
            {detailQuery.isError ? <div className={`${panel} flex items-center justify-between text-sm text-[#f2575c]`}>Unable to load live stock detail.<button type="button" disabled={detailQuery.isFetching} onClick={() => detailQuery.refetch()} className="flex items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">{detailQuery.isFetching ? <LoadingSpinner size={12} /> : null}Retry</button></div> : null}
            {error ? <div className={`${panel} text-sm text-rose-600`}>{error}</div> : null}
            {addStatus ? <div className={`${panel} text-sm ${addHoldingMutation.isError ? "text-[#f2575c]" : "text-[#3ecf8e]"}`}>{addStatus}</div> : null}
            {detail && !loading ? <>
              {analyzing || analysis ? <AiGate symbol={detail.stock.symbol} analysis={analysis} analyzing={analyzing} onAnalyze={analyze} activeAgentId={activeAgentId} /> : null}
              <QuickReadCard detail={detail} analysis={analysis} />
              <ResearchTabs ref={tabsRef} active={tab} onSelect={selectTab} />
              {tab === "overview" ? <DetailContent detail={detail} huntAdvice={huntAdvice} huntLoading={huntLoading} onHunt={runAlphaHunt} /> : tab === "news" ? <NewsSection detail={detail} research={research} researchLoading={researchLoading} /> : researchLoading ? <DetailSkeleton symbol={selectedSymbol} /> : tab === "market" ? <MarketResearch market={market} analyzing={analyzing} onAnalyze={analyze} /> : <ResearchContent tab={tab} research={research} detail={detail} />}
            </> : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function ResearchTabs({ ref, active, onSelect }: { ref: React.Ref<HTMLDivElement>; active: ResearchTab; onSelect: (tab: ResearchTab) => void }) {
  const tabs: Array<{ key: ResearchTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "consensus", label: "Analysis" },
    { key: "financials", label: "Financials" },
    { key: "calendar", label: "Calendar" },
    { key: "market", label: "Market" },
    { key: "news", label: "News" },
  ];
  return (
    <div ref={ref} className="grid min-w-0 grid-cols-6 gap-1 rounded-[10px] border border-[#2a2a31] bg-[#111113]/95 p-1 backdrop-blur">
      {tabs.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={`rounded-[7px] px-2 py-2 text-center transition-colors hover:bg-[#161619] ${isActive ? "bg-[#1c1c20]" : ""}`}
          >
            <TabIcon tab={item.key} active={isActive} />
            <span className={`mt-0.5 block text-[10.5px] font-semibold ${isActive ? "text-[#3ecf8e]" : "text-[#8c8c95]"}`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TabIcon({ tab, active }: { tab: ResearchTab; active: boolean }) {
  const stroke = active ? "#3ecf8e" : "#5a5a62";
  if (tab === "overview") {
    return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.3" stroke={stroke} strokeWidth="1.4"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.3" stroke={stroke} strokeWidth="1.4"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.3" stroke={stroke} strokeWidth="1.4"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.3" stroke={stroke} strokeWidth="1.4"/></svg>;
  }
  if (tab === "consensus") {
    return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><circle cx="8" cy="6.5" r="4" stroke={stroke} strokeWidth="1.4"/><path d="M5.5 10l-1.5 4M10.5 10l1.5 4M6.2 14h3.6" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"/></svg>;
  }
  if (tab === "financials") {
    return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><path d="M2 13V9l2.5-2.5 3 2.5 3-5L14 8V13H2z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round"/></svg>;
  }
  if (tab === "calendar") {
    return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><rect x="1.5" y="2.5" width="13" height="11.5" rx="1.5" stroke={stroke} strokeWidth="1.4"/><path d="M1.5 6.5h13M5 1v3M11 1v3" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/></svg>;
  }
  if (tab === "news") {
    return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><path d="M3 2.5h8.5A1.5 1.5 0 0 1 13 4v9.5H4.5A1.5 1.5 0 0 1 3 12V2.5z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/></svg>;
  }
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mx-auto"><path d="M1.5 11l4-5 3 3 4-6 2.5 3" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function QuickReadCard({ detail, analysis }: { detail: StockDetailResponse; analysis: StockAnalysisResponse | null }) {
  const score = detail.verdict?.score ?? analysis?.confidence ?? 0;
  const yieldValue = detail.business?.dividendYield;
  const pe = detail.business?.peRatio;
  const oneYear = detail.performance?.returns?.["1y"] ?? detail.business?.oneYearReturn;
  const quickRead = analysis?.summary
    ?? `${detail.stock.symbol} is trading at ${formatCurrency(detail.stock.price, detail.stock.currency)} with ${formatPercent(detail.stock.changePct)} today. ${yieldValue != null ? `Dividend yield is ${formatPercent(yieldValue)}. ` : ""}${pe != null ? `P/E is ${formatMultiple(pe)}. ` : ""}${oneYear != null ? `One-year return is ${formatPercent(oneYear)}. ` : ""}Use the tabs below to inspect valuation, analyst view, calendar, and market-relative performance.`;
  const used = Math.min(5, Math.max(1, Math.round(score / 20)));
  const pct = `${(used / 5) * 100}%`;
  const color = score >= 70 ? "#3ecf8e" : score >= 45 ? "#f5c451" : "#f2575c";

  return (
    <div className="overflow-hidden rounded-xl border border-[#3ecf8e]/20 bg-[linear-gradient(135deg,rgba(62,207,142,0.04),rgba(77,150,255,0.03))]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3ecf8e]/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.6 4.3L14 7l-4.4 1.2L8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5z" fill="#3ecf8e"/></svg>
          <span className="text-[11.5px] font-bold tracking-[0.2px] text-[#3ecf8e]">AI Quick Read</span>
          <span className="rounded bg-[#3ecf8e]/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.6px] text-[#3ecf8e] ring-1 ring-[#3ecf8e]/20">LIVE DATA</span>
          <div className="flex items-center gap-1.5 rounded-[5px] border border-[#2a2a31] bg-black/30 px-2 py-1">
            <div className="h-[3px] w-10 overflow-hidden rounded bg-[#1c1c20]"><div className="h-full rounded" style={{ width: pct, background: color }} /></div>
            <span className="font-mono text-[10px] text-[#8c8c95]">{used}/5 signals</span>
          </div>
        </div>
        <span className="font-mono text-[10.5px] text-[#5a5a62]">AI only runs when requested</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[13px] leading-[1.7] text-[#cfcfd4]">{quickRead}</div>
      </div>
    </div>
  );
}

const REC_SEGMENTS: Array<{ key: string; label: string; color: string }> = [
  { key: "strongBuy", label: "Strong buy", color: "#3ecf8e" },
  { key: "buy", label: "Buy", color: "#74a4ff" },
  { key: "hold", label: "Hold", color: "#f5c451" },
  { key: "sell", label: "Sell", color: "#f2575c" },
  { key: "strongSell", label: "Strong sell", color: "#b03038" },
];

function MarketResearch({ market, analyzing, onAnalyze }: { market: MarketComparisonResponse | null; analyzing: boolean; onAnalyze: () => void }) {
  if (!market) return <div className={panel}>No market comparison was reported.</div>;
  const gap = market.stock.returnPct - market.benchmark.returnPct;
  const beating = gap >= 0;
  return <div className="flex flex-col gap-[14px]">
    <div className={`${panel} p-[18px]`}>
      <div className="flex items-start justify-between gap-5"><div><h3 className={`text-lg font-bold ${beating ? "text-[#3ecf8e]" : "text-[#f5c451]"}`}>{market.stock.symbol} is {beating ? "beating" : "lagging"} the market</h3><p className="mt-1 text-[13px] text-[#8c8c95]">Total return, last 12 months · every series rebased to 100</p></div><PremiumAiButton label={analyzing ? "Analyzing…" : "Ask AI"} sublabel="Can it beat market?" onClick={onAnalyze} disabled={analyzing} loading={analyzing} size="compact" /></div>
      <div className="mt-4 h-[310px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={market.points} margin={{ top: 10, right: 8, bottom: 2, left: 0 }}><CartesianGrid stroke="#2a2a31" strokeDasharray="2 7" vertical={false}/><XAxis dataKey="date" hide/><YAxis domain={["auto", "auto"]} hide/><Tooltip contentStyle={{ background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee" }} formatter={(value) => `${Number(value).toFixed(1)}`}/><Line type="monotone" dataKey="stock" name={`${market.stock.symbol} · this stock`} stroke="#3ecf8e" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="peer" name={`${market.peer.symbol} · industry leader`} stroke="#f5c451" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="benchmark" name={market.benchmark.name} stroke="#676771" strokeWidth={2} strokeDasharray="6 5" dot={false}/></LineChart></ResponsiveContainer></div>
      <div className="mt-1 flex flex-wrap gap-6 text-[12px] text-[#8c8c95]"><LegendLine color="#3ecf8e" label={`${market.stock.symbol} · this stock`}/><LegendLine color="#f5c451" label={`${market.peer.symbol} · industry leader`}/><LegendLine color="#676771" label={market.benchmark.name} dashed/></div>
    </div>
    <div className="grid grid-cols-3 gap-[14px]"><ReturnCard label={`${market.stock.symbol} · this stock`} value={market.stock.returnPct} tone="stock"/><ReturnCard label={market.benchmark.name} value={market.benchmark.returnPct} badge={`${beating ? "Beating +" : "Lagging −"}${Math.abs(gap).toFixed(1)}%`} good={beating} tone="benchmark"/><ReturnCard label={`${market.peer.symbol} · industry leader`} value={market.peer.returnPct} description={market.peer.name} tone="peer"/></div>
  </div>;
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) { return <span className="flex items-center gap-2"><span className="w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}/>{label}</span>; }
function ReturnCard({ label, value, badge, good, description, tone }: { label: string; value: number; badge?: string; good?: boolean; description?: string; tone: "stock" | "benchmark" | "peer" }) { const valueColor = value < 0 ? "text-[#f2575c]" : tone === "peer" ? "text-[#f5c451]" : tone === "benchmark" ? "text-[#ececee]" : "text-[#3ecf8e]"; return <div className={`${panel} relative p-[18px]`}><div className="text-[11px] uppercase tracking-[.08em] text-[#8c8c95]">{label}</div>{badge ? <span className={`absolute right-[18px] top-[15px] rounded-md border px-2 py-1 font-mono text-[10px] font-semibold ${good ? "border-[#3ecf8e] text-[#3ecf8e]" : "border-[#f2575c] text-[#f2575c]"}`}>{badge}</span> : null}<div className={`mt-4 font-mono text-[28px] font-semibold ${valueColor}`}>{formatPercent(value)}</div><div className="mt-1 truncate text-xs text-[#8c8c95]">{description ?? "12-month total return"}</div></div>; }

function NewsSection({ detail, research, researchLoading }: { detail: StockDetailResponse; research: StockResearchResponse | null; researchLoading: boolean }) {
  const news = [...(detail.news ?? [])].sort((a, b) => newsTime(b) - newsTime(a));
  const action = detail.verdict?.action;
  const tone: MetricTone = action === "BUY" || action === "BUY SETUP" ? "good" : action === "PASS" ? "bad" : action === "WAIT" ? "warn" : "neutral";
  const color = newsToneColor(tone);
  const events = research ? upcomingEvents(research) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: `${color}66`, background: `${color}0d` }}>
        <span className="grid h-6 w-6 shrink-0 place-items-center" style={{ color: "#74a4ff" }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.6 4.3L14 7l-4.4 1.2L8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5z" fill="currentColor"/></svg>
        </span>
        <div className="text-[17px] font-bold leading-tight text-[#ececee]">{newsHeadline(detail, news.length)}</div>
      </div>

      {news.length ? (
        <div className="overflow-hidden rounded-xl border border-[#2a2a31] bg-[#121214]">
          {news.map((item, index) => <NewsItemRow key={`${item.title}-${index}`} item={item} />)}
        </div>
      ) : (
        <div className={panel}>No news was reported for {detail.stock.symbol}.</div>
      )}

      {researchLoading && !events.length ? (
        <div className={`${panel} flex items-center gap-2 text-[12px] text-[#8c8c95]`}><LoadingSpinner size={12} /> Loading upcoming events…</div>
      ) : events.length ? (
        <div className="sticky bottom-0 z-10 -mx-[22px] -mb-[22px] border-t border-[#2a2a31] bg-[#0e0e10] px-[22px] pb-[22px] pt-4 shadow-[0_-14px_24px_rgba(14,14,16,0.9)]">
          <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f5c451]">What's coming</div>
          <div className="relative flex justify-between gap-2">
            <div className="absolute left-[6%] right-[6%] top-[7px] h-px bg-[#2a2a31]" />
            {events.map((event) => (
              <div key={event.label} className="relative flex flex-1 flex-col items-center text-center">
                <span className="h-3.5 w-3.5 rounded-full border-2 bg-[#0e0e10]" style={{ borderColor: event.color }} />
                <div className="mt-3 font-mono text-[13px] font-semibold" style={{ color: event.color }}>{formatShortDate(event.date)}</div>
                <div className="mt-1 text-[13px] font-semibold text-[#ececee]">{event.label}</div>
                <span className="mt-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: event.color, background: `${event.color}1a` }}>{event.badge}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewsItemRow({ item }: { item: StockNewsItem }) {
  const publisher = item.publisher ?? item.provider ?? "Market news";
  const date = item.publishedAt ? formatShortDate(item.publishedAt) : "";
  const dotColor = headlineSentimentColor(item.title);
  const content = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="text-[14px] font-semibold leading-snug text-[#ececee]">{item.title}</div>
      {item.summary ? <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-[#8c8c95]">{item.summary}</div> : null}
      <div className="text-[11px] text-[#5f5f68]">{publisher}</div>
    </div>
  );

  const row = (
    <>
      <span className="mt-1.5 h-2 w-2 shrink-0 self-start rounded-full" style={{ background: dotColor }} />
      {content}
      {date ? <span className="shrink-0 self-start pt-0.5 text-[12px] text-[#6b6b73]">{date}</span> : null}
    </>
  );

  return (
    <div className="border-t border-[#202026] first:border-t-0">
      {item.link ? (
        <a href={item.link} target="_blank" rel="noreferrer" className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#17171a]">{row}</a>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3.5">{row}</div>
      )}
    </div>
  );
}

type UpcomingEvent = { date: string; label: string; badge: string; color: string };

// Timeline is built only from real calendar dates; a stale reported date rolls forward
// to the next occurrence (via history) so "What's coming" stays genuinely future-looking.
function upcomingEvents(research: StockResearchResponse): UpcomingEvent[] {
  const calendar = research.calendar as { ["Earnings Date"]?: string[]; ["Ex-Dividend Date"]?: string; ["Dividend Date"]?: string } | undefined;
  const exDividend = nextFutureDate(calendar?.["Ex-Dividend Date"], () => estimateNextDate(research.dividends ?? [], ["Date", "date"], 365));
  const dividendPay = nextFutureDate(calendar?.["Dividend Date"], () => exDividend ? { date: addDays(exDividend, 30), estimated: true } : null);
  const earnings = nextFutureDate(calendar?.["Earnings Date"]?.[0], () => estimateNextDate(research.earningsHistory ?? [], ["quarter", "Quarter", "date", "Date"], 91));

  const events: UpcomingEvent[] = [];
  if (exDividend) events.push({ date: exDividend, label: "Ex-Dividend Date", badge: "Income", color: "#f2575c" });
  if (earnings) events.push({ date: earnings, label: "Next Earnings", badge: "Earnings", color: "#74a4ff" });
  if (dividendPay) events.push({ date: dividendPay, label: "Dividend Pay Date", badge: "Income", color: "#3ecf8e" });
  return events.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function nextFutureDate(reported: unknown, estimate: () => CalendarDateItem | null): string | null {
  const today = toIsoDate(new Date());
  const value = normalizeCalendarDate(reported);
  if (value && value >= today) return value;
  return estimate()?.date ?? null;
}

function newsTime(item: StockNewsItem): number {
  const parsed = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

const BULLISH_WORDS = /\b(beat|beats|surge|surges|jump|jumps|rally|rallies|rallying|upgrade|upgrades|upgraded|raise|raised|raises|buy|outperform|record|gain|gains|soar|soars|tops|strong|bullish|expansion|expands|profit|dividend|confirmed|growth|higher|wins|win|approval|launch)\b/;
const BEARISH_WORDS = /\b(miss|misses|missed|fall|falls|drop|drops|cut|cuts|downgrade|downgrades|downgraded|sell|underperform|weak|weaker|loss|losses|decline|declines|plunge|plunges|slump|warn|warns|warning|lawsuit|probe|pressured|bearish|slowdown|halt|delay|lower|risk|fears)\b/;

// Yahoo/Kaohoon give no per-article sentiment, so we approximate the dot color from headline keywords.
function headlineSentimentColor(title: string): string {
  const text = title.toLowerCase();
  const bull = BULLISH_WORDS.test(text);
  const bear = BEARISH_WORDS.test(text);
  if (bull && !bear) return "#3ecf8e";
  if (bear && !bull) return "#f2575c";
  return "#8c8c95";
}

function newsHeadline(detail: StockDetailResponse, count: number) {
  const action = detail.verdict?.action;
  if (!count) return "No fresh news in the detail feed.";
  if (action === "BUY" || action === "BUY SETUP") return "News is bullish. Structure supports the next 6–12 months.";
  if (action === "PASS") return "News is cautious. The structure is not supportive yet.";
  if (action === "WAIT") return "News is mixed. Wait for a cleaner setup.";
  return "News is neutral. Latest headlines for this stock.";
}

function newsToneColor(tone: MetricTone) {
  if (tone === "good") return "#3ecf8e";
  if (tone === "warn") return "#f5c451";
  if (tone === "bad") return "#f2575c";
  return "#74a4ff";
}

function ResearchContent({ tab, research, detail }: { tab: ResearchTab; research: StockResearchResponse | null; detail: StockDetailResponse }) {
  if (!research) return <div className={panel}>No research data was reported.</div>;
  if (tab === "consensus") return <AnalystSection research={research} detail={detail} />;
  if (tab === "financials") return <FinancialsSection research={research} />;
  return <CalendarSection research={research} />;
}

function AnalystSection({ research, detail }: { research: StockResearchResponse; detail: StockDetailResponse }) {
  const summary = (research.recommendationsSummary?.[0] ?? {}) as Record<string, number>;
  const total = REC_SEGMENTS.reduce((sum, segment) => sum + (summary[segment.key] ?? 0), 0);
  const targets = research.analystPriceTargets as { current?: number; low?: number; high?: number; mean?: number } | undefined;
  const current = targets?.current ?? detail.stock.price;
  const low = targets?.low ?? current;
  const high = targets?.high ?? current;
  const mean = targets?.mean ?? current;
  const range = Math.max(high - low, 1);
  const curPct = Math.min(100, Math.max(0, ((current - low) / range) * 100));
  const meanPct = Math.min(100, Math.max(0, ((mean - low) / range) * 100));
  const upside = current ? ((mean - current) / current) * 100 : 0;
  const bullish = (summary.strongBuy ?? 0) + (summary.buy ?? 0);
  const neutral = summary.hold ?? 0;
  const bearish = (summary.sell ?? 0) + (summary.strongSell ?? 0);
  const consensusLabel = describeConsensus(detail.business?.analystScore, bullish, neutral, bearish);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className={panel}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">Analyst recommendations</div>
              <div className="mt-1 text-[12.5px] text-[#8c8c95]">{consensusLabel}</div>
            </div>
            <div className="text-right">
              <div className={`font-mono text-lg font-semibold ${analystScoreTone(detail.business?.analystScore)}`}>{detail.business?.analystRating ?? "Hold"}</div>
              <div className="mt-0.5 font-mono text-[12px] text-[#8c8c95]">{formatNumber(detail.business?.analystScore)} / 5.00</div>
            </div>
          </div>
          <div className="my-3.5 flex h-3 overflow-hidden rounded-md bg-[#0e0e10]">
            {REC_SEGMENTS.map((segment) => <div key={segment.key} style={{ width: total ? `${((summary[segment.key] ?? 0) / total) * 100}%` : 0, background: segment.color }} />)}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <ConsensusStat label="Bullish" value={bullish} tone="good" />
            <ConsensusStat label="Neutral" value={neutral} tone="neutral" />
            <ConsensusStat label="Bearish" value={bearish} tone="bad" />
          </div>
          <div className="flex flex-col gap-[7px]">{REC_SEGMENTS.map((segment) => <div key={segment.key} className="flex justify-between text-[12.5px]"><span className="text-[#bcbcc2]">{segment.label}</span><span className="font-mono text-[#8c8c95]">{summary[segment.key] ?? 0}</span></div>)}</div>
        </div>
        <div className={panel}>
          <div className="flex items-baseline justify-between"><div className="font-semibold">Price target</div><span className={`font-mono font-semibold ${upside >= 0 ? positive : negative}`}>{formatPercent(upside)}</span></div>
          <div className="relative mt-[26px] h-[54px]">
            <div className="absolute left-0 right-0 top-6 h-[5px] rounded-[3px]" style={{ background: "linear-gradient(90deg,#f2575c,#f5c451,#3ecf8e)" }} />
            <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${curPct}%`, top: "14px" }}><div className="h-6 w-[3px] rounded-sm bg-[#ececee]" /><div className="mt-[3px] whitespace-nowrap font-mono text-[11px]">now {formatMoney(current)}</div></div>
            <div className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${meanPct}%`, top: "-22px" }}><div className="whitespace-nowrap font-mono text-[11px] text-[#3ecf8e]">target {formatMoney(mean)}</div><div className="mt-0.5 h-[22px] w-[3px] rounded-sm bg-[#3ecf8e]" /></div>
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[#8c8c95]"><span>low {formatMoney(low)}</span><span>high {formatMoney(high)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={panel}>
          <div className="mb-3 font-semibold">Earnings estimate <span className="font-mono text-xs font-normal text-[#5a5a62]">EPS</span></div>
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr] pb-[7px] text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]"><span>Period</span><span className="text-right">Avg</span><span className="text-right">Low</span><span className="text-right">High</span><span className="text-right">#</span></div>
          {(research.earningsEstimate ?? []).map((row, index) => <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.6fr] border-t border-[#1f1f24] py-2 font-mono text-[12.5px]"><span className="font-sans text-[#bcbcc2]">{formatEstimatePeriod(String(row.period ?? ""))}</span><span className="text-right">{formatNumber(row.avg as number)}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.low as number)}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.high as number)}</span><span className="text-right text-[#5a5a62]">{String(row.numberOfAnalysts ?? "—")}</span></div>)}
        </div>
        <div className={panel}>
          <div className="mb-3 font-semibold">Growth estimates <span className="font-mono text-xs font-normal text-[#5a5a62]">vs. index</span></div>
          <div className="flex flex-col gap-[9px]">{(research.growthEstimates ?? []).map((row, index) => { const value = (row.stockTrend ?? row.indexTrend) as number | null; const pct = Math.min(100, Math.max(0, ((value ?? 0) + 0.3) / 0.6 * 100)); return <div key={index} className="flex items-center gap-3"><span className="w-[92px] flex-none text-[12.5px] text-[#bcbcc2]">{formatEstimatePeriod(String(row.period ?? ""))}</span><div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#0e0e10]"><div className="h-full rounded-[3px] bg-[#3ecf8e]" style={{ width: `${pct}%` }} /></div><span className="w-[72px] flex-none text-right font-mono text-[12.5px] text-[#3ecf8e]">{value != null ? formatPercent(value * 100) : "—"}</span></div>; })}</div>
        </div>
      </div>
    </>
  );
}

function FinancialsSection({ research }: { research: StockResearchResponse }) {
  const history = [...(research.incomeStatement?.history ?? [])].reverse();
  const maxRevenue = Math.max(...history.map((row) => Number(row.revenue) || 0), 1);

  return (
    <div className="flex flex-col gap-3.5">
      <div className={panel}>
        <div className="mb-1.5 flex items-center justify-between"><div className="font-semibold">Income statement</div><div className="flex gap-3.5 text-[11px] text-[#8c8c95]"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#5a5a62]" />Revenue</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#3ecf8e]" />Net income</span></div></div>
        <div className="flex h-[150px] items-end gap-3 pt-2">
          {history.map((row) => {
            const revenue = Number(row.revenue) || 0;
            const net = Number(row.netIncome) || 0;
            return (
              <div key={String(row.period)} className="flex flex-1 items-end justify-center gap-1 self-stretch">
                <div className="w-1/2 rounded-t-sm bg-[#5a5a62]" style={{ height: `${(revenue / maxRevenue) * 100}%` }} />
                <div className="w-1/2 rounded-t-sm bg-[#3ecf8e]" style={{ height: `${Math.max((net / maxRevenue) * 100, 1)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex">{history.map((row) => <div key={String(row.period)} className="flex-1 text-center font-mono text-[11px] text-[#8c8c95]">{String(row.period).slice(0, 4)}</div>)}</div>
        <div className="mt-3.5 grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-t border-[#2a2a31] pt-1.5">
          <span />
          {history.map((row) => <span key={String(row.period)} className="text-right text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]">{String(row.period).slice(0, 4)}</span>)}
        </div>
        {(["revenue", "netIncome", "operatingIncome", "freeCashFlow"] as const).map((key) => (
          <div key={key} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-t border-[#1f1f24] py-2 text-[12.5px]">
            <span className="text-[#bcbcc2]">{key === "netIncome" ? "Net income" : key === "operatingIncome" ? "Operating income" : key === "freeCashFlow" ? "Free cash flow" : "Revenue"}</span>
            {history.map((row) => <span key={String(row.period)} className="text-right font-mono">{formatBig(row[key] as number | null)}</span>)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className={panel}><div className="mb-2.5 font-semibold">Balance sheet <span className="font-normal text-[#5a5a62]">latest FY</span></div>{Object.entries(research.balanceSheet?.latest ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-t border-[#1f1f24] py-2 text-[13px]"><span className="text-[#bcbcc2]">{key}</span><span className="font-mono">{formatBig(value)}</span></div>)}</div>
        <div className={panel}><div className="mb-2.5 font-semibold">Cash flow <span className="font-normal text-[#5a5a62]">latest FY</span></div>{Object.entries(research.cashFlow?.latest ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-t border-[#1f1f24] py-2 text-[13px]"><span className="text-[#bcbcc2]">{key}</span><span className="font-mono">{formatBig(value)}</span></div>)}</div>
      </div>
    </div>
  );
}

function CalendarSection({ research }: { research: StockResearchResponse }) {
  const calendar = research.calendar as { ["Earnings Date"]?: string[]; ["Ex-Dividend Date"]?: string; ["Dividend Date"]?: string } | undefined;
  const dividends = (research.dividends ?? []).slice(-8);
  const maxDividend = Math.max(...dividends.map((row) => Number(row.amount) || 0), 0.01);
  const exDividend = reportedOrEstimatedDate(calendar?.["Ex-Dividend Date"], () => estimateNextDate(research.dividends ?? [], ["Date", "date"], 365), "Estimated from dividend history");
  const dividendPayDate = reportedOrEstimatedDate(calendar?.["Dividend Date"], () => exDividend.date ? { date: addDays(exDividend.date, 30), estimated: true, note: "Estimated from ex-dividend + 30 days" } : null, "Estimated from ex-dividend + 30 days");
  const nextEarnings = reportedOrEstimatedDate(calendar?.["Earnings Date"]?.[0], () => estimateNextDate(research.earningsHistory ?? [], ["quarter", "Quarter", "date", "Date"], 91), "Estimated from earnings history");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-3.5">
        <CalendarDateCard label="Next earnings" item={nextEarnings} tone="neutral" />
        <CalendarDateCard label="Ex-dividend" item={exDividend} tone="warn" />
        <CalendarDateCard label="Dividend pay date" item={dividendPayDate} tone="good" />
      </div>
      <div className={panel}>
        <div className="mb-3.5 font-semibold">Dividend history</div>
        <div className="flex h-[90px] items-end gap-2">{dividends.map((row, index) => <div key={index} className="flex-1 rounded-t-sm bg-[#3ecf8e]" style={{ height: `${((Number(row.amount) || 0) / maxDividend) * 100}%` }} title={formatMoney(Number(row.amount))} />)}</div>
        <div className="mt-1.5 flex">{dividends.map((row, index) => <div key={index} className="flex-1 text-center font-mono text-[10px] text-[#5a5a62]">{formatShortDate(String(row.Date)).slice(0, 6)}</div>)}</div>
      </div>
      <div className={panel}>
        <div className="mb-3 font-semibold">Earnings history <span className="font-mono text-xs font-normal text-[#5a5a62]">EPS est vs actual</span></div>
        <div className="grid grid-cols-4 pb-1.5 text-[10.5px] uppercase tracking-[.4px] text-[#5a5a62]"><span>Quarter</span><span className="text-right">Estimate</span><span className="text-right">Actual</span><span className="text-right">Surprise</span></div>
        {(research.earningsHistory ?? []).map((row, index) => { const surprise = Number(row.surprisePercent) * 100; return <div key={index} className="grid grid-cols-4 border-t border-[#1f1f24] py-2 font-mono text-[13px]"><span className="font-sans text-[#bcbcc2]">{formatShortDate(String(row.quarter))}</span><span className="text-right text-[#8c8c95]">{formatNumber(row.epsEstimate as number)}</span><span className="text-right">{formatNumber(row.epsActual as number)}</span><span className={`text-right ${surprise >= 0 ? positive : negative}`}>{formatPercent(surprise)}</span></div>; })}
      </div>
    </div>
  );
}

type CalendarDateItem = {
  date: string | null;
  estimated: boolean;
  note?: string;
};

function CalendarDateCard({ label, item, tone }: { label: string; item: CalendarDateItem; tone: MetricTone }) {
  const color = tone === "good" ? "#3ecf8e" : tone === "warn" ? "#f5c451" : "#8c8c95";
  return (
    <div className={panel}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[.5px]" style={{ color }}>{label}</div>
        {item.date ? (
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] ${item.estimated ? "bg-[#f5c451]/10 text-[#f5c451] ring-1 ring-[#f5c451]/25" : "bg-[#3ecf8e]/10 text-[#3ecf8e] ring-1 ring-[#3ecf8e]/25"}`}>
            {item.estimated ? "Estimated" : "Reported"}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-mono text-[17px] font-semibold" style={{ color: item.date ? color : "#ececee" }}>{item.date ? formatShortDate(item.date) : "—"}</div>
      {item.note ? <div className="mt-1.5 text-[11px] leading-[1.35] text-[#8c8c95]">{item.note}</div> : null}
    </div>
  );
}

function reportedOrEstimatedDate(value: unknown, estimate: () => CalendarDateItem | null, estimatedNote: string): CalendarDateItem {
  const reported = normalizeCalendarDate(value);
  if (reported) return { date: reported, estimated: false };
  const fallback = estimate();
  if (fallback?.date) return { date: fallback.date, estimated: true, note: fallback.note ?? estimatedNote };
  return { date: null, estimated: false };
}

function estimateNextDate(rows: Array<Record<string, unknown>>, keys: string[], fallbackDays: number): CalendarDateItem | null {
  const dates = rows
    .map((row) => keys.map((key) => normalizeCalendarDate(row[key])).find(Boolean))
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(`${value}T00:00:00`))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) return null;
  const intervals = dates.slice(1).map((date, index) => Math.round((date.getTime() - dates[index].getTime()) / 86_400_000)).filter((days) => days >= 20 && days <= 450);
  const interval = intervals.length ? median(intervals) : fallbackDays;
  let next = new Date(dates[dates.length - 1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let guard = 0;
  while (next <= today && guard < 12) {
    next = new Date(`${addDays(toIsoDate(next), interval)}T00:00:00`);
    guard += 1;
  }
  return { date: toIsoDate(next), estimated: true };
}

function normalizeCalendarDate(value: unknown): string | null {
  if (Array.isArray(value)) return normalizeCalendarDate(value[0]);
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  return toIsoDate(date);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function DrawerHeader({
  detail,
  symbol,
  holdingShares,
  adding,
  onAdd,
  onClose,
}: {
  detail: StockDetailResponse | null;
  symbol: string | null;
  holdingShares?: number;
  adding: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  const hasHolding = typeof holdingShares === "number" && holdingShares > 0;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2a2a31] bg-[#141417] px-[22px] py-[18px]">
      <div><div className="flex items-center gap-[11px]"><strong className="font-mono text-xl">{detail?.stock.symbol ?? symbol ?? "Live data"}</strong><span className="text-sm text-[#8c8c95]">{detail?.stock.name ?? "Live data panel"}</span><span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{detail?.stock.symbol.endsWith(".BK") ? "Thai SET" : "US"}</span></div>{detail ? <div className="mt-[3px] flex items-baseline gap-[9px]"><span className="font-mono text-lg font-semibold">{formatCurrency(detail.stock.price, detail.stock.currency)}</span><span className={`font-mono text-[13px] ${detail.stock.changePct >= 0 ? positive : negative}`}>{formatPercent(detail.stock.changePct)}</span></div> : null}</div>
      <div className="flex items-center gap-3">
        {detail ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            className="rounded-lg border border-[#34343c] bg-[#1c1c20] px-3 py-2 text-left text-xs font-semibold text-[#ececee] transition-colors hover:border-[#676771] hover:bg-[#24242a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="block">{adding ? "Adding..." : hasHolding ? "Add 1 more" : "Add to port"}</span>
            <span className="mt-0.5 block font-mono text-[10px] font-medium text-[#a6a6af]">
              {hasHolding ? `${formatNumber(holdingShares)} shares` : formatCurrency(detail.stock.price, detail.stock.currency)}
            </span>
          </button>
        ) : null}
        {detail ? <IndustryRankBadge detail={detail} /> : null}
        <button type="button" onClick={onClose} aria-label="Close detail panel" className="px-2 py-1 text-[22px] leading-none text-[#8c8c95] hover:text-[#ececee]">×</button>
      </div>
    </div>
  );
}

function IndustryRankBadge({ detail }: { detail: StockDetailResponse }) {
  const rank = detail.peerRank?.rank;
  const count = detail.peerRank?.count;
  const percentile = rank && count ? (rank / count) * 100 : null;
  const tone = percentile == null
    ? "border-[#34343c] bg-[#1c1c20] text-[#8c8c95]"
    : percentile <= 20
      ? "border-[#285f48] bg-[#173528] text-[#3ecf8e]"
      : percentile <= 70
        ? "border-[#68552d] bg-[#332b19] text-[#f5c451]"
        : "border-[#663438] bg-[#351d20] text-[#f2575c]";
  const industry = detail.peerRank?.industry ?? detail.business?.industry ?? "Industry";

  return (
    <div className={`min-w-[150px] rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.08em]">Industry rank</span>
        <strong className="font-mono text-sm">{rank && count ? `#${rank} / ${count}` : "Unavailable"}</strong>
      </div>
      <div className="mt-0.5 max-w-[190px] truncate text-[10px] opacity-80" title={industry}>
        {percentile == null ? industry : `Top ${Math.ceil(percentile)}% · ${industry}`}
      </div>
    </div>
  );
}

function AiGate({ symbol, analysis, analyzing, onAnalyze, activeAgentId }: { symbol: string; analysis: StockAnalysisResponse | null; analyzing: boolean; onAnalyze: () => void; activeAgentId: string }) {
  if (analyzing) return <PremiumLoading title={agentLoadingTitle(activeAgentId, "deep", symbol)} subject={symbol} agentId={activeAgentId} task="deep" />;
  if (analysis) return <AiVerdictCard value={analysis} onRerun={onAnalyze} size="modal" />;
  return <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-[#2a2a31] bg-[linear-gradient(160deg,#15171a,#101012)] px-[26px] py-[30px] text-center"><div className="max-w-[500px]"><h3 className="text-lg font-bold tracking-[-.3px]">Ask AI to analyze the complete picture</h3><p className="mt-[7px] text-[13.5px] leading-[1.6] text-[#8c8c95]">OpenAI will review {symbol}'s fundamentals, statements, analyst estimates, calendar, dividends, technicals, news, industry rank, and regional market comparison. Nothing is sent until you tap.</p></div><PremiumAiButton label={`Analyze ${symbol}`} sublabel="Premium · full picture" onClick={onAnalyze} size="wide" /></div>;
}

function V4HeroMetric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "#3ecf8e" : tone === "warn" ? "#74a4ff" : "#ececee";
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-[#2a2a31] bg-[#121214] px-4 py-[18px]">
      <span className="absolute inset-x-4 top-0 h-[2px] rounded-b-full" style={{ background: tone === "neutral" ? "#34343c" : color }} />
      <div className="mb-2 text-[9px] uppercase tracking-[0.8px]" style={{ color: tone === "neutral" ? "#5a5a62" : color }}>{label}</div>
      <div className="truncate font-mono text-[28px] font-bold leading-none tracking-[-0.8px]" style={{ color }} title={value}>{value}</div>
      <div className="mt-2 truncate text-[11px] font-semibold text-[#8c8c95]" title={sub}>{sub}</div>
    </div>
  );
}

function V4MetricCell({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="min-w-0 bg-[#121214] px-4 py-[15px]">
      <div className="mb-1.5 text-[9px] uppercase tracking-[0.6px] text-[#5a5a62]">{label}</div>
      <div className="truncate font-mono text-[20px] font-bold" style={{ color: color ?? "#ececee" }}>{value}</div>
      <div className="mt-1 truncate text-[10.5px] font-semibold text-[#8c8c95]">{sub}</div>
    </div>
  );
}

function buildPriceRange(detail: StockDetailResponse) {
  const prices = detail.history.flatMap((point) => [point.low, point.close, point.high]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const low = prices.length ? Math.min(...prices) : detail.stock.price;
  const high = prices.length ? Math.max(...prices) : detail.stock.price;
  const span = Math.max(high - low, 0.01);
  const pct = Math.min(100, Math.max(0, ((detail.stock.price - low) / span) * 100));
  return { low, high, pct };
}

function marketCapTier(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "not reported";
  if (value >= 200_000_000_000) return "mega cap";
  if (value >= 10_000_000_000) return "large cap";
  if (value >= 2_000_000_000) return "mid cap";
  return "small cap";
}

function AlphaHuntDecisionDesk({ advice, loading, onHunt }: { advice: QuantPerspectiveResponse | null; loading: boolean; onHunt: () => void }) {
  if (advice) {
    const tone = huntTone(advice.tone);
    return (
      <div className="min-w-0 overflow-hidden rounded-xl border border-[#2a2a31] bg-[linear-gradient(145deg,#15161a,#101113)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.26)]">
        <AgentByline agent={advice.agent} label="Quant agent" />
        <div className="flex items-start justify-between gap-4 max-[560px]:flex-col">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2a2a31] bg-[#0e0e10] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#3ecf8e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" /> Alpha Hunt
              </span>
              <span className="rounded-full border px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ borderColor: `${tone.color}44`, color: tone.color, background: `${tone.color}12` }}>
                {advice.investability}
              </span>
            </div>
            <div className="mt-3 max-w-[560px] text-[21px] font-black leading-[1.18] tracking-[-0.02em] text-[#ececee]">
              {advice.signal}
            </div>
            <p className="mt-2 max-w-[620px] text-[13px] leading-[1.6] text-[#bcbcc2]">{advice.hook}</p>
          </div>
          <div className="w-[132px] flex-none rounded-xl border border-[#2a2a31] bg-[#0e0e10] p-3 max-[560px]:w-full">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#6d6d76]">Buy score</div>
              <div className="font-mono text-[22px] font-black leading-none" style={{ color: tone.color }}>{advice.buyScore}</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#242429]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, advice.buyScore))}%`, background: `linear-gradient(90deg,#3ecf8e,${tone.color})` }} />
            </div>
            <div className="mt-1.5 text-right font-mono text-[9px] text-[#6d6d76]">/100</div>
          </div>
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
          <AdviceLane title="Score & why" value={`${advice.buyScore}/100`} tone={advice.tone === "good" ? "good" : advice.tone === "bad" ? "bad" : "warn"}>
            <span>{advice.summary}</span>
          </AdviceLane>
          <AdviceLane title="Entry plan" value={advice.nextActionWindow} tone={advice.tone === "good" ? "good" : advice.tone === "bad" ? "bad" : "warn"}>
            <span>{advice.buyPlan}</span>
          </AdviceLane>
          <AdviceLane title="TradingView focus" value={advice.investability} tone="neutral">
            <div className="flex flex-wrap gap-1.5">
              {advice.tradingViewFocus.slice(0, 3).map((item) => <span key={item} className="rounded-md border border-[#34343c] bg-[#0e0e10] px-2 py-1 text-[10.5px] text-[#bcbcc2]">{item}</span>)}
            </div>
          </AdviceLane>
        </div>
        <div className="mt-3 rounded-xl border border-[#242429] bg-[#0e0e10]/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8c8c95]">Evidence checks</div>
            <span className="text-[10px] text-[#5a5a62]">live data</span>
          </div>
          <div className="mt-2 grid min-w-0 gap-2">
            {advice.checks.slice(0, 4).map((check) => <Metric key={check.label} label={check.label} value={check.value} tone={check.status} hint={check.insight} />)}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#242429] pt-3">
          <span className="text-[11px] text-[#8c8c95]">Swing investor read{advice.generatedAt ? ` · generated ${new Date(advice.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ", generated on request."}</span>
          <button type="button" onClick={onHunt} className="rounded-lg border border-[#2a2a31] bg-[#161619] px-3 py-2 text-xs font-semibold text-[#bcbcc2] hover:border-[#3ecf8e] hover:text-[#3ecf8e]">Re-hunt</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2a2a31] bg-[#141417] px-4 py-3.5 max-[560px]:flex-col max-[560px]:items-stretch">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#3ecf8e]">Alpha Hunt</div>
        <p className="mt-1 text-sm leading-[1.45] text-[#bcbcc2]">Hunt this stock with AI for a direct buy, wait, or pass read.</p>
      </div>
      <button
        type="button"
        onClick={onHunt}
        disabled={loading}
        className="group inline-flex flex-none items-center overflow-hidden rounded-[12px] border border-[#3ecf8e]/35 bg-[#0e0e10] p-[2px] shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition-colors hover:border-[#c77dff]/70 disabled:opacity-60 max-[560px]:self-start"
      >
        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[10px] bg-[#050607]">
          {loading ? <LoadingSpinner size={16} className="text-[#3ecf8e]" /> : <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover opacity-95" />}
        </span>
        <span className="px-4 text-[14px] font-black tracking-[-0.01em] text-[#ececee]">{loading ? "Hunting..." : "Hunt"}</span>
      </button>
    </div>
  );
}

function AdviceLane({ title, value, tone, children }: { title: string; value: string; tone: MetricTone; children: ReactNode }) {
  const color = huntTone(tone).color;
  return (
    <div className="min-w-0 rounded-xl border border-[#242429] bg-[#121214] p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-1 rounded-full" style={{ background: color }} />
          <div className="truncate text-[10px] font-bold uppercase tracking-[.12em] text-[#8c8c95]">{title}</div>
        </div>
        <div className="max-w-[52%] truncate rounded-md border border-[#34343c] bg-[#0e0e10] px-2 py-1 font-mono text-[11px] font-bold" style={{ color }} title={value}>{value}</div>
      </div>
      <div className="mt-2 min-w-0 text-[12px] leading-[1.55] text-[#bcbcc2]">{children}</div>
    </div>
  );
}

function huntTone(tone: MetricTone | "good" | "warn" | "bad") {
  if (tone === "good") return { color: "#3ecf8e" };
  if (tone === "bad") return { color: "#f2575c" };
  if (tone === "warn") return { color: "#74a4ff" };
  return { color: "#8c8c95" };
}

function DetailContent({ detail, huntAdvice, huntLoading, onHunt }: { detail: StockDetailResponse; huntAdvice: QuantPerspectiveResponse | null; huntLoading: boolean; onHunt: () => void }) {
  const returns = detail.performance?.returns ?? {};
  const returnSeries = buildReturnSeries(returns);
  const positiveWindows = returnSeries.filter((item) => item.value > 0).length;
  const oneYearReturn = returnSeries.find((item) => item.key === "1y")?.value ?? 0;
  const longTermRead = describeReturnPattern(returnSeries);
  const metrics = [
    { label: "PE", value: formatMultiple(detail.business?.peRatio), tone: tonePe(detail.business?.peRatio), hint: peHint(detail.business?.peRatio) },
    { label: "PBV", value: formatMultiple(detail.business?.priceToBook), tone: tonePbv(detail.business?.priceToBook), hint: pbvHint(detail.business?.priceToBook) },
    { label: "ROE", value: formatPercent(detail.business?.roe), tone: tonePercent(detail.business?.roe, 15, 8), hint: "quality" },
    { label: "ROA", value: formatPercent(detail.business?.roa), tone: tonePercent(detail.business?.roa, 6, 2), hint: "efficiency" },
    { label: "Margin", value: formatPercent(detail.business?.profitMargin), tone: tonePercent(detail.business?.profitMargin, 12, 4), hint: "profit" },
    { label: "Yield", value: formatPercent(detail.business?.dividendYield), tone: toneYield(detail.business?.dividendYield), hint: "income" },
    { label: "Growth", value: formatPercent(detail.business?.revenueGrowth), tone: tonePercent(detail.business?.revenueGrowth, 8, 0), hint: "sales" },
    { label: "Earnings", value: formatPercent(detail.business?.earningsGrowth), tone: tonePercent(detail.business?.earningsGrowth, 8, 0), hint: "eps" }
  ];
  const technicals = [
    { label: "RSI 14", value: formatNumber(detail.technicals?.rsi14), tone: toneRsi(detail.technicals?.rsi14), hint: rsiHint(detail.technicals?.rsi14) },
    { label: "MACD", value: formatNumber(detail.technicals?.macd), tone: toneAboveZero(detail.technicals?.macd), hint: "momentum" },
    { label: "SMA 20", value: formatNumber(detail.technicals?.sma20), tone: tonePriceVsAverage(detail.stock.price, detail.technicals?.sma20), hint: "short trend" },
    { label: "SMA 50", value: formatNumber(detail.technicals?.sma50), tone: tonePriceVsAverage(detail.stock.price, detail.technicals?.sma50), hint: "mid trend" },
    { label: "SMA 200", value: formatNumber(detail.technicals?.sma200), tone: tonePriceVsAverage(detail.stock.price, detail.technicals?.sma200), hint: "long trend" },
    { label: "Volume", value: formatNumber(detail.technicals?.volumeRatio), tone: toneVolume(detail.technicals?.volumeRatio), hint: volumeHint(detail.technicals?.volumeRatio) }
  ];
  const buyReadScore = detail.verdict?.score ?? 0;
  const range = buildPriceRange(detail);
  const beta = detail.business?.beta;
  const pe = detail.business?.peRatio;
  const payout = detail.business?.payoutRatio;
  const dividendYield = detail.business?.dividendYield;

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 max-[760px]:grid-cols-1">
        <V4HeroMetric
          label="Dividend Yield"
          value={formatPercent(dividendYield)}
          sub={dividendYield == null ? "not reported" : dividendYield >= 5 ? "income-heavy" : dividendYield > 0 ? "pays income" : "no yield"}
          tone="good"
        />
        <V4HeroMetric
          label="Market Cap"
          value={formatBig(detail.business?.marketCap)}
          sub={marketCapTier(detail.business?.marketCap)}
          tone="neutral"
        />
        <V4HeroMetric
          label="Volatility · Beta"
          value={formatNumber(beta)}
          sub={beta == null ? "not reported" : beta > 1.25 ? "higher beta" : beta < 0.8 ? "calmer tape" : "market-like"}
          tone={beta != null && beta > 1.25 ? "warn" : "good"}
        />
      </div>

      <div className={panel}>
        <div className="mb-4 text-[9px] uppercase tracking-[0.8px] text-[#5a5a62]">52-week price range</div>
        <div className="relative h-[34px]">
          <div className="absolute left-0 right-0 top-4 h-[5px] rounded bg-gradient-to-r from-[#f2575c] via-[#f5c451] to-[#3ecf8e]" />
          <div className="absolute top-[5px] flex -translate-x-1/2 flex-col items-center gap-[3px]" style={{ left: `${range.pct}%` }}>
            <div className="whitespace-nowrap rounded bg-[#ececee] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[#0e0e10] shadow-[0_1px_6px_rgba(0,0,0,0.4)]">{formatCurrency(detail.stock.price, detail.stock.currency)}</div>
            <div className="h-[13px] w-0.5 rounded bg-[#ececee]" />
          </div>
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-[#5a5a62]">
          <span>{formatCurrency(range.low, detail.stock.currency)} · low</span>
          <span className="text-[#8c8c95]">{Math.round(range.pct)}% through range</span>
          <span>{formatCurrency(range.high, detail.stock.currency)} · high</span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-3 overflow-hidden rounded-xl border border-[#2a2a31] bg-[#2a2a31] gap-px max-[760px]:grid-cols-1">
        <V4MetricCell label="Trailing P/E" value={formatMultiple(pe)} sub={pe == null ? "not reported" : pe < 12 ? "undemanding" : pe > 30 ? "premium" : "normal"} color={pe != null && pe < 12 ? "#3ecf8e" : pe != null && pe > 30 ? "#f5c451" : undefined} />
        <V4MetricCell label="Forward P/E" value={formatMultiple(detail.business?.peRatio)} sub="estimated" />
        <V4MetricCell label="Price / Book" value={formatMultiple(detail.business?.priceToBook)} sub="book value" />
        <V4MetricCell label="Payout Ratio" value={formatPercent(payout)} sub={payout == null ? "not reported" : payout > 80 ? "watch safety" : "covered"} color={payout != null && payout > 80 ? "#f5c451" : "#3ecf8e"} />
        <V4MetricCell label="Buy Read" value={`${buyReadScore}/100`} sub={detail.verdict?.setupLabel ?? "setup quality"} color="#3ecf8e" />
        <V4MetricCell label="Sector" value={detail.business?.sector ?? detail.stock.sector ?? "—"} sub={detail.business?.industry ?? "industry"} />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <div className={panel}><PanelHeader title="Price path" /><div className="h-48"><TickerPerformanceChart points={detail.history} currency={detail.stock.currency} /></div><div className={`text-right font-mono text-sm font-semibold ${detail.stock.changePct >= 0 ? positive : negative}`}>{formatPercent(detail.stock.changePct)}</div></div>
        <AlphaHuntDecisionDesk advice={huntAdvice} loading={huntLoading} onHunt={onHunt} />
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <div className={panel}><PanelHeader title="Business snapshot" description={detail.business?.sector ?? detail.stock.sector} /><div className="grid grid-cols-4 gap-2">{metrics.map((item) => <Metric key={item.label} label={item.label} value={item.value} tone={item.tone} hint={item.hint} />)}</div></div>
        <div className={panel}>
          <PanelHeader title="Performance" description="Return profile across your main holding windows" />
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="h-[170px] rounded-xl border border-[#23232a] bg-[#101114] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={returnSeries} margin={{ top: 12, right: 10, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="returnProfileFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#23232a" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#6d6d76", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6d6d76", fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee" }} formatter={(value) => formatPercent(Number(value))} />
                  <Area type="monotone" dataKey="value" stroke="#3ecf8e" strokeWidth={2.5} fill="url(#returnProfileFill)" activeDot={{ r: 4, fill: "#3ecf8e" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2">
              <InsightPill label="Trend read" value={longTermRead} tone={positiveWindows >= 3 ? "good" : positiveWindows >= 2 ? "neutral" : "bad"} />
              <InsightPill label="Winning windows" value={`${positiveWindows}/${returnSeries.length}`} tone={positiveWindows >= 3 ? "good" : positiveWindows >= 2 ? "neutral" : "bad"} />
              <InsightPill label="1Y return" value={formatPercent(oneYearReturn)} tone={oneYearReturn >= 0 ? "good" : "bad"} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1">{returnWindows.map((window) => <Metric key={window} label={window.toUpperCase()} value={formatPercent(returns[window])} tone={toneReturn(returns[window])} />)}</div>
        </div>
      </div>

      <div className={panel}><PanelHeader title="Technical analysis" description={detail.technicals?.signal ?? "Neutral"} /><div className="grid min-w-0 grid-cols-6 gap-2 max-[900px]:grid-cols-3 max-[560px]:grid-cols-2">{technicals.map((item) => <Metric key={item.label} label={item.label} value={item.value} tone={item.tone} hint={item.hint} />)}</div></div>

      <div className={panel}><PanelHeader title="Business outlook" /><p className="text-sm leading-relaxed text-[#bcbcc2]">{detail.outlook?.summary ?? detail.business?.companySummary ?? "No outlook available."}</p></div>
    </>
  );
}

type MetricTone = "good" | "warn" | "bad" | "neutral";

function Metric({ label, value, tone = "neutral", hint }: { label: string; value: string; tone?: MetricTone; hint?: string }) {
  const toneClass = metricToneClass(tone);
  return (
    <div className="min-w-0 rounded-[8px] border border-[#2a2a31] bg-[#121214] px-3 py-2.5 text-left transition-colors">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: toneClass.accent }} />
        <div className={`min-w-0 truncate font-mono text-[10px] uppercase ${toneClass.label}`} title={label}>{label}</div>
      </div>
      <div className={`mt-1 font-mono text-[14px] font-bold leading-tight ${toneClass.value}`} title={value}>{value}</div>
      {hint ? <div className={`mt-1 min-w-0 break-words text-[10.5px] font-medium leading-[1.35] ${toneClass.hint}`} title={hint}>{hint}</div> : null}
    </div>
  );
}

function metricToneClass(tone: MetricTone) {
  if (tone === "good") {
    return {
      accent: "#3ecf8e",
      label: "text-[#67dba7]",
      value: "text-[#3ecf8e]",
      hint: "text-[#8c8c95]"
    };
  }
  if (tone === "warn") {
    return {
      accent: "#74a4ff",
      label: "text-[#74a4ff]",
      value: "text-[#ececee]",
      hint: "text-[#8c8c95]"
    };
  }
  if (tone === "bad") {
    return {
      accent: "#f2575c",
      label: "text-[#ff6b70]",
      value: "text-[#f2575c]",
      hint: "text-[#8c8c95]"
    };
  }
  return {
    accent: "#5a5a62",
    label: "text-[#5a5a62]",
    value: "text-[#ececee]",
    hint: "text-[#6d6d76]"
  };
}

function toneUnavailable(value?: number | null): value is null | undefined {
  return value == null || Number.isNaN(value);
}

function tonePercent(value: number | null | undefined, goodAt: number, warnAt: number): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value >= goodAt) return "good";
  if (value >= warnAt) return "warn";
  return "bad";
}

function toneReturn(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value >= 10) return "good";
  if (value >= 0) return "warn";
  return "bad";
}

function tonePe(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value) || value <= 0) return "neutral";
  if (value <= 15) return "good";
  if (value <= 28) return "warn";
  return "bad";
}

function peHint(value: number | null | undefined) {
  if (toneUnavailable(value) || value <= 0) return "n/a";
  if (value <= 15) return "cheap";
  if (value <= 28) return "fair";
  return "expensive";
}

function tonePbv(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value) || value <= 0) return "neutral";
  if (value <= 1.2) return "good";
  if (value <= 3) return "warn";
  return "bad";
}

function pbvHint(value: number | null | undefined) {
  if (toneUnavailable(value) || value <= 0) return "n/a";
  if (value <= 1.2) return "asset value";
  if (value <= 3) return "normal";
  return "premium book";
}

function toneYield(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value >= 4) return "good";
  if (value > 0) return "warn";
  return "neutral";
}

function toneRsi(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value >= 70) return "warn";
  if (value <= 30) return "bad";
  if (value >= 45 && value <= 65) return "good";
  return "neutral";
}

function rsiHint(value: number | null | undefined) {
  if (toneUnavailable(value)) return "n/a";
  if (value >= 70) return "hot";
  if (value <= 30) return "weak";
  if (value >= 45 && value <= 65) return "healthy";
  return "neutral";
}

function toneAboveZero(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "neutral";
}

function tonePriceVsAverage(price: number, average: number | null | undefined): MetricTone {
  if (toneUnavailable(average) || average <= 0) return "neutral";
  if (price >= average * 1.01) return "good";
  if (price >= average * 0.99) return "warn";
  return "bad";
}

function toneVolume(value: number | null | undefined): MetricTone {
  if (toneUnavailable(value)) return "neutral";
  if (value >= 1.2) return "good";
  if (value >= 0.8) return "warn";
  return "neutral";
}

function volumeHint(value: number | null | undefined) {
  if (toneUnavailable(value)) return "n/a";
  if (value >= 1.2) return "active";
  if (value >= 0.8) return "normal";
  return "quiet";
}

function PanelHeader({ title, description }: { title: string; description?: string }) {
  return <div className="mb-4"><div className="text-sm font-bold text-[#ececee]">{title}</div>{description ? <div className="mt-1 text-xs text-[#8c8c95]">{description}</div> : null}</div>;
}

function formatEstimatePeriod(period: string) {
  const normalized = period.trim().toLowerCase();
  if (normalized === "0q") return "Current quarter";
  if (normalized === "+1q") return "Next quarter";
  if (normalized === "0y") return "Current year";
  if (normalized === "+1y") return "Next year";
  if (normalized === "ltg") return "Long-term growth";
  return period || "—";
}

function buildReturnSeries(returns: Partial<Record<ReturnWindow, number | undefined>>) {
  return returnWindows.map((key) => ({
    key,
    label: key.toUpperCase(),
    value: returns[key] ?? 0,
  }));
}

function describeReturnPattern(series: Array<{ value: number }>) {
  const positiveCount = series.filter((item) => item.value > 0).length;
  if (positiveCount >= 4) return "Broadly positive";
  if (positiveCount >= 3) return "Mostly positive";
  if (positiveCount >= 2) return "Mixed";
  return "Weak follow-through";
}

function describeConsensus(score: number | undefined, bullish: number, neutral: number, bearish: number) {
  if (!score) return "No clear analyst consensus yet.";
  const total = bullish + neutral + bearish;
  const leaning = score <= 1.8 ? "Strong bullish consensus" : score <= 2.4 ? "Bullish consensus" : score <= 3.2 ? "Mostly hold / wait" : score <= 4 ? "Bearish leaning" : "Strong bearish consensus";
  return `${leaning} · ${bullish} bullish, ${neutral} neutral, ${bearish} bearish${total ? ` across ${total} analysts` : ""}.`;
}

function analystScoreTone(score?: number) {
  if (!score) return "text-[#8c8c95]";
  if (score <= 2.4) return "text-[#3ecf8e]";
  if (score <= 3.2) return "text-[#f5c451]";
  return "text-[#f2575c]";
}

function ConsensusStat({ label, value, tone }: { label: string; value: number; tone: "good" | "neutral" | "bad" }) {
  const color = tone === "good" ? "text-[#3ecf8e]" : tone === "bad" ? "text-[#f2575c]" : "text-[#f5c451]";
  return (
    <div className="rounded-lg border border-[#23232a] bg-[#101114] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[.08em] text-[#6d6d76]">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function InsightPill({ label, value, tone }: { label: string; value: string; tone: "good" | "neutral" | "bad" }) {
  const color = tone === "good" ? "#3ecf8e" : tone === "bad" ? "#f2575c" : "#74a4ff";
  return (
    <div className="rounded-xl border border-[#2a2a31] bg-[#121214] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <div className="text-[10px] uppercase text-[#8c8c95]">{label}</div>
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function DetailSkeleton({ symbol }: { symbol: string | null }) {
  return <div className="flex flex-col gap-4" aria-label={`Loading live detail for ${symbol ?? "stock"}`} aria-busy="true"><div className="rounded-2xl border border-[#285f48] bg-[#173528] px-4 py-3 text-sm font-semibold text-[#3ecf8e]">Loading live price history, fundamentals, and technical signals…</div><div className={panel}><div className="skeleton-block h-56"/><div className="mt-4 grid grid-cols-2 gap-4"><div className="skeleton-block h-32"/><div className="skeleton-block h-32"/></div></div></div>;
}
