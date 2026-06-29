import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DecideForMeCard, DeepChart, OrderCard } from "../components/DeepAnalysisPanel";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { loadDeepAnalysis, loadDiscoveries, loadPortfolio, loadUpwardMoves, type UpwardMovesResponse } from "../lib/api";
import { N100_QUOTA_LIMIT, useWolfStore } from "../store/useWolfStore";

const panel = "rounded-xl border border-[#2a2a31] bg-[#161619]";
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"] as const;
const REAL_TIMEFRAMES = new Set(["1D", "1W"]);

export function DeepAiPage() {
  const [tab, setTab] = useState<"signals" | "n100">("signals");
  const [n100Ticker, setN100Ticker] = useState("");
  const cashReserve = useWolfStore((state) => state.cashReserve);
  const deepExtras = useWolfStore((state) => state.deepExtras);
  const addDeepExtra = useWolfStore((state) => state.addDeepExtra);
  const removeDeepExtra = useWolfStore((state) => state.removeDeepExtra);
  const premium = useWolfStore((state) => state.premium);
  const unlockPremium = useWolfStore((state) => state.unlockPremium);
  const n100QuotaUsed = useWolfStore((state) => state.n100QuotaUsed);
  const useN100Quota = useWolfStore((state) => state.useN100Quota);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);

  const portfolioQuery = useQuery({ queryKey: ["portfolio"], queryFn: loadPortfolio });
  const holdingSymbols = portfolioQuery.data?.holdings.map((holding) => holding.symbol) ?? [];
  const symbols = Array.from(new Set([...holdingSymbols, ...deepExtras]));
  const activeN100Ticker = n100Ticker || symbols[0] || "KO";

  const searchQuery = useQuery({
    queryKey: ["deep-ai-search", addQuery],
    queryFn: () => loadDiscoveries({ q: addQuery, kind: "stock", limit: 6 }),
    enabled: addOpen && addQuery.trim().length >= 1,
  });
  const searchResults = (searchQuery.data?.live ?? []).filter((item) => !symbols.includes(item.symbol));

  return (
    <section className="flex flex-col gap-5 text-[#ececee]">
      <div className={`${panel} p-5`}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#5a5a62]">Deep AI Analysis</div>
        <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em]">Daily signals, exact entry zones and position sizing.</h2>
        <p className="mt-2 max-w-[760px] text-sm leading-[1.6] text-[#8c8c95]">Refreshed from live FinFeed swing-trade levels for every stock you hold — entry, stop, target and a plain-language &quot;decide for me&quot; verdict.</p>
      </div>

      <div className={`${panel} flex flex-wrap items-center gap-2 p-3`}>
        <span className="px-1 text-[11px] uppercase tracking-[0.16em] text-[#5a5a62]">Watchlist</span>
        {symbols.map((symbol) => {
          const isActiveN100 = tab === "n100" && activeN100Ticker === symbol;
          return (
            <span
              key={symbol}
              onClick={() => setN100Ticker(symbol)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono font-semibold ${isActiveN100 ? "border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#0e0e10] text-[#ececee]"}`}
            >
              {symbol}
              {!holdingSymbols.includes(symbol) ? (
                <button type="button" onClick={(event) => { event.stopPropagation(); removeDeepExtra(symbol); }} className="text-[#5a5a62] hover:text-[#f2575c]">×</button>
              ) : null}
            </span>
          );
        })}
        <div className="relative">
          <button type="button" onClick={() => setAddOpen((open) => !open)} className="rounded-md border border-dashed border-[#2a2a31] px-2.5 py-1 text-xs font-medium text-[#3ecf8e] hover:border-[#3ecf8e]">+ Add stock</button>
          {addOpen ? (
            <div className="absolute left-0 top-[calc(100%+6px)] z-10 w-64 overflow-hidden rounded-lg border border-[#2a2a31] bg-[#0e0e10] shadow-[0_18px_50px_rgba(0,0,0,.45)]">
              <input autoFocus value={addQuery} onChange={(event) => setAddQuery(event.target.value)} placeholder="Search ticker…" className="w-full border-b border-[#2a2a31] bg-transparent px-3 py-2 text-xs outline-none" />
              <div className="max-h-[180px] overflow-y-auto">
                {searchResults.map((item) => (
                  <button key={item.symbol} type="button" onClick={() => { addDeepExtra(item.symbol); setAddOpen(false); setAddQuery(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#161619]">
                    <span className="font-mono font-semibold">{item.symbol}</span>
                    <span className="truncate text-[#8c8c95]">{item.name}</span>
                  </button>
                ))}
                {!searchQuery.isFetching && addQuery.trim().length >= 1 && !searchResults.length ? <div className="px-3 py-2 text-xs text-[#8c8c95]">No matches.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        <span className="ml-auto text-[11px] text-[#5a5a62]">Shared across all tabs</span>
      </div>

      <div className="flex gap-[3px] rounded-lg border border-[#2a2a31] bg-[#0e0e10] p-[3px]">
        <TabButton active={tab === "signals"} onClick={() => setTab("signals")}>Daily Signals</TabButton>
        <TabButton active={tab === "n100"} onClick={() => setTab("n100")}>
          Next 100 ↑
          <span className="rounded-[4px] bg-gradient-to-r from-[#3ecf8e] via-[#4d96ff] to-[#c77dff] px-[5px] py-px text-[8px] font-bold tracking-[0.5px] text-white">ULTRA</span>
        </TabButton>
      </div>

      {tab === "signals" ? (
        <>
          {portfolioQuery.isPending ? (
            <div className={`${panel} flex items-center gap-3 p-8 text-[#8c8c95]`}><LoadingSpinner size={16} />Loading your holdings…</div>
          ) : null}
          {!portfolioQuery.isPending && !symbols.length ? (
            <div className={`${panel} p-10 text-center text-[#8c8c95]`}>Add a holding from the Dashboard, or a stock above, to get a Deep AI Analysis card for it here.</div>
          ) : null}
          <div className="grid gap-5 lg:grid-cols-2">
            {symbols.map((symbol) => <DeepAiCard key={symbol} symbol={symbol} cashReserve={cashReserve} />)}
          </div>
        </>
      ) : (
        <NextHundredPanel
          ticker={activeN100Ticker}
          premium={premium}
          quotaUsed={n100QuotaUsed}
          onUseQuota={useN100Quota}
          onOpenPaywall={() => setShowPaywall(true)}
        />
      )}

      {showPaywall ? <PaywallModal onClose={() => setShowPaywall(false)} onUnlock={() => { unlockPremium(); setShowPaywall(false); }} /> : null}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[13px] font-medium ${active ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}>
      {children}
    </button>
  );
}

function DeepAiCard({ symbol, cashReserve }: { symbol: string; cashReserve: number }) {
  const query = useQuery({ queryKey: ["deep-analysis", symbol], queryFn: () => loadDeepAnalysis(symbol) });
  const deep = query.data;
  const deployAmount = Math.min(Math.max(cashReserve, 0), 500) || 200;
  const shares = deep && deep.entry > 0 ? deployAmount / deep.entry : 0;

  return (
    <div className={`${panel} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#2a2a31] px-5 py-4">
        <div className="flex items-center gap-[9px]">
          <span className="font-mono text-base font-bold">{symbol}</span>
          <span className="text-xs text-[#8c8c95]">{deep?.name ?? "Live FinFeed data"}</span>
        </div>
        {deep ? <span className="rounded-[5px] border px-[9px] py-0.5 text-[10px] font-bold" style={{ background: `${deep.color}1f`, color: deep.color, borderColor: `${deep.color}55` }}>{deep.signal}</span> : null}
      </div>
      <div className="flex flex-col gap-[14px] p-5">
        {query.isPending ? <div className="flex items-center gap-[11px] py-5 text-[#8c8c95]"><LoadingSpinner size={16} />Analyzing {symbol}…</div> : null}
        {query.isError ? <DeepAiError symbol={symbol} onRetry={() => query.refetch()} retrying={query.isFetching} /> : null}
        {deep ? (
          <>
            <DeepChart deep={deep} />
            <OrderCard deep={deep} amount={deployAmount} shares={shares} />
            <DecideForMeCard deep={deep} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DeepAiError({ symbol, onRetry, retrying }: { symbol: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2a2a31] bg-[#0e0e10] p-4 text-sm text-[#f2575c]">
      Deep analysis for {symbol} is unavailable. Check the FinFeed API configuration.
      <button type="button" disabled={retrying} onClick={onRetry} className="flex flex-none items-center gap-2 rounded border border-[#f2575c] px-3 py-1.5 text-xs disabled:opacity-60">{retrying ? <LoadingSpinner size={12} /> : null}Retry</button>
    </div>
  );
}

function NextHundredPanel({ ticker, premium, quotaUsed, onUseQuota, onOpenPaywall }: { ticker: string; premium: boolean; quotaUsed: number; onUseQuota: () => void; onOpenPaywall: () => void }) {
  const [timeframe, setTimeframe] = useState<"1D" | "1W">("1D");
  const [runKey, setRunKey] = useState(0);
  const quotaLeft = N100_QUOTA_LIMIT - quotaUsed;
  const query = useQuery({
    queryKey: ["upward-moves", ticker, timeframe, runKey],
    queryFn: () => loadUpwardMoves(ticker, timeframe),
    enabled: premium && runKey > 0,
  });

  if (!premium) {
    return (
      <div className={`${panel} flex flex-col items-center gap-4 p-12 text-center`}>
        <div className="text-[26px] font-bold tracking-[-0.4px] text-[#ececee]">Next 100 Upward Moves</div>
        <p className="max-w-[480px] text-sm leading-[1.6] text-[#8c8c95]">See every real historical upward move for a ticker, ranked by how unusual the move size was for that stock — grounded in its own price history, not a forecast.</p>
        <button type="button" onClick={onOpenPaywall} className="rounded-lg bg-gradient-to-r from-[#3ecf8e] to-[#4d96ff] px-5 py-3 text-sm font-bold text-[#06120c]">Unlock Next 100 ↑ — from $29/mo</button>
      </div>
    );
  }

  return (
    <div className={`${panel} p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-[#8c8c95]">Stock <strong className="font-mono text-[#ececee]">{ticker}</strong> — pick from watchlist above</span>
        <div className="ml-auto flex gap-1">
          {TIMEFRAMES.map((tf) => {
            const enabled = REAL_TIMEFRAMES.has(tf);
            return (
              <button
                key={tf}
                type="button"
                disabled={!enabled}
                title={enabled ? undefined : "Needs a real-time intraday feed — not available yet"}
                onClick={() => { if (enabled) { setTimeframe(tf as "1D" | "1W"); setRunKey(0); } }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${!enabled ? "cursor-not-allowed text-[#3a3a40]" : timeframe === tf ? "bg-[#1c1c20] text-[#ececee]" : "text-[#8c8c95]"}`}
              >
                {tf}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#8c8c95]"><strong className="text-[#ececee]">{quotaUsed}</strong> / {N100_QUOTA_LIMIT} used</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#2a2a31]">
            <div className="h-full rounded-full bg-[#3ecf8e]" style={{ width: `${quotaUsed}%` }} />
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={quotaLeft <= 0 || query.isFetching}
        onClick={() => { onUseQuota(); setRunKey((key) => key + 1); }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#3ecf8e] to-[#4d96ff] py-3 text-sm font-bold text-[#06120c] disabled:opacity-40"
      >
        {query.isFetching ? <LoadingSpinner size={14} /> : null}
        {quotaLeft <= 0 ? "Quota used up — resets next cycle" : `Predict Next 100 Upward Moves (${ticker})`}
      </button>

      <div className="mt-4">
        {query.isFetching ? <div className="flex items-center gap-3 p-8 text-[#8c8c95]"><LoadingSpinner size={16} />Reading {ticker}&apos;s price history…</div> : null}
        {query.isError ? <div className="p-8 text-center text-sm text-[#f2575c]">Not enough history for {ticker} yet.</div> : null}
        {query.data && !query.isFetching ? <UpwardMovesResult data={query.data} timeframe={timeframe} /> : null}
      </div>
      <div className="mt-4 text-center font-mono text-[10.5px] text-[#5a5a62]">Real historical data · percentile rank of each move&apos;s size vs. {ticker}&apos;s own history · not financial advice</div>
    </div>
  );
}

function UpwardMovesResult({ data, timeframe }: { data: UpwardMovesResponse; timeframe: string }) {
  if (!data.moves.length) return <div className="p-8 text-center text-sm text-[#8c8c95]">No qualifying upward moves found in the available history.</div>;
  const avgConfidence = Math.round(data.moves.reduce((sum, move) => sum + move.confidence, 0) / data.moves.length);
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Moves mapped" value={String(data.moves.length)} sub="real occurrences" />
        <Stat label="Avg confidence" value={`${avgConfidence}/100`} sub="percentile rank" />
        <Stat label="Avg move" value={`+${data.averageMovePct}%`} sub={`across all ${data.sampleSize}`} />
        <Stat label="Timeframe" value={timeframe} sub="per move window" />
      </div>
      <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-[#2a2a31]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#2a2a31] bg-[#0e0e10] px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-[#5a5a62]">
          <span>Date</span><span>Move</span><span>Percentile</span>
        </div>
        {data.moves.map((move) => (
          <div key={move.date} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#1a1a1e] px-4 py-2 text-sm last:border-b-0">
            <span className="text-[#bcbcc2]">{move.date}</span>
            <span className="font-mono text-[#3ecf8e]">+{move.movePct}%</span>
            <span className="font-mono text-[#8c8c95]">{move.confidence}/100</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#2a2a31] bg-[#0e0e10] px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[#5a5a62]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-[#5a5a62]">{sub}</div> : null}
    </div>
  );
}

function PaywallModal({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="w-full max-w-[420px] rounded-2xl border border-[#2a2a31] bg-[#141417] p-6">
        <div className="text-center text-[22px] font-bold tracking-[-0.4px] bg-gradient-to-r from-[#ff6b6b] via-[#ffd93d] to-[#c77dff] bg-clip-text text-transparent">Unlock Next 100 ↑</div>
        <p className="mt-2 text-center text-xs text-[#8c8c95]">No real billing in this build — clicking below just flips a local flag so you can try the feature.</p>
        <div className="mt-5 flex flex-col gap-3">
          <button type="button" onClick={onUnlock} className="rounded-lg bg-gradient-to-r from-[#3ecf8e] to-[#4d96ff] py-3 text-sm font-bold text-[#06120c]">Start Pro → $29/mo</button>
          <button type="button" onClick={onUnlock} className="rounded-lg border border-[#c77dff]/50 py-3 text-sm font-semibold text-[#c77dff]">Start Elite →</button>
          <button type="button" onClick={onClose} className="text-center text-xs text-[#5a5a62] hover:text-[#ececee]">Maybe later</button>
        </div>
      </div>
    </div>
  );
}
