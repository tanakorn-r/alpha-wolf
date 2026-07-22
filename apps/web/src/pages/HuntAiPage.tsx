import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorCard } from "../components/ui/panels";
import { GoogleAccountModal } from "../components/auth/GoogleAccount";
import { Modal } from "../components/ui/Modal";
import { ExploreIcon, SearchIcon } from "../components/ui/icons";
import { AgentActionButton } from "../components/agents/AgentActionButton";
import { loadAgents } from "../lib/api";
import { AnalystTab } from "../features/hunt-ai/AnalystTab";
import { BuyTimingTab } from "../features/hunt-ai/BuyTimingTab";
import { HistoricalAnalysisTab } from "../features/hunt-ai/HistoricalAnalysisTab";
import { DecisionModeRail } from "../features/hunt-ai/DecisionModeRail";
import { ResultExperience } from "../features/hunt-ai/ResultExperience";
import { DeskBriefDrawer } from "../features/hunt-ai/DeskBriefDrawer";
import { ProPromoBanner } from "../features/hunt-ai/ProPromoBanner";
import { SignalsTab } from "../features/hunt-ai/SignalsTab";
import { TechnicalAnalysisTab } from "../features/hunt-ai/TechnicalAnalysisTab";
import type { HuntTab } from "../features/hunt-ai/lib";
import { agentName } from "../features/hunt-ai/ui";
import { useHuntAi } from "../features/hunt-ai/useHuntAi";
import { TopFivePortal } from "../features/hunt-ai/TopFivePortal";

const validActions = new Set<HuntTab>(["signals", "brief", "timing", "technical", "history", "analyst"]);
const suggestions = ["AAPL", "NVDA", "PTT.BK"];

export function HuntAiPage() {
  const hunt = useHuntAi();
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const [briefOpen, setBriefOpen] = useState(false);
  const [selectionPulse, setSelectionPulse] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get("tab") as HuntTab | null;

  useEffect(() => {
    if (queryTab === "brief") {
      setBriefOpen(true);
      if (hunt.tab === "brief") hunt.syncTab("signals");
      return;
    }
    if (queryTab && validActions.has(queryTab) && hunt.tab !== queryTab) hunt.syncTab(queryTab);
  }, [hunt.tab, hunt.syncTab, queryTab]);

  const ticker = hunt.watchlist.activeTicker;
  const previousTicker = useRef(ticker);
  const name = agentName(hunt.activeAgentId);
  const activeAgent = agentsQuery.data?.find((agent) => agent.id === hunt.activeAgentId) ?? agentsQuery.data?.[0];
  const timingRow = hunt.timing.rows[0];
  const showActionSurface = (hunt.tab === "signals" && (hunt.signals.hasRun || hunt.signals.pending || hunt.signals.fetching || hunt.signals.failed))
    || (hunt.tab === "timing" && (!hunt.premium || Boolean(timingRow?.timing || timingRow?.pending || timingRow?.fetching || timingRow?.failed)))
    || (hunt.tab === "technical" && (!hunt.premium || hunt.technical.aiLoading || Boolean(hunt.technical.analysis)))
    || (hunt.tab === "history" && (!hunt.premium || hunt.history.loading || Boolean(hunt.history.analysis) || Boolean(hunt.history.error)))
    || (hunt.tab === "analyst" && (!hunt.premium || hunt.analyst.loading || Boolean(hunt.analyst.analysis) || Boolean(hunt.analyst.error)));

  useEffect(() => {
    if (!ticker || ticker === previousTicker.current) return;
    previousTicker.current = ticker;
    setSelectionPulse(true);
    const frame = window.requestAnimationFrame(() => revealWhenNeeded("ai-verdict", true));
    const timer = window.setTimeout(() => setSelectionPulse(false), 900);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [ticker]);

  return (
    <section className="flex flex-col gap-3 text-[#ececee]">
      <ProPromoBanner open={hunt.trialModalOpen} signedIn={hunt.signedIn} onClose={hunt.closeTrialModal} onRedeem={hunt.redeemPremium} redeeming={hunt.redeemingPremium} />
      {hunt.accountSignInOpen ? <GoogleAccountModal user={hunt.accountUser} onClose={hunt.closeAccountSignIn} /> : null}
      {briefOpen ? <DeskBriefDrawer hunt={hunt} onClose={() => setBriefOpen(false)} /> : null}

      <ResearchStocks hunt={hunt} onOpenBrief={() => setBriefOpen(true)} />
      <DecisionModeRail hunt={hunt} agentName={name} agentColor={activeAgent?.color} />
      <div className="grid items-start gap-3 min-[1050px]:grid-cols-[clamp(300px,22vw,360px)_minmax(0,1fr)]">
        <div className="order-2 flex min-w-0 flex-col gap-3 min-[1050px]:order-1">
          <TopFivePortal hunt={hunt} agent={activeAgent} onExplore={() => navigate("/scanner")} />
        </div>

        <section id="ai-verdict" className="order-1 flex min-w-0 scroll-mt-4 flex-col gap-3 min-[1050px]:order-2 min-[1050px]:sticky min-[1050px]:top-3">
          {ticker ? (
            <section className="aw-analysis-stage overflow-hidden rounded-[16px] border border-white/[0.08] bg-[linear-gradient(145deg,#151719,#0f1012)] shadow-[0_26px_70px_rgba(0,0,0,.30)] transition-[border-color,box-shadow] duration-500" style={selectionPulse ? { borderColor: activeAgent?.color ?? "#3ecf8e", boxShadow: `0 0 0 3px ${activeAgent?.color ?? "#3ecf8e"}20,0 26px 70px rgba(0,0,0,.30)` } : undefined}>
              <span className="sr-only" aria-live="polite">Selected {ticker}</span>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[#3ecf8e]/20 bg-[#3ecf8e]/[0.06] font-mono text-[9px] font-black text-[#65e7ad]">AW</span>
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[18px] font-extrabold tracking-[-0.35px]">{ticker}</span>
                    {hunt.watchlist.holdingSymbols.includes(ticker) ? <span className="rounded-[5px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#3ecf8e]">Owned</span> : <span className="rounded-[5px] border border-[#74a4ff]/25 bg-[#74a4ff]/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#74a4ff]">Researching</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-[#777780]">{showActionSurface ? `${actionLabel(hunt.tab)} · ${name}'s current read` : `${actionLabel(hunt.tab)} is ready to run.`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden rounded-full border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#686871] min-[620px]:inline-flex">Live evidence</span>
                  <button type="button" onClick={() => hunt.signals.openDetail(ticker)} title={`Explore ${ticker} market data`} className="group inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.08] px-3 text-[10px] font-bold text-[#8aebc1] transition hover:-translate-y-px hover:border-[#3ecf8e]/60 hover:bg-[#3ecf8e]/[0.13]"><ExploreIcon className="text-[#3ecf8e]" /><span>Market data</span></button>
                </div>
              </div>
              {showActionSurface ? <div id="action-result" className="aw-result-enter scroll-mt-20 border-t border-white/[0.07] bg-black/[0.14] p-2.5"><ActionResult hunt={hunt} /></div> : null}
            </section>
          ) : <FirstVisitDemo hunt={hunt} agent={name} />}

          {hunt.aiError ? <ErrorCard message={hunt.aiError} /> : null}
        </section>
      </div>
    </section>
  );
}

function ResearchStocks({ hunt, onOpenBrief }: { hunt: ReturnType<typeof useHuntAi>; onOpenBrief: () => void }) {
  const list = hunt.watchlist;
  const owned = useMemo(() => new Set(list.holdingSymbols), [list.holdingSymbols]);
  const ranked = useMemo(() => new Set(hunt.strategy.shortlist), [hunt.strategy.shortlist]);
  return (
    <section id="research-stocks" className="scroll-mt-4 rounded-[11px] border border-[#2a2a31] bg-[#161619] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 min-[720px]:flex-wrap min-[720px]:overflow-visible min-[720px]:pb-0">
          <span className="mr-1 flex-none text-[9px] font-bold uppercase tracking-[0.1em] text-[#6f6f78]">Stocks</span>
          {list.symbols.map((symbol) => {
            const active = symbol === list.activeTicker;
            return (
              <span key={symbol} className={`inline-flex items-center overflow-hidden rounded-[8px] border ${active ? "border-[#3ecf8e] bg-[#3ecf8e]/[0.08]" : "border-[#2a2a31] bg-[#0e0e10]"}`}>
                <button type="button" onClick={() => list.select(symbol)} className={`px-2.5 py-1.5 font-mono text-[11px] font-bold ${active ? "text-[#ececee]" : "text-[#9a9aa3] hover:text-[#ececee]"}`}>{symbol}{owned.has(symbol) ? <span className="ml-1.5 font-sans text-[8px] text-[#3ecf8e]">OWNED</span> : null}</button>
                {ranked.has(symbol) ? <span className="border-l border-white/[0.06] px-2 py-1.5 text-[8px] font-bold text-[#f5c451]">TOP 5</span> : !owned.has(symbol) ? <button type="button" onClick={() => list.remove(symbol)} aria-label={`Remove ${symbol}`} className="border-l border-white/[0.06] px-2 py-1.5 text-[12px] text-[#5f5f68] hover:text-[#f2575c]">×</button> : null}
              </span>
            );
          })}
          <button type="button" onClick={list.toggle} className="flex-none rounded-[8px] border border-dashed border-[#3a3a43] px-2.5 py-1.5 text-[10.5px] font-bold text-[#3ecf8e] hover:border-[#3ecf8e]">+ Add</button>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={onOpenBrief}
            aria-label={hunt.deskBrief.review ? "Open saved daily brief" : "Open daily brief"}
            className="group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-[9px] border border-[#45dda0]/70 bg-[linear-gradient(135deg,rgba(62,207,142,.24),rgba(25,110,78,.18))] px-3.5 text-left shadow-[0_0_0_1px_rgba(62,207,142,.08),0_8px_24px_rgba(20,150,96,.13)] transition hover:-translate-y-px hover:border-[#69eab3] hover:bg-[linear-gradient(135deg,rgba(62,207,142,.34),rgba(25,110,78,.25))] hover:shadow-[0_0_0_1px_rgba(62,207,142,.15),0_10px_28px_rgba(20,150,96,.22)]"
          >
            <span className="relative grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-[#3ecf8e]/15 text-[#7af0bd] ring-1 ring-[#69eab3]/35">
              <span className="text-[13px] leading-none">✦</span>
              {hunt.deskBrief.review ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#69eab3] shadow-[0_0_0_2px_#153327,0_0_10px_#3ecf8e]" /> : null}
            </span>
            <span className="leading-none">
              <span className="block text-[10.5px] font-extrabold text-[#d9fff0]">{hunt.deskBrief.review ? "Open daily brief" : "Daily brief"}</span>
              <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.09em] text-[#69eab3]">{hunt.deskBrief.review ? "Saved insight ready" : "Portfolio insight"}</span>
            </span>
            <span className="ml-1 text-[14px] font-bold text-[#69eab3] transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <span className="rounded-[8px] border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[9.5px] font-bold text-[#3ecf8e]">{hunt.aiUsage.remaining} AI</span>
        </div>
      </div>
      {list.addOpen ? (
        <div className="mt-3 overflow-hidden rounded-[10px] border border-[#303038] bg-[#0e0e10]">
          <div className="relative p-2.5">
            <SearchIcon className="absolute left-[21px] top-1/2 -translate-y-1/2" />
            <input autoFocus value={list.addQuery} onChange={(event) => list.setQuery(event.target.value)} placeholder="Search AAPL, PTT.BK, NVIDIA…" aria-label="Search research stocks" className="h-10 w-full rounded-[8px] border border-[#2a2a31] bg-[#111114] pl-9 pr-3 text-[12px] outline-none focus:border-[#3ecf8e]" />
          </div>
          {list.searchLoading ? <div className="border-t border-[#202026] px-3.5 py-3 text-[11px] text-[#8c8c95]">Searching markets…</div> : null}
          {list.results.map((item) => <button key={item.symbol} type="button" onClick={() => list.add(item.symbol)} className="flex w-full items-center gap-3 border-t border-[#202026] px-3.5 py-2.5 text-left hover:bg-[#18181c]"><span className="w-[76px] font-mono text-[11.5px] font-bold">{item.symbol}</span><span className="min-w-0 flex-1 truncate text-[11px] text-[#8c8c95]">{item.name}</span><span className="text-[10px] font-bold text-[#3ecf8e]">Add</span></button>)}
        </div>
      ) : null}
    </section>
  );
}

function FirstVisitDemo({ hunt, agent }: { hunt: ReturnType<typeof useHuntAi>; agent: string }) {
  return (
    <section className="grid gap-3 rounded-[var(--aw-radius-card)] border border-[#3ecf8e]/25 bg-[radial-gradient(circle_at_80%_10%,rgba(116,164,255,.10),transparent_36%),#141618] p-5 min-[1500px]:grid-cols-[1fr_1.05fr] min-[1500px]:p-6">
      <div className="flex flex-col justify-center">
        <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#74a4ff]">Example output · free preview</div>
        <h2 className="mt-2 text-[21px] font-extrabold tracking-[-0.35px]">See the decision before asking your Agent.</h2>
        <p className="mt-2 max-w-[450px] text-[12px] leading-[1.65] text-[#8c8c95]">An Action Sheet turns valuation, business quality, timing and risk into one answer you can challenge—not a generic AI paragraph.</p>
        <div className="mt-4 flex flex-wrap gap-2">{suggestions.map((symbol) => <button key={symbol} type="button" onClick={() => hunt.watchlist.add(symbol)} className="rounded-[8px] border border-[#34343c] bg-[#0e0e10] px-3 py-2 font-mono text-[11px] font-bold hover:border-[#3ecf8e]">Research {symbol}</button>)}</div>
      </div>
      <div className="rounded-[12px] border border-[#34343c] bg-[#0d0f10] p-4 shadow-[0_18px_45px_rgba(0,0,0,.24)]">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#5f5f68]">{agent} · sample verdict</div><div className="mt-1 font-mono text-[16px] font-bold">AAPL</div></div><span className="rounded-[6px] border border-[#f5c451]/30 bg-[#f5c451]/10 px-2.5 py-1 text-[10px] font-black text-[#f5c451]">WAIT</span></div>
        <p className="mt-3 text-[13px] font-semibold leading-[1.5]">Excellent business, but the current price needs a stronger margin of safety.</p>
        <div className="mt-3 grid gap-2 min-[560px]:grid-cols-2"><SamplePoint label="Evidence" text="Durable cash generation and reinvestment quality." tone="#3ecf8e" /><SamplePoint label="Risk" text="Valuation leaves less room for execution misses." tone="#f2575c" /></div>
        <div className="mt-2 rounded-[8px] border border-[#2a2a31] bg-[#151518] px-3 py-2.5 text-[10.5px] text-[#a6a6af]"><b className="text-[#74a4ff]">Action:</b> Watch for a better entry or improving earnings evidence.</div>
      </div>
    </section>
  );
}

function SamplePoint({ label, text, tone }: { label: string; text: string; tone: string }) {
  return <div className="rounded-[8px] border border-[#25252b] bg-[#151518] p-3"><div className="text-[8.5px] font-bold uppercase tracking-[0.09em]" style={{ color: tone }}>{label}</div><div className="mt-1 text-[10.5px] leading-[1.5] text-[#a6a6af]">{text}</div></div>;
}

function AgentActionSheet({ hunt, agent, ticker, onClose }: { hunt: ReturnType<typeof useHuntAi>; agent: string; ticker: string; onClose: () => void }) {
  const timingSaved = Boolean(hunt.timing.rows[0]?.timing);
  const actions: Array<{ key: HuntTab; title: string; description: string; premium: boolean; saved: boolean }> = [
    { key: "signals", title: "Quick Verdict", description: "Buy, wait, hold, trim or avoid—with the evidence that controls the call.", premium: false, saved: hunt.signals.hasRun },
    { key: "analyst", title: "Deep Analysis", description: "Business quality, valuation, thesis, risks and what would change the decision.", premium: true, saved: Boolean(hunt.analyst.analysis) },
    { key: "history", title: "Historical Analysis", description: "What drove the price and earnings through time—and whether this year is getting better.", premium: true, saved: Boolean(hunt.history.analysis) },
    { key: "timing", title: "Buy Timing", description: "Entry conditions, seasonal evidence and a disciplined capital plan.", premium: true, saved: timingSaved },
    { key: "technical", title: "Chart Read", description: "Trend, structure, support, resistance and invalidation levels.", premium: true, saved: Boolean(hunt.technical.analysis) },
  ];

  function choose(action: typeof actions[number]) {
    onClose();
    if (!hunt.signedIn) {
      hunt.showAccountSignIn();
      return;
    }
    hunt.setTab(action.key);
    window.setTimeout(() => revealWhenNeeded("action-result", true), 60);
    if (action.premium && !hunt.premium) return;
    if (action.saved) return;
    if (action.key === "signals") hunt.signals.run();
    if (action.key === "analyst") void hunt.analyst.run();
    if (action.key === "history") void hunt.history.run(false);
    if (action.key === "timing") hunt.timing.rows[0]?.run();
    if (action.key === "technical") void hunt.technical.run(false);
  }

  return (
    <Modal title={`Ask ${agent} about ${ticker}`} onClose={onClose}>
      <p className="-mt-1 mb-4 text-[11.5px] leading-[1.55] text-[#8c8c95]">Choose the decision you need. Saved results open immediately; new questions ask your Agent for a fresh read.</p>
      <div className="grid gap-2.5">
        {actions.map((action) => (
          <button key={action.key} type="button" onClick={() => choose(action)} className="group flex w-full items-start gap-3 rounded-[11px] border border-[#303038] bg-[#101113] p-3.5 text-left hover:border-[#3ecf8e]/70 hover:bg-[#141719]">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-[8px] border border-[#34343c] bg-[#15171a] text-[#3ecf8e] transition-colors group-hover:border-[#3ecf8e]/50 group-hover:bg-[#3ecf8e]/[0.07]">
              <ActionGlyph action={action.key} />
            </span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-[12.5px] font-bold text-[#ececee]">{action.title}</span>{action.premium ? <span className="rounded-[4px] bg-[#c77dff]/15 px-1.5 py-0.5 text-[8px] font-bold text-[#c77dff]">PRO</span> : null}</span><span className="mt-1 block text-[10.5px] leading-[1.5] text-[#777780]">{action.description}</span></span>
            <span className={`flex-none rounded-[6px] px-2 py-1 text-[9px] font-bold ${action.saved ? "bg-[#74a4ff]/10 text-[#74a4ff]" : "bg-[#3ecf8e]/10 text-[#3ecf8e]"}`}>{action.saved ? "OPEN SAVED" : "ASK AGENT"}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ActionGlyph({ action }: { action: HuntTab }) {
  const common = { width: 17, height: 17, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true } as const;
  if (action === "signals") return (
    <svg {...common}><path d="M3 10.5 7.1 6.4l3 3L16.8 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.2 3h3.6v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.2 16.5h13.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" /></svg>
  );
  if (action === "analyst") return (
    <svg {...common}><circle cx="8.5" cy="8.5" r="4.8" stroke="currentColor" strokeWidth="1.6" /><path d="m12.1 12.1 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M6.4 9.7 8 8.1l1.3 1 1.5-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  if (action === "timing") return (
    <svg {...common}><circle cx="10" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="M10 6.5v4.2l2.8 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M7.5 2.8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  );
  if (action === "history") return (
    <svg {...common}><path d="M4 5.2h9.2a3.8 3.8 0 0 1 0 7.6H7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="m6.2 2.8-2.5 2.5 2.5 2.5M7 10.2h3.8M7 13h5.8M7 15.8h3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></svg>
  );
  return (
    <svg {...common}><path d="M3 16.5V4.2M3 16.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" /><path d="m5.2 13.4 3.1-3.2 2.5 1.8 4.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="15" cy="6" r="1.3" fill="currentColor" /></svg>
  );
}

function ActionResult({ hunt }: { hunt: ReturnType<typeof useHuntAi> }) {
  if (hunt.tab === "signals" && !hunt.signals.hasRun && !hunt.signals.pending && !hunt.signals.fetching && !hunt.signals.failed) return null;
  if (hunt.tab === "signals") return <ResultExperience mode="signals"><SignalsTab hunt={hunt} /></ResultExperience>;
  if (hunt.tab === "timing") {
    if (!hunt.premium) return <LockedTrialCard title="Buy Timing" onUnlock={hunt.unlockPremium} />;
    const row = hunt.timing.rows[0];
    if (row && !row.timing && !row.pending && !row.fetching && !row.failed) return null;
    return <ResultExperience mode="timing"><BuyTimingTab hunt={hunt} /></ResultExperience>;
  }
  if (hunt.tab === "technical") {
    if (!hunt.premium) return <LockedTrialCard title="Technical Analysis" onUnlock={hunt.unlockPremium} />;
    if (!hunt.technical.analysis && !hunt.technical.aiLoading) return null;
    return <ResultExperience mode="technical"><TechnicalAnalysisTab hunt={hunt} /></ResultExperience>;
  }
  if (hunt.tab === "history") {
    if (!hunt.premium) return <LockedTrialCard title="Historical Analysis" onUnlock={hunt.unlockPremium} />;
    if (!hunt.history.analysis && !hunt.history.loading && !hunt.history.error) return null;
    return <ResultExperience mode="history"><HistoricalAnalysisTab hunt={hunt} /></ResultExperience>;
  }
  if (hunt.tab === "analyst") {
    if (!hunt.premium) return <AnalystTab hunt={hunt} />;
    if (!hunt.analyst.analysis && !hunt.analyst.loading && !hunt.analyst.error) return null;
    return <ResultExperience mode="analyst"><AnalystTab hunt={hunt} /></ResultExperience>;
  }
  return <ResultExperience mode="signals"><SignalsTab hunt={hunt} /></ResultExperience>;
}

function revealWhenNeeded(id: string, alwaysOnCompact = false) {
  const target = document.getElementById(id);
  if (!target) return;
  const compact = window.matchMedia("(max-width: 1049px)").matches;
  const bounds = target.getBoundingClientRect();
  const comfortablyVisible = bounds.top >= 72 && bounds.top < window.innerHeight * 0.78;
  if ((alwaysOnCompact && compact) || !comfortablyVisible) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function actionLabel(tab: HuntTab) {
  if (tab === "analyst") return "Deep Analysis";
  if (tab === "timing") return "Buy Timing";
  if (tab === "technical") return "Chart Read";
  if (tab === "history") return "Historical Analysis";
  return "Quick Verdict";
}

function LockedTrialCard({ title, onUnlock }: { title: string; onUnlock: () => void }) {
  return (
    <div className="rounded-[12px] border border-[#3ecf8e]/25 bg-[linear-gradient(135deg,rgba(62,207,142,0.07),rgba(116,164,255,0.04))] px-6 py-9 text-center">
      <div className="text-[19px] font-bold text-[#ececee]">{title} is included in Pro</div>
      <div className="mx-auto mt-2 max-w-[430px] text-[12.5px] leading-[1.6] text-[#8c8c95]">Activate the launch offer for 30 days free. No card required; the trial ends automatically.</div>
      <button type="button" onClick={onUnlock} className="mt-4 rounded-[9px] bg-[#3ecf8e] px-5 py-2.5 text-[12.5px] font-bold text-[#07110c] hover:opacity-90">Start free Pro month</button>
    </div>
  );
}
