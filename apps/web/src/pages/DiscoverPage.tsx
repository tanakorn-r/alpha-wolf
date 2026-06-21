import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AiVerdictCard } from "../components/AiVerdictCard";
import { loadDiscoveries, loadPortfolio, saveHolding, summarizeStock, type StockAnalysisResponse } from "../lib/api";
import { formatCurrency, formatMoneyAs, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

type Market = "all" | "us" | "th";
type SortKey = "score" | "yield" | "change" | "name";

export function DiscoverPage() {
  const globalQuery = useWolfStore((state) => state.searchQuery);
  const setGlobalQuery = useWolfStore((state) => state.setSearchQuery);
  const openDetail = useWolfStore((state) => state.openDetail);
  const strategy = useWolfStore((state) => state.selectedStrategy);
  const setStrategy = useWolfStore((state) => state.setStrategy);
  const currency = useWolfStore((state) => state.currency);
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const spendCashReserve = useWolfStore((state) => state.spendCashReserve);
  const query = useDeferredValue(globalQuery.trim());
  const [market, setMarket] = useState<Market>("all");
  const [sector, setSector] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [top5State, setTop5State] = useState<"idle" | "loading" | "open">("idle");
  const [top5Applied, setTop5Applied] = useState<{ count: number; amount: number } | null>(null);
  const [applyingTop5, setApplyingTop5] = useState(false);
  const [applyTop5Error, setApplyTop5Error] = useState("");

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const discoveryQuery = useInfiniteQuery({ queryKey: ["discoveries", query, market, strategy], queryFn: ({ pageParam }) => loadDiscoveries({ q: query || undefined, kind: "stock", region: market, strategy, page: pageParam, limit: 40 }), initialPageParam: 1, getNextPageParam: (lastPage) => lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined, refetchOnMount: "always" });
  const items = discoveryQuery.data?.pages.flatMap((page) => page.live) ?? [];

  const sectors = useMemo(() => Array.from(new Set(items.map((item) => item.sector).filter((value): value is string => Boolean(value && value !== "Unknown")))).sort(), [items]);

  const filtered = useMemo(() => sector === "all" ? items : items.filter((item) => item.sector === sector), [items, sector]);

  const candidates = useMemo(() => {
    const ranked = [...filtered];
    ranked.sort((a, b) => {
      if (sortBy === "score") return (b.strategyScores[strategy] ?? 0) - (a.strategyScores[strategy] ?? 0);
      if (sortBy === "yield") return (b.strategyScores.yield ?? 0) - (a.strategyScores.yield ?? 0);
      if (sortBy === "change") return a.changePct - b.changePct;
      return a.symbol.localeCompare(b.symbol);
    });
    return ranked;
  }, [filtered, sortBy, strategy]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && discoveryQuery.hasNextPage && !discoveryQuery.isFetchingNextPage) void discoveryQuery.fetchNextPage(); }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [discoveryQuery.hasNextPage, discoveryQuery.isFetchingNextPage, discoveryQuery.fetchNextPage]);

  const top5 = candidates.slice(0, 5).map((item) => ({ item, amount: Math.min(200, cashReserve > 0 ? Math.round(cashReserve / Math.max(candidates.slice(0, 5).length, 1)) : 200) }));

  function resetTop5() { setTop5State("idle"); setTop5Applied(null); }

  async function rankTop5() {
    setTop5State("loading");
    setTop5Applied(null);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setTop5State("open");
  }

  async function applyTop5() {
    const picks = top5;
    if (!picks.length || applyingTop5) return;
    setApplyingTop5(true);
    setApplyTop5Error("");
    try {
      const portfolio = await loadPortfolio();
      for (const pick of picks) {
        const price = pick.item.price;
        if (!price || price <= 0) continue;
        const boughtShares = pick.amount / price;
        const existing = portfolio.holdings.find((holding) => holding.symbol === pick.item.symbol);
        const totalShares = (existing?.shares ?? 0) + boughtShares;
        const totalCost = (existing?.shares ?? 0) * (existing?.averageCost ?? 0) + pick.amount;
        await saveHolding({
          symbol: pick.item.symbol,
          shares: totalShares,
          averageCost: totalCost / totalShares,
          strategy,
          monthlyDca: existing?.monthlyDca ?? 0,
        });
      }
      const total = picks.reduce((sum, pick) => sum + pick.amount, 0);
      spendCashReserve(Math.min(total, cashReserve));
      setTop5Applied({ count: picks.length, amount: total });
      setTop5State("idle");
    } catch {
      setApplyTop5Error("Could not buy the full top-5 list — some buys may not have gone through.");
    } finally {
      setApplyingTop5(false);
    }
  }

  async function askAi(symbol: string) {
    setAnalyzing(true);
    try { setAnalysis(await summarizeStock(symbol, strategy)); } finally { setAnalyzing(false); }
  }

  return (
    <section className="flex flex-col gap-4 text-[#ececee]">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 max-w-[440px] flex-1">
          <svg viewBox="0 0 16 16" className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 fill-none stroke-[#5a5a62] stroke-[1.4]"><circle cx="7" cy="7" r="4.6"/><path d="m10.6 10.6 3.4 3.4"/></svg>
          <input value={globalQuery} onChange={(event) => { setGlobalQuery(event.target.value); resetTop5(); }} placeholder="Search ticker or company — KO, PTT, Realty…" className="w-full rounded-[10px] border border-[#2a2a31] bg-[#161619] py-[11px] pl-9 pr-3 text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]" />
        </label>
        <div className="flex gap-1 rounded-[10px] border border-[#2a2a31] bg-[#161619] p-1">{(["all", "us", "th"] as const).map((value) => <Tab key={value} active={market === value} onClick={() => { setMarket(value); resetTop5(); }}>{value === "all" ? "All markets" : value === "th" ? "Thai SET" : "US"}</Tab>)}</div>
        <select value={sector} onChange={(event) => { setSector(event.target.value); resetTop5(); }} className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3 py-[10px] text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]">
          <option value="all">All sectors</option>
          {sectors.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={sortBy} onChange={(event) => { setSortBy(event.target.value as SortKey); resetTop5(); }} className="rounded-[10px] border border-[#2a2a31] bg-[#161619] px-3 py-[10px] text-[13px] text-[#ececee] outline-none focus:border-[#3ecf8e]">
          <option value="score">Sort: match score</option>
          <option value="yield">Sort: yield</option>
          <option value="change">Sort: today's move</option>
          <option value="name">Sort: ticker</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-[9px] border border-[#2a2a31] bg-[#161619] p-1">{(["stable_dca", "yield", "capitalized", "momentum"] as const).map((value) => <Tab key={value} active={strategy === value} onClick={() => { setStrategy(value); resetTop5(); }}>{value === "stable_dca" ? "Dividend dips" : value}</Tab>)}</div>
        <div className="flex items-center gap-3.5">
          <div className="text-right"><div className="text-[11px] text-[#8c8c95]">Cash to invest</div><div className="font-mono font-semibold">{formatMoneyAs(cashReserve, currency)}</div></div>
          {top5State === "idle" ? (
            <button type="button" onClick={rankTop5} disabled={!candidates.length} className="flex items-center gap-2 rounded-[9px] border border-[#3ecf8e] bg-[#3ecf8e]/10 px-3.5 py-[9px] text-[13px] font-semibold text-[#3ecf8e] disabled:opacity-40"><Spark />Ask AI for top 5 picks</button>
          ) : null}
        </div>
      </div>

      {top5State === "loading" ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#2a2a31] bg-[#161619] p-5 text-[#8c8c95]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Ranking your top 5 dividend-dip candidates…</div>
      ) : null}

      {top5State === "open" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[#3ecf8e]/40 bg-[#3ecf8e]/[.05] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">AlphaWolf's top 5 picks <span className="font-normal text-[#8c8c95]">for {strategy.replace("_", " ")}</span></h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={rankTop5} className="rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3 py-2 text-xs text-[#8c8c95] hover:border-[#3ecf8e] hover:text-[#ececee]">Re-rank</button>
              <button type="button" onClick={applyTop5} disabled={applyingTop5} className="flex items-center gap-1.5 rounded-lg bg-[#3ecf8e] px-3.5 py-2 text-xs font-bold text-[#06120c] disabled:cursor-not-allowed disabled:opacity-50"><Spark />{applyingTop5 ? "Buying at current prices…" : "Buy all 5 now"}</button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {top5.map(({ item, amount }, index) => (
              <div key={item.symbol} className="flex items-center gap-3 rounded-lg border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3">
                <span className="font-mono text-xs text-[#5a5a62]">#{index + 1}</span>
                <button type="button" onClick={() => openDetail(item.symbol)} className="min-w-0 flex-1 text-left">
                  <span className="font-mono font-semibold">{item.symbol}</span> <span className="text-[13px] text-[#8c8c95]">{item.name}</span>
                  <div className="mt-0.5 text-xs text-[#bcbcc2]">{(item.story ?? "").slice(0, 110)}</div>
                </button>
                <span className="flex-none text-right font-mono text-sm text-[#3ecf8e]">{formatMoneyAs(amount, currency)}</span>
              </div>
            ))}
            {!top5.length ? <p className="py-4 text-center text-sm text-[#8c8c95]">No candidates match your current filters.</p> : null}
          </div>
          {applyTop5Error ? <p className="text-center text-xs text-[#f2575c]">{applyTop5Error}</p> : null}
        </div>
      ) : null}

      {top5Applied ? (
        <div className="flex items-center justify-between rounded-lg border border-[#285f48] bg-[#173528] px-4 py-3 text-sm text-[#3ecf8e]">
          <span>Bought {formatMoneyAs(top5Applied.amount, currency)} across {top5Applied.count} stocks at today's price — check your Dashboard holdings.</span>
          <button type="button" onClick={() => setTop5Applied(null)} className="text-xs text-[#82b99f] hover:text-[#ececee]">Dismiss</button>
        </div>
      ) : null}

      <div className="text-xs text-[#5a5a62]">{candidates.length} of {discoveryQuery.data?.pages[0]?.total ?? 0} stocks · sorted by {sortBy === "score" ? "DCA match score" : sortBy === "yield" ? "dividend yield" : sortBy === "change" ? "today's move" : "ticker"}</div>
      {analysis ? <AiResult value={analysis} /> : null}
      {analyzing ? <div className="flex items-center gap-3 rounded-xl border border-[#2a2a31] bg-[#141417] p-5 text-[#8c8c95]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2a2a31] border-t-[#3ecf8e]" />Analyzing…</div> : null}

      <div className="flex flex-col gap-3">
        {candidates.map((item, index) => {
          const score = item.strategyScores[strategy] ?? 0;
          const scoreColor = score >= 85 ? "#3ecf8e" : score >= 70 ? "#f5c451" : "#8c8c95";
          return (
            <div key={item.symbol} className={`grid grid-cols-[74px_1fr_auto] items-start gap-[18px] rounded-xl border bg-[#161619] px-[18px] py-4 text-left transition-colors hover:border-[#3ecf8e] ${index === 0 ? "border-[#3ecf8e]" : "border-[#2a2a31]"}`}>
              <button type="button" onClick={() => openDetail(item.symbol)} className="flex w-[74px] flex-col items-center gap-1"><div className="flex h-[66px] w-[66px] flex-col items-center justify-center rounded-full border-2" style={{ borderColor: scoreColor, background: `${scoreColor}18` }}><span className="font-mono text-[23px] font-semibold leading-none" style={{ color: scoreColor }}>{score}</span><span className="text-[9px] text-[#8c8c95]">#{index + 1}</span></div><span className="text-[10px] text-[#8c8c95]">match</span></button>
              <button type="button" onClick={() => openDetail(item.symbol)} className="text-left"><div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-base font-semibold">{item.symbol}</span><span className="text-[13px] text-[#8c8c95]">{item.name}</span><Badge>{item.symbol.endsWith(".BK") ? "Thai SET" : "US"}</Badge><Badge>{item.sector && item.sector !== "Unknown" ? item.sector : item.exchange ?? "Equity"}</Badge></div><p className="my-[9px] max-w-[640px] text-[13px] leading-[1.55] text-[#bcbcc2]">{catalogStory(item.story)}</p><div className="flex flex-wrap gap-[7px]"><Signal good={item.changePct <= 0}>{item.changePct <= 0 ? "Down today" : "Positive today"}</Signal><Signal good={item.strategyScores.yield >= 65}>Yield fit {item.strategyScores.yield}/100</Signal><Signal good={score >= 70}>{strategy.replace("_", " ")} fit {score}/100</Signal></div></button>
              <div className="flex min-w-[130px] flex-col items-end gap-2 text-right"><strong className="font-mono text-base">{formatCurrency(item.price, item.currency)}</strong><div className={`font-mono text-xs ${item.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(item.changePct)}</div><button type="button" onClick={() => askAi(item.symbol)} className="mt-1 flex items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3 py-[7px] text-xs hover:border-[#3ecf8e]"><Spark />Research</button></div>
            </div>
          );
        })}
      </div>
      <div ref={loadMoreRef} className="min-h-8 text-center text-xs text-[#5a5a62]">{discoveryQuery.isFetchingNextPage ? "Loading more live stocks…" : discoveryQuery.hasNextPage ? "Scroll for more" : candidates.length ? "End of ranked results" : ""}</div>
      {discoveryQuery.isPending ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">Scanning live market data…</div> : null}
      {discoveryQuery.isError ? <div className="rounded-xl border border-[#663438] bg-[#2c1719] p-8 text-center text-[#f2575c]">Scanner data could not be loaded.<button type="button" onClick={() => discoveryQuery.refetch()} className="ml-3 rounded border border-[#f2575c] px-3 py-1.5 text-xs">Retry</button></div> : null}
      {!discoveryQuery.isPending && !discoveryQuery.isError && !candidates.length ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">No stocks match your search and filters. Try clearing the search box or sector filter.</div> : null}
    </section>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-[7px] px-3.5 py-2 text-[13px] font-medium capitalize ${active ? "bg-[#23232a] text-[#ececee]" : "text-[#8c8c95]"}`}>{children}</button>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{children}</span>; }
function Signal({ good, children }: { good: boolean; children: React.ReactNode }) { return <span className="flex items-center gap-1.5 rounded-md border border-[#2a2a31] bg-[#0e0e10] px-[9px] py-1 text-[11.5px] text-[#bcbcc2]"><span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`}/>{children}</span>; }
function Spark() { return <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-[#3ecf8e]"><path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z"/></svg>; }
function AiResult({ value }: { value: StockAnalysisResponse }) { return <AiVerdictCard value={value} size="modal" />; }
function catalogStory(value: string) { return value.replace("weekly move", "daily move").replace("daily volatility", "session move"); }
