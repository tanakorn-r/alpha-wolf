import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { loadDiscoveries, loadPortfolio, summarizeStock, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatMoney, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

type Market = "all" | "us" | "th";

export function DiscoverPage() {
  const globalQuery = useWolfStore((state) => state.searchQuery);
  const setGlobalQuery = useWolfStore((state) => state.setSearchQuery);
  const openDetail = useWolfStore((state) => state.openDetail);
  const strategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const query = useDeferredValue(globalQuery.trim());
  const [market, setMarket] = useState<Market>("all");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const discoveryQuery = useInfiniteQuery({ queryKey: ["discoveries", query, market, strategy], queryFn: ({ pageParam }) => loadDiscoveries({ q: query || undefined, kind: "stock", region: market, strategy, page: pageParam, limit: 40 }), initialPageParam: 1, getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined, refetchOnMount: "always" });
  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const items = discoveryQuery.data?.pages.flatMap((page) => page.live) ?? [];
  const planned = portfolioQuery.data?.dcaOrders.filter((order) => order.status === "planned").reduce((sum, order) => sum + order.amount, 0) ?? 0;
  const budget = portfolioQuery.data?.holdings.reduce((sum, holding) => sum + holding.monthlyDca, 0) ?? 0;
  const unallocated = Math.max(0, budget - planned);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && discoveryQuery.hasNextPage && !discoveryQuery.isFetchingNextPage) void discoveryQuery.fetchNextPage(); }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [discoveryQuery.hasNextPage, discoveryQuery.isFetchingNextPage, discoveryQuery.fetchNextPage]);

  const candidates = items;

  async function askAi() {
    if (!candidates[0]) return;
    setAnalyzing(true);
    try { setAnalysis(await summarizeStock(candidates[0].symbol, strategy)); } finally { setAnalyzing(false); }
  }

  return (
    <section className="flex flex-col gap-4 text-[#ececee]">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 max-w-[440px] flex-1">
          <svg viewBox="0 0 16 16" className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 fill-none stroke-[#5a5a62] stroke-[1.4]"><circle cx="7" cy="7" r="4.6"/><path d="m10.6 10.6 3.4 3.4"/></svg>
          <input value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Search ticker or company — KO, PTT, Realty…" className="w-full rounded-[10px] border border-[#2a2a31] bg-[#161619] py-[11px] pl-9 pr-3 text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]" />
        </label>
        <div className="flex gap-1 rounded-[10px] border border-[#2a2a31] bg-[#161619] p-1">{(["all", "us", "th"] as const).map((value) => <Tab key={value} active={market === value} onClick={() => setMarket(value)}>{value === "all" ? "All markets" : value === "th" ? "Thai SET" : "US"}</Tab>)}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-[9px] border border-[#2a2a31] bg-[#161619] p-1">{(["stable_dca", "yield", "capitalized", "momentum"] as const).map((value) => <Tab key={value} active={strategy === value} onClick={() => setStrategy(value)}>{value === "stable_dca" ? "Dividend dips" : value}</Tab>)}</div>
        <div className="flex items-center gap-3.5"><div className="text-right"><div className="text-[11px] text-[#f5c451]">Unallocated this month</div><div className="font-mono font-semibold text-[#f5c451]">{formatMoney(unallocated)}</div></div><button type="button" onClick={askAi} disabled={!candidates.length || analyzing} className="flex items-center gap-2 rounded-[9px] border border-[#3ecf8e] bg-[#3ecf8e]/10 px-3.5 py-[9px] text-[13px] font-semibold text-[#3ecf8e] disabled:opacity-40"><Spark />{analyzing ? "Ranking…" : "Ask AI to rank these"}</button></div>
      </div>

      <div className="text-xs text-[#5a5a62]">{candidates.length} of {discoveryQuery.data?.pages[0]?.total ?? 0} stocks · sorted by DCA match score</div>
      {analysis ? <AiResult value={analysis} /> : null}

      <div className="flex flex-col gap-3">
        {candidates.map((item, index) => {
          const score = item.strategyScores[strategy] ?? 0;
          const scoreColor = score >= 85 ? "#3ecf8e" : score >= 70 ? "#f5c451" : "#8c8c95";
          return (
            <button key={item.symbol} type="button" onClick={() => openDetail(item.symbol)} className={`grid grid-cols-[74px_1fr_auto] items-start gap-[18px] rounded-xl border bg-[#161619] px-[18px] py-4 text-left transition-colors hover:border-[#3ecf8e] ${index === 0 ? "border-[#3ecf8e]" : "border-[#2a2a31]"}`}>
              <div className="flex w-[74px] flex-col items-center gap-1"><div className="flex h-[66px] w-[66px] flex-col items-center justify-center rounded-full border-2" style={{ borderColor: scoreColor, background: `${scoreColor}18` }}><span className="font-mono text-[23px] font-semibold leading-none" style={{ color: scoreColor }}>{score}</span><span className="text-[9px] text-[#8c8c95]">#{index + 1}</span></div><span className="text-[10px] text-[#8c8c95]">match</span></div>
              <div><div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-base font-semibold">{item.symbol}</span><span className="text-[13px] text-[#8c8c95]">{item.name}</span><Badge>{item.symbol.endsWith(".BK") ? "Thai SET" : "US"}</Badge><Badge>{item.sector && item.sector !== "Unknown" ? item.sector : item.exchange ?? "Equity"}</Badge></div><p className="my-[9px] max-w-[640px] text-[13px] leading-[1.55] text-[#bcbcc2]">{catalogStory(item.story)}</p><div className="flex flex-wrap gap-[7px]"><Signal good={item.changePct <= 0}>{item.changePct <= 0 ? "Down today" : "Positive today"}</Signal><Signal good={item.strategyScores.yield >= 65}>Yield fit {item.strategyScores.yield}/100</Signal><Signal good={score >= 70}>{strategy.replace("_", " ")} fit {score}/100</Signal></div></div>
              <div className="flex min-w-[130px] flex-col items-end gap-2 text-right"><strong className="font-mono text-base">{formatCurrency(item.price, item.currency)}</strong><div className={`font-mono text-xs ${item.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(item.changePct)}</div><div className="mt-0.5 text-[11px] text-[#8c8c95]">Today <span className="font-mono text-[#ececee]">{formatPercent(item.changePct)}</span></div><div className="mt-0.5 text-[11px] text-[#8c8c95]">Suggested</div><div className="-mt-1 font-mono text-lg font-semibold text-[#8c8c95]">Watch only</div><div className="mt-1 flex items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3 py-[7px] text-xs"><Spark />Research</div></div>
            </button>
          );
        })}
      </div>
      <div ref={loadMoreRef} className="min-h-8 text-center text-xs text-[#5a5a62]">{discoveryQuery.isFetchingNextPage ? "Loading more live stocks…" : discoveryQuery.hasNextPage ? "Scroll for more" : candidates.length ? "End of ranked results" : ""}</div>
      {discoveryQuery.isPending ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">Scanning live market data…</div> : null}
      {discoveryQuery.isError ? <div className="rounded-xl border border-[#663438] bg-[#2c1719] p-8 text-center text-[#f2575c]">Scanner data could not be loaded.<button type="button" onClick={() => discoveryQuery.refetch()} className="ml-3 rounded border border-[#f2575c] px-3 py-1.5 text-xs">Retry</button></div> : null}
      {!discoveryQuery.isPending && !discoveryQuery.isError && !candidates.length ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">No stocks match your search and filters.</div> : null}
    </section>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-[7px] px-3.5 py-2 text-[13px] font-medium capitalize ${active ? "bg-[#23232a] text-[#ececee]" : "text-[#8c8c95]"}`}>{children}</button>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{children}</span>; }
function Signal({ good, children }: { good: boolean; children: React.ReactNode }) { return <span className="flex items-center gap-1.5 rounded-md border border-[#2a2a31] bg-[#0e0e10] px-[9px] py-1 text-[11.5px] text-[#bcbcc2]"><span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`}/>{children}</span>; }
function Spark() { return <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-[#3ecf8e]"><path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z"/></svg>; }
function AiResult({ value }: { value: StockAnalysisResponse }) { return <AiVerdictCard value={value} size="modal" />; }
function catalogStory(value: string) { return value.replace("weekly move", "daily move").replace("daily volatility", "session move"); }
