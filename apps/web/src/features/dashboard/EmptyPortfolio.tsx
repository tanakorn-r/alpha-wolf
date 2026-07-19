import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AiVerdictCard } from "../../components/AiVerdictCard";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { AgentActionButton } from "../../components/agents/AgentActionButton";
import { SearchIcon } from "../../components/ui/icons";
import { formatCurrency, formatPercent } from "../../lib/format";
import { getLocaleSettings } from "../../lib/locale";
import { loadAgents, loadDiscoveries, summarizeStock, type MarketPreference, type StockAnalysisResponse } from "../../lib/api";
import { DISCOVERY_DEBOUNCE_MS, useDebouncedValue } from "../../lib/useDebouncedValue";
import type { StockRecord } from "../../data/market";
import type { Dashboard } from "./useDashboard";

const marketFilters: Record<MarketPreference, "us" | "th" | "europe" | "japan" | "hong-kong-china"> = {
  us: "us",
  thailand: "th",
  europe: "europe",
  japan: "japan",
  "hong-kong-china": "hong-kong-china",
};

const popularSymbols = ["ADVANC.BK", "PTT.BK", "AAPL", "NVDA"];
const tickerPattern = /^[A-Z0-9^.=:-]{1,20}$/i;

export function EmptyPortfolio({ dash }: { dash: Dashboard }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [analysisSymbol, setAnalysisSymbol] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), DISCOVERY_DEBOUNCE_MS);
  const settings = dash.accountUser?.settings ?? getLocaleSettings();
  const configuredMarkets = useMemo(
    () => settings.preferredMarkets.map((market) => marketFilters[market]),
    [settings.preferredMarkets],
  );

  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const activeAgent = agentsQuery.data?.find((agent) => agent.id === dash.activeAgentId);
  const agentName = activeAgent?.name ?? "your Agent";

  const searchQuery = useQuery({
    queryKey: ["dashboard-first-research", debouncedQuery],
    queryFn: ({ signal }) => loadDiscoveries({ q: debouncedQuery, kind: "stock", region: "all", page: 1, limit: 6, signal }),
    enabled: debouncedQuery.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const ideasQuery = useQuery({
    queryKey: ["dashboard-research-ideas", configuredMarkets.join(",")],
    queryFn: ({ signal }) => loadDiscoveries({
      kind: "stock",
      region: "all",
      markets: configuredMarkets,
      strategy: "stable_dca",
      mode: "long",
      sort: "score",
      page: 1,
      limit: 6,
      signal,
    }),
    staleTime: 60_000,
    retry: 1,
    refetchInterval: (current) => current.state.data?.warming ? 2_500 : false,
  });

  const searchResults = searchQuery.data?.live ?? [];
  const ideas = (ideasQuery.data?.live ?? []).slice(0, 4);

  function selectSymbol(symbol: string) {
    setQuery(symbol);
    setSelectedSymbol(symbol);
    setSearchOpen(false);
    setError("");
    if (analysisSymbol !== symbol) setAnalysis(null);
  }

  function resolvedSymbol() {
    const normalized = query.trim().toUpperCase();
    if (selectedSymbol && normalized === selectedSymbol) return selectedSymbol;
    const exact = searchResults.find((item) => item.symbol.toUpperCase() === normalized);
    if (exact) return exact.symbol;
    if (searchResults[0]) return searchResults[0].symbol;
    return tickerPattern.test(normalized) ? normalized : "";
  }

  function openResearch(symbol?: string) {
    const target = symbol ?? resolvedSymbol();
    if (!target) {
      setError("Search for a company and choose a ticker first.");
      setSearchOpen(true);
      return;
    }
    selectSymbol(target);
    dash.openDetail(target);
  }

  async function askAgent() {
    const target = resolvedSymbol();
    if (!target) {
      setError("Search for a company and choose a ticker first.");
      setSearchOpen(true);
      return;
    }
    selectSymbol(target);
    if (!dash.signedIn) {
      dash.showSignIn();
      return;
    }
    setAnalyzing(true);
    setError("");
    try {
      const result = await summarizeStock(target, "stable_dca", dash.activeAgentId, false);
      setAnalysis(result);
      setAnalysisSymbol(target);
      void queryClient.invalidateQueries({ queryKey: ["auth-user"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AlphaWolf could not analyze this stock.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <section className="relative rounded-[18px] border border-[#3ecf8e]/35 bg-[radial-gradient(circle_at_84%_18%,rgba(116,164,255,0.12),transparent_30%),linear-gradient(145deg,#171b1b,#111114_62%)] px-5 py-6 min-[720px]:px-7 min-[720px]:py-7">
        <div className="max-w-[680px]">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#3ecf8e]">Start with research · no portfolio needed</div>
          <h2 className="mt-2 text-[25px] font-black tracking-[-0.55px] text-[#ececee] min-[720px]:text-[30px]">What stock are you thinking about?</h2>
          <p className="mt-2 max-w-[610px] text-[13px] leading-[1.65] text-[#96969f]">
            Search any SET or global ticker. Open the market evidence for free, or ask {agentName} for a direct buy, wait, hold, trim, or avoid read.
          </p>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void askAgent(); }} className="mt-5 flex max-w-[760px] flex-col gap-2.5 min-[640px]:flex-row">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedSymbol("");
                setSearchOpen(true);
                setError("");
              }}
              placeholder="Search PTT.BK, AAPL, NVIDIA…"
              aria-label="Search a stock to research"
              autoComplete="off"
              className="h-[50px] w-full rounded-[12px] border border-[#34343c] bg-[#0d0f10] pl-10 pr-3 text-[14px] text-[#ececee] outline-none transition focus:border-[#3ecf8e]"
            />
            {searchOpen && debouncedQuery && (searchQuery.isFetching || searchResults.length > 0 || searchQuery.isError) ? (
              <div className="absolute left-0 right-0 top-[56px] z-20 max-h-[270px] overflow-y-auto rounded-[12px] border border-[#34343c] bg-[#111114] shadow-[0_18px_45px_rgba(0,0,0,.45)]">
                {searchQuery.isFetching ? <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[#8c8c95]"><LoadingSpinner size={12} /> Searching markets…</div> : null}
                {!searchQuery.isFetching && searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSymbol(item.symbol)}
                    className="flex w-full items-center gap-3 border-t border-[#202026] px-4 py-3 text-left first:border-t-0 hover:bg-[#19191d]"
                  >
                    <span className="w-[76px] flex-none font-mono text-[12px] font-bold text-[#ececee]">{item.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#8c8c95]">{item.name}</span>
                    <span className="text-[10px] font-bold text-[#3ecf8e]">Select</span>
                  </button>
                ))}
                {!searchQuery.isFetching && searchQuery.isError ? <div className="px-4 py-3 text-[12px] text-[#f2575c]">Search is unavailable. Enter an exact ticker to continue.</div> : null}
              </div>
            ) : null}
          </div>
          <AgentActionButton
            type="submit"
            agent={activeAgent}
            fallbackName={agentName}
            label={analyzing ? `${agentName} is reading…` : `Ask ${agentName}`}
            sublabel={dash.signedIn ? "Agent research" : "sign in to run"}
            loading={analyzing}
            disabled={!query.trim()}
            className="w-full min-[640px]:w-auto min-[640px]:min-w-[172px]"
          />
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] uppercase tracking-[0.08em] text-[#5f5f68]">Try</span>
          {popularSymbols.map((symbol) => (
            <button key={symbol} type="button" onClick={() => selectSymbol(symbol)} className="rounded-[7px] border border-[#2a2a31] bg-[#111114] px-2.5 py-1.5 font-mono text-[10.5px] text-[#9a9aa3] hover:border-[#3ecf8e] hover:text-[#ececee]">
              {symbol}
            </button>
          ))}
          <button type="button" onClick={() => openResearch()} disabled={!query.trim()} className="ml-1 text-[11px] font-bold text-[#74a4ff] hover:text-[#9bc0ff] disabled:cursor-not-allowed disabled:opacity-40">
            Open research →
          </button>
        </div>
        {error ? <div className="mt-4 max-w-[760px] rounded-[9px] border border-[#663438] bg-[#2c1719] px-3.5 py-2.5 text-[12px] text-[#f58b8f]">{error}</div> : null}
      </section>

      {analysis ? (
        <AiVerdictCard
          value={analysis}
          onRerun={() => void askAgent()}
          bylineLabel={`First read · ${analysisSymbol}`}
        />
      ) : null}

      <div className="grid items-start gap-[14px] min-[820px]:grid-cols-[minmax(0,1.45fr)_minmax(260px,.65fr)]">
        <section className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#161619] p-4 min-[640px]:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#74a4ff]">Your research queue</div>
              <h3 className="mt-1 text-[17px] font-bold text-[#ececee]">Stocks worth investigating</h3>
              <p className="mt-1 text-[11.5px] text-[#777780]">Ranked from your preferred markets. These are research leads, not buy recommendations.</p>
            </div>
            <button type="button" onClick={() => navigate("/scanner")} className="flex-none text-[11px] font-bold text-[#3ecf8e] hover:text-[#72e4b2]">Browse all →</button>
          </div>

          <div className="mt-4 grid gap-2 min-[600px]:grid-cols-2">
            {ideas.map((item) => <ResearchIdea key={item.symbol} item={item} onOpen={() => openResearch(item.symbol)} />)}
            {ideasQuery.isPending || ideasQuery.data?.warming ? (
              <div className="col-span-full flex items-center gap-2 rounded-[10px] border border-[#2a2a31] bg-[#111114] px-3.5 py-4 text-[12px] text-[#8c8c95]"><LoadingSpinner size={13} /> Preparing ideas from your markets…</div>
            ) : null}
            {ideasQuery.isError ? <div className="col-span-full rounded-[10px] border border-[#663438] bg-[#2c1719] px-3.5 py-4 text-[12px] text-[#f58b8f]">Research ideas are unavailable right now. You can still search an exact ticker above.</div> : null}
          </div>
        </section>

        <aside className="rounded-[var(--aw-radius-card)] border border-[#2a2a31] bg-[#141416] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5f5f68]">Your portfolio</div>
            <span className="rounded-full border border-[#34343c] px-2 py-0.5 font-mono text-[9px] text-[#777780]">EMPTY</span>
          </div>
          <h3 className="mt-3 text-[18px] font-bold text-[#ececee]">Track what you already own</h3>
          <p className="mt-2 text-[12px] leading-[1.6] text-[#8c8c95]">Add holdings when you&apos;re ready to see performance, dividends, and Agent decisions in one place.</p>
          <ul className="mt-4 grid gap-2 text-[11.5px] text-[#b5b5bc]">
            <li className="flex gap-2"><span className="text-[#3ecf8e]">✓</span>Live value and cost basis</li>
            <li className="flex gap-2"><span className="text-[#3ecf8e]">✓</span>Upcoming dividend events</li>
            <li className="flex gap-2"><span className="text-[#3ecf8e]">✓</span>Portfolio-level Agent review</li>
          </ul>
          <button type="button" onClick={dash.holdingForm.show} className="mt-5 w-full rounded-[10px] bg-[#3ecf8e] px-4 py-3 text-[12.5px] font-extrabold text-[#06120c] hover:brightness-110">
            {dash.signedIn ? "+ Add a holding" : "Sign in to add holdings"}
          </button>
          <p className="mt-3 text-[10px] leading-[1.5] text-[#5f5f68]">Manual tracking only. AlphaWolf cannot access your broker or place trades.</p>
        </aside>
      </div>
    </div>
  );
}

function ResearchIdea({ item, onOpen }: { item: StockRecord; onOpen: () => void }) {
  const score = item.strategyScores.stable_dca ?? 0;
  const reason = item.story?.trim() || (item.dividendYield ? `${item.dividendYield.toFixed(2)}% dividend yield with a ${score}/100 long-term match.` : `${score}/100 long-term research match.`);
  return (
    <button type="button" onClick={onOpen} className="group rounded-[10px] border border-[#2a2a31] bg-[#101012] p-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#3ecf8e]/55">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="font-mono text-[13px] font-bold text-[#ececee]">{item.symbol}</div><div className="mt-0.5 truncate text-[10.5px] text-[#777780]">{item.name}</div></div>
        <div className="text-right"><div className="font-mono text-[12px] text-[#ececee]">{formatCurrency(item.price, item.currency)}</div><div className={`mt-0.5 font-mono text-[10px] ${item.changePct >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{formatPercent(item.changePct)}</div></div>
      </div>
      <p className="mt-3 line-clamp-2 text-[11px] leading-[1.5] text-[#8c8c95]">{reason}</p>
      <div className="mt-3 flex items-center justify-between"><span className="font-mono text-[9.5px] text-[#74a4ff]">Research match {score}/100</span><span className="text-[10px] font-bold text-[#3ecf8e] opacity-70 group-hover:opacity-100">Open →</span></div>
    </button>
  );
}
