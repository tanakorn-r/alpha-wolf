import { useDeferredValue, useEffect, useState } from "react";
import { loadDiscoveries, loadPortfolio, summarizeStock, type StockAnalysisResponse } from "../lib/api";
import type { StockRecord } from "../data/market";
import { formatMoney, formatPercent } from "../lib/format";
import { useWolfStore } from "../store/useWolfStore";

type Strategy = "stable_dca" | "yield" | "capitalized" | "momentum";
type Market = "all" | "us" | "th";

export function DiscoverPage() {
  const globalQuery = useWolfStore((state) => state.searchQuery);
  const setGlobalQuery = useWolfStore((state) => state.setSearchQuery);
  const openDetail = useWolfStore((state) => state.openDetail);
  const query = useDeferredValue(globalQuery.trim());
  const [market, setMarket] = useState<Market>("all");
  const [strategy, setStrategy] = useState<Strategy>("stable_dca");
  const [items, setItems] = useState<StockRecord[]>([]);
  const [unallocated, setUnallocated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadDiscoveries({ q: query || undefined, kind: "stock", limit: 40 })
      .then((payload) => setItems(payload.live ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    loadPortfolio().then((portfolio) => {
      const planned = portfolio.dcaOrders.filter((order) => order.status === "planned").reduce((sum, order) => sum + order.amount, 0);
      const budget = portfolio.holdings.reduce((sum, holding) => sum + holding.monthlyDca, 0);
      setUnallocated(Math.max(0, budget - planned));
    });
  }, []);

  const candidates = items
    .filter((item) => market === "all" || (market === "th" ? item.symbol.endsWith(".BK") : !item.symbol.endsWith(".BK")))
    .sort((a, b) => (b.strategyScores[strategy] ?? 0) - (a.strategyScores[strategy] ?? 0));

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

      <div className="text-xs text-[#5a5a62]">{candidates.length} stocks · sorted by DCA match score</div>
      {analysis ? <AiResult value={analysis} /> : null}

      <div className="flex flex-col gap-3">
        {candidates.map((item, index) => {
          const score = item.strategyScores[strategy] ?? 0;
          const scoreColor = score >= 85 ? "#3ecf8e" : score >= 70 ? "#f5c451" : "#8c8c95";
          return (
            <button key={item.symbol} type="button" onClick={() => openDetail(item.symbol)} className={`grid grid-cols-[74px_1fr_auto] items-start gap-[18px] rounded-xl border bg-[#161619] px-[18px] py-4 text-left transition-colors hover:border-[#3ecf8e] ${index === 0 ? "border-[#3ecf8e]" : "border-[#2a2a31]"}`}>
              <div className="flex w-[74px] flex-col items-center gap-1"><div className="flex h-[66px] w-[66px] flex-col items-center justify-center rounded-full border-2" style={{ borderColor: scoreColor, background: `${scoreColor}18` }}><span className="font-mono text-[23px] font-semibold leading-none" style={{ color: scoreColor }}>{score}</span><span className="text-[9px] text-[#8c8c95]">#{index + 1}</span></div><span className="text-[10px] text-[#8c8c95]">match</span></div>
              <div><div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-base font-semibold">{item.symbol}</span><span className="text-[13px] text-[#8c8c95]">{item.name}</span><Badge>{item.symbol.endsWith(".BK") ? "Thai SET" : "US"}</Badge><Badge>{item.sector}</Badge></div><p className="my-[9px] max-w-[640px] text-[13px] leading-[1.55] text-[#bcbcc2]">{item.story}</p><div className="flex flex-wrap gap-[7px]"><Signal good={item.weeklyTrend <= 0}>{item.weeklyTrend <= 0 ? "Trading below last week" : "Recent momentum elevated"}</Signal><Signal good={item.strategyScores.yield >= 65}>Yield fit {item.strategyScores.yield}/100</Signal><Signal good={score >= 70}>{strategy.replace("_", " ")} fit {score}/100</Signal></div></div>
              <div className="flex min-w-[130px] flex-col items-end gap-2 text-right"><strong className="font-mono text-base">{formatMoney(item.price)}</strong><div className={`font-mono text-xs ${item.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(item.changePct)}</div><div className="mt-0.5 text-[11px] text-[#8c8c95]">Weekly <span className="font-mono text-[#ececee]">{formatPercent(item.weeklyTrend)}</span></div><div className="mt-0.5 text-[11px] text-[#8c8c95]">Suggested</div><div className="-mt-1 font-mono text-lg font-semibold text-[#8c8c95]">Watch only</div><div className="mt-1 flex items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#1c1c20] px-3 py-[7px] text-xs"><Spark />Research</div></div>
            </button>
          );
        })}
      </div>
      {loading ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">Scanning live market data…</div> : null}
      {!loading && !candidates.length ? <div className="rounded-xl border border-dashed border-[#2a2a31] bg-[#161619] p-12 text-center text-[#8c8c95]">No stocks match your search and filters.</div> : null}
    </section>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-[7px] px-3.5 py-2 text-[13px] font-medium capitalize ${active ? "bg-[#23232a] text-[#ececee]" : "text-[#8c8c95]"}`}>{children}</button>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-[5px] border border-[#2a2a31] px-[7px] py-0.5 text-[10px] text-[#8c8c95]">{children}</span>; }
function Signal({ good, children }: { good: boolean; children: React.ReactNode }) { return <span className="flex items-center gap-1.5 rounded-md border border-[#2a2a31] bg-[#0e0e10] px-[9px] py-1 text-[11.5px] text-[#bcbcc2]"><span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-[#3ecf8e]" : "bg-[#f5c451]"}`}/>{children}</span>; }
function Spark() { return <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-[#3ecf8e]"><path d="m8 1.5 1.6 4.3L14 7 9.6 8.2 8 12.5 6.4 8.2 2 7l4.4-1.2L8 1.5Z"/></svg>; }
function AiResult({ value }: { value: StockAnalysisResponse }) { return <div className="animate-[cardIn_.25s_ease] rounded-xl border border-[#3ecf8e]/40 bg-[#3ecf8e]/[.07] p-[18px]"><div className="flex items-start gap-4"><div className="grid h-16 w-16 flex-none place-items-center rounded-full border-[6px] border-[#3ecf8e] font-mono text-lg font-semibold text-[#3ecf8e]">{value.score}</div><div><span className="rounded-lg border border-[#3ecf8e] px-[11px] py-[5px] font-mono text-[13px] font-bold tracking-[.6px] text-[#3ecf8e]">AI VERDICT</span><h3 className="mt-[11px] text-[19px] font-bold">{value.recommendation}</h3><p className="mt-[7px] text-[13.5px] leading-[1.55] text-[#bcbcc2]">{value.summary}</p></div></div>{value.dcaTiming ? <div className="mt-[14px] rounded-lg border border-[#2a2a31] bg-[#0e0e10] px-3.5 py-3 text-[13px] leading-[1.5] text-[#bcbcc2]"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-[#f5c451]">DCA timing</span><p className="mt-1">{value.dcaTiming}</p></div> : null}</div>; }
