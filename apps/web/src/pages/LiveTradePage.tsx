import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { loadAgents, loadLiveTradeQuote, loadLiveTradeRiskReview, summarizeStock, type AgentProfile, type LiveTradeRiskReview, type LiveTradeRow } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { getLocaleSettings } from "../lib/locale";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => TradingViewWidget;
    };
  }
}

type TradingViewSymbolInfo = {
  name?: string;
  ticker?: string;
  full_name?: string;
  pro_name?: string;
  exchange?: string;
};

type TradingViewQuote = {
  ask?: number;
  bid?: number;
  change_percent?: number;
  description?: string;
  last_price?: number;
  original_name?: string;
  short_name?: string;
  exchange?: string;
  volume?: number;
};

type TradingViewWidget = {
  ready: (callback: () => void) => void;
  subscribeToQuote: (callback: (quote: TradingViewQuote) => void) => void;
  remove?: () => void;
};

type LiveAiInsight = {
  signal: string;
  confidence: number | null;
  summary: string;
  bullets: string[];
  recap?: string | null;
  agentFitReason?: string | null;
};

const seedWatch = ["NVDA", "AMD", "AAPL", "MSFT", "TSLA"];
const LIVE_AGENT_ID = "dante";
const LIVE_RED = "#ff4655";
const PAPER_TRADE_LOG_KEY = "alphawolf.dante.paper-trade-log.v1";
const PAPER_POSITION_KEY = "alphawolf.dante.paper-position.v1";
const PAPER_POSITIONS_KEY = "alphawolf.dante.paper-positions.v2";
const MAX_OPEN_ORDERS = 5;
const MAX_ORDERS_PER_SYMBOL = 3;
const TAPE_RECHECK_MS = 60_000;
const FULL_CONTEXT_REFRESH_MS = 60 * 60_000;
const DANTE_CONTEXT_VERSION = "tactical-spread-v2";
const fallbackLiveAgent: AgentProfile = {
  id: LIVE_AGENT_ID,
  name: "Dante Cross",
  mono: "DC",
  title: "The Live Quant",
  tagline: "Forex · gold · futures · asymmetric live setups",
  color: LIVE_RED,
  years: 13,
  bio: "Cross-asset execution quant for the live desk.",
  belief: "Price the risk, take the window, leave when the setup is wrong.",
  knows: [],
  style: { Discipline: 97, Patience: 12, Data: 96, Instinct: 86 },
  premium: true,
  liveTradeOnly: true,
};

const TV_SYMBOL: Record<string, string> = {
  KO: "NYSE:KO", SCHD: "AMEX:SCHD", O: "NYSE:O", ABBV: "NYSE:ABBV", MSFT: "NASDAQ:MSFT",
  JNJ: "NYSE:JNJ", SPY: "AMEX:SPY", TSLA: "NASDAQ:TSLA", NVDA: "NASDAQ:NVDA", AAPL: "NASDAQ:AAPL",
};

function tvSymbolFor(symbol: string) {
  if (TV_SYMBOL[symbol]) return TV_SYMBOL[symbol];
  if (symbol.endsWith(".BK")) return `SET:${symbol.slice(0, -3)}`;
  return symbol;
}

function appSymbolFromTradingView(info: TradingViewSymbolInfo | null) {
  if (!info) return null;
  const full = String(info.full_name ?? info.pro_name ?? info.ticker ?? "").trim().toUpperCase();
  const exchange = String(info.exchange ?? "").trim().toUpperCase();
  const fallbackName = String(info.name ?? "").trim().toUpperCase();
  const qualified = full.includes(":") ? full : exchange && fallbackName ? `${exchange}:${fallbackName}` : full || fallbackName;
  if (!qualified) return null;

  const separator = qualified.indexOf(":");
  const market = separator >= 0 ? qualified.slice(0, separator) : exchange;
  const ticker = separator >= 0 ? qualified.slice(separator + 1) : qualified;
  if (!ticker) return null;
  if (market === "SET") return `${ticker}.BK`;
  if (["NASDAQ", "NASDAQGS", "NASDAQGM", "NASDAQCM", "NYSE", "AMEX", "ARCA", "CBOE", "CBOE ONE", "BATS", "BATS_DLY"].includes(market)) return ticker;
  return market ? `${market}:${ticker}` : ticker;
}

type PaperPosition = {
  id: string;
  ticker: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  tp2: number;
  size: number;
  remainingSize: number;
  realizedPnl: number;
  tp1Hit: boolean;
  openedAt: number;
  contract: LiveForecast;
  openedBy: "MANUAL" | "DANTE";
  entryReason: string;
  invalidationReason: string;
};

type PaperExitReason = "STOP" | "CUT" | "TP2" | "TAKE" | "EXIT" | "AI_EXIT";

type TradeLogEntry = {
  at?: number;
  ts: string;
  type: string;
  ticker: string;
  side: string;
  price: number;
  pnl?: number;
  quantity?: number;
  note?: string;
};

type TradeReview = {
  ticker: string;
  result: "STOPPED" | "CUT LOSS" | "TARGET" | "AI EXIT" | "MANUAL";
  thesis: string;
  diagnosis: string;
  nextRule: string;
};

export function LiveTradePage() {
  const localeSettings = getLocaleSettings();
  const [selected, setSelected] = useState(() => loadPaperPositions()[0]?.ticker ?? "NVDA");
  const [watch, setWatch] = useState(() => {
    const savedTickers = [...new Set(loadPaperPositions().map((item) => item.ticker))];
    return savedTickers.length ? [...savedTickers, ...seedWatch.filter((symbol) => !savedTickers.includes(symbol))] : seedWatch;
  });
  const [tradingViewRows, setTradingViewRows] = useState<Record<string, LiveTradeRow>>({});
  const [spreadSamples, setSpreadSamples] = useState<Record<string, number[]>>({});
  const [estimatedSpreadSymbols, setEstimatedSpreadSymbols] = useState<Record<string, boolean>>({});
  const [autoAi, setAutoAi] = useState(false);
  const [autoTrade, setAutoTrade] = useState(false);
  const [armEpoch, setArmEpoch] = useState(0);
  const [auditElapsed, setAuditElapsed] = useState(0);
  const [tapeCheckAt, setTapeCheckAt] = useState(() => Date.now());
  const [tapeSnapshot, setTapeSnapshot] = useState<LiveTradeRow | null>(null);
  const [tapeCheckPulse, setTapeCheckPulse] = useState(false);
  const [forecastAt, setForecastAt] = useState(() => Date.now());
  const [positions, setPositions] = useState<PaperPosition[]>(loadPaperPositions);
  const [paperEquity, setPaperEquity] = useState(10_000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState(3);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>(loadPaperTradeLog);
  const [lastReview, setLastReview] = useState<TradeReview | null>(null);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [strat, setStrat] = useState<StrategyConfig>({ preset: "momentum", active: { emacross: true, macd: true, roc: true, rsi: true }, armed: false });
  const chartRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TradingViewWidget | null>(null);
  const selectedRef = useRef(selected);
  const aiLoadedKeyRef = useRef("");
  const lastAutoEntryKeyRef = useRef("");
  const settlementKeysRef = useRef(new Set<string>());
  const selectedRowRef = useRef<LiveTradeRow | null>(null);
  const widgetId = "tv-live-dante";
  const agents = useQuery({ queryKey: ["agents"], queryFn: loadAgents, staleTime: 3_600_000 });
  const liveAgent = agents.data?.find((agent) => agent.id === LIVE_AGENT_ID) ?? fallbackLiveAgent;
  const session = liveSession(new Date());
  const riskBudget = paperEquity * (riskPercent / 100);

  useEffect(() => {
    window.localStorage.setItem(PAPER_TRADE_LOG_KEY, JSON.stringify(tradeLog));
  }, [tradeLog]);

  useEffect(() => {
    window.localStorage.setItem(PAPER_POSITIONS_KEY, JSON.stringify(positions));
    window.localStorage.removeItem(PAPER_POSITION_KEY);
  }, [positions]);

  const quotes = useQueries({
    queries: watch.map((symbol) => ({
      queryKey: ["live-trade-quote", symbol],
      queryFn: () => loadLiveTradeQuote(symbol),
      refetchInterval: symbol === selected ? 5_000 : 20_000,
      staleTime: 0,
    })),
  });
  const rowFor = (symbol: string) => {
    const apiRow = quotes[watch.indexOf(symbol)]?.data?.row;
    const tapeRow = tradingViewRows[symbol];
    if (!apiRow) return tapeRow ?? null;
    if (!tapeRow) return apiRow;
    return { ...apiRow, name: tapeRow.name || apiRow.name, price: tapeRow.price ?? apiRow.price, bid: tapeRow.bid ?? apiRow.bid, ask: tapeRow.ask ?? apiRow.ask, changePct: tapeRow.changePct ?? apiRow.changePct, volume: tapeRow.volume ?? apiRow.volume, signal: tapeRow.signal || apiRow.signal };
  };
  const selectedBaseRow = rowFor(selected);
  const selectedRow = useMemo(() => {
    if (!selectedBaseRow) return null;
    const liveRsi = selectedBaseRow.rsi ?? calculateRsi(series[selected] ?? []);
    return { ...selectedBaseRow, rsi: liveRsi, rsi5: selectedBaseRow.rsi5 ?? liveRsi };
  }, [selected, selectedBaseRow, series]);
  const selectedWarning = selectedRow ? undefined : quotes[watch.indexOf(selected)]?.data?.warning;
  const selectedSpreadSamples = spreadSamples[selected] ?? [];
  const spreadReady = selectedSpreadSamples.length >= 5;
  const historicalSpreadMean = selectedSpreadSamples.length ? selectedSpreadSamples.reduce((sum, value) => sum + value, 0) / selectedSpreadSamples.length : null;

  useEffect(() => {
    selectedRowRef.current = selectedRow;
  }, [selectedRow]);

  useEffect(() => {
    if (!autoAi) {
      setTapeCheckPulse(false);
      return;
    }
    const sampleTape = () => {
      setTapeSnapshot(selectedRowRef.current);
      setTapeCheckAt(Date.now());
      setTapeCheckPulse(true);
      window.setTimeout(() => setTapeCheckPulse(false), 2_500);
    };
    sampleTape();
    const timer = window.setInterval(sampleTape, TAPE_RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [autoAi, selected]);

  useEffect(() => {
    if (!autoAi || selectedSpreadSamples.length !== 5) return;
    setTapeSnapshot(selectedRowRef.current);
    setTapeCheckAt(Date.now());
  }, [autoAi, selectedSpreadSamples.length]);

  const ai = useQuery({
    queryKey: ["live-trade-ai", selected, LIVE_AGENT_ID],
    queryFn: async () => {
      const requestKey = `${selected}:${LIVE_AGENT_ID}`;
      if (isCrossAssetSymbol(selected)) return buildLiveTapeInsight(selected, selectedRow);
      const result = await summarizeStock(selected, "momentum", LIVE_AGENT_ID, aiLoadedKeyRef.current === requestKey);
      aiLoadedKeyRef.current = requestKey;
      return result;
    },
    enabled: autoAi && selectedRow?.price != null,
    refetchInterval: autoAi ? FULL_CONTEXT_REFRESH_MS : false,
    staleTime: FULL_CONTEXT_REFRESH_MS - 60_000,
  });

  const candidateForecast = useMemo(
    () => buildForecast(selected, selectedRow, ai.data, forecastAt),
    [ai.data, forecastAt, selected, selectedRow],
  );
  const selectedPositions = positions.filter((item) => item.ticker === selected);
  const activeBookSymbol = positions[0]?.ticker ?? null;
  const bookSymbolBlocked = activeBookSymbol != null && activeBookSymbol !== selected;
  const position = selectedPositions[0] ?? null;
  const viewingOpenPosition = position != null;
  const forecast = viewingOpenPosition && position ? position.contract : candidateForecast;
  const tracker = useMemo(() => buildTracker(forecast, selectedRow), [forecast, selectedRow]);
  const trancheRiskBudget = riskBudget / 2;
  const openRisk = useMemo(() => positions.reduce((sum, item) => sum + Math.abs(item.entry - item.sl) * item.remainingSize, 0), [positions]);

  // Accumulate a client-side tick series per ticker to feed the indicator engine.
  const price = selectedRow?.price ?? null;
  useEffect(() => {
    if (price == null) return;
    setSeries((prev) => {
      const current = prev[selected];
      if (!current) return { ...prev, [selected]: seedSeries(price) };
      if (current[current.length - 1] === price) return prev;
      return { ...prev, [selected]: [...current, price].slice(-240) };
    });
  }, [price, selected]);

  const stratSignal = useMemo(() => computeStrategy(series[selected] ?? [], strat.active), [series, selected, strat.active]);
  const candidateDecision = useMemo(() => buildDecisionNarrative(candidateForecast, selectedRow, stratSignal, ai.data), [ai.data, candidateForecast, selectedRow, stratSignal]);
  const decisionNarrative = viewingOpenPosition && position ? { summary: position.entryReason, trigger: "Contract is live; no new entry signal is accepted.", invalidation: position.invalidationReason } : candidateDecision;
  // The paper desk treats UTC as broker/server time so the daily kill switch resets
  // deterministically at 00:00 even when the browser timezone changes.
  const serverDayKey = new Date().toISOString().slice(0, 10);
  const liveRealizedPnl = tradeLog.filter((entry) => entry.at != null && new Date(entry.at).toISOString().slice(0, 10) === serverDayKey).reduce((total, entry) => total + (entry.pnl ?? 0), 0);
  const liveFloatingPnl = positions.reduce((total, item) => {
    const current = rowFor(item.ticker)?.price ?? item.entry;
    return total + (current - item.entry) * item.remainingSize * (item.side === "LONG" ? 1 : -1);
  }, 0);
  const drawdownKillSwitch = liveRealizedPnl + liveFloatingPnl <= -(paperEquity * maxDailyLossPercent / 100);
  const primaryFavorableR = position && selectedRow?.price != null ? ((selectedRow.price - position.entry) * (position.side === "LONG" ? 1 : -1)) / (Math.abs(position.entry - position.sl) || 1) : 0;
  const riskReview = useQuery({
    queryKey: ["dante-risk-review", DANTE_CONTEXT_VERSION, selected, viewingOpenPosition ? position?.openedAt : forecast.generatedAt, paperEquity, riskPercent, maxDailyLossPercent, drawdownKillSwitch, armEpoch],
    queryFn: () => loadLiveTradeRiskReview({
      symbol: selected,
      direction: forecast.direction,
      timeframe: "1-minute execution chart",
      entry: forecast.entry,
      stop: forecast.stop,
      tp1: forecast.target,
      tp2: forecast.target2 ?? forecast.target,
      coreThesis: decisionNarrative.summary,
      positionOpen: viewingOpenPosition,
      openPositions: positions.map((item) => ({ ticker: item.ticker, direction: item.side, entry: item.entry, stop: item.sl, tp1: item.tp, tp2: item.tp2, units: item.remainingSize, floatingPnl: (rowFor(item.ticker)?.price ?? item.entry) - item.entry })),
      accountEquity: paperEquity,
      riskPercent,
      bookRiskCap: riskBudget,
      trancheRiskBudget,
      openRisk,
      remainingRiskCapacity: Math.max(0, riskBudget - openRisk),
      maxDailyLossPercent,
      realizedPnl: liveRealizedPnl,
      floatingPnl: liveFloatingPnl,
      favorableR: primaryFavorableR,
      drawdownKillSwitch,
      bid: selectedRow?.bid,
      ask: selectedRow?.ask,
      spreadMultiplierLimit: 2,
      historicalSpreadMean,
      spreadSampleCount: selectedSpreadSamples.length,
      spreadDataMode: estimatedSpreadSymbols[selected] ? "conservative_paper_estimate" : "live_bid_ask",
      currentPrice: selectedRow?.price,
      changePct: selectedRow?.changePct,
      rsi: selectedRow?.rsi,
      relativeVolume: selectedRow?.relativeVolume,
      session: `${session.name} — ${session.detail}`,
      maximumHoldMinutes: forecast.windowMin[1],
      strategyEvidence: stratSignal.rows.map((rule) => ({ name: rule.name, reading: rule.reading, bias: rule.bias, note: rule.note })),
      multiTimeframe: [
        { timeframe: "1m", changePct: selectedRow?.changePct, rsi: selectedRow?.rsi },
        { timeframe: "5m", changePct: selectedRow?.change5, rsi: selectedRow?.rsi5 },
        { timeframe: "15m", changePct: selectedRow?.change15, rsi: selectedRow?.rsi15 },
        { timeframe: "1h", changePct: selectedRow?.change60, rsi: selectedRow?.rsi60 },
        { timeframe: "4h", changePct: selectedRow?.change240, rsi: selectedRow?.rsi240 },
      ],
      suppliedInvalidation: decisionNarrative.invalidation,
    }),
    enabled: autoAi && spreadReady && forecast.direction !== "WAIT" && forecast.entry != null && forecast.stop != null && forecast.target != null,
    refetchInterval: autoAi ? FULL_CONTEXT_REFRESH_MS : false,
    staleTime: FULL_CONTEXT_REFRESH_MS - 60_000,
    retry: false,
  });
  const auditedDirection = riskReview.data?.direction ?? forecast.direction;
  const auditedEntry = riskReview.data?.entryPrice ?? forecast.entry;
  const auditedStop = riskReview.data?.hardStopLoss ?? forecast.stop;
  const auditedTp1 = riskReview.data?.takeProfitTargets[0] ?? forecast.target;
  const auditedTp2 = riskReview.data?.takeProfitTargets[1] ?? riskReview.data?.takeProfitTargets[0] ?? forecast.target2;
  const auditedColor = auditedDirection === "SHORT" ? "#f2575c" : auditedDirection === "LONG" ? "#3ecf8e" : "#f5c451";
  const tapeDecision = useMemo(
    () => buildLeanTapeDecision(riskReview.data, tapeSnapshot, trancheRiskBudget, historicalSpreadMean, selectedSpreadSamples.length, drawdownKillSwitch),
    [drawdownKillSwitch, historicalSpreadMean, riskReview.data, selectedSpreadSamples.length, tapeCheckAt, tapeSnapshot, trancheRiskBudget],
  );

  useEffect(() => {
    if (!riskReview.isFetching) {
      setAuditElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setAuditElapsed(0);
    const timer = window.setInterval(() => setAuditElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [riskReview.isFetching]);

  useEffect(() => {
    let cancelled = false;
    async function mountWidget() {
      await ensureTradingViewScript();
      if (cancelled || !chartRef.current || !window.TradingView) return;
      chartRef.current.innerHTML = "";
      const container = document.createElement("div");
      container.id = widgetId;
      container.className = "h-full w-full";
      chartRef.current.appendChild(container);
      const widget = new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbolFor(selectedRef.current),
        interval: "1",
        timezone: localeSettings.timezone,
        theme: "dark",
        style: "1",
        locale: localeSettings.displayLanguage.split("-")[0],
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies: ["RSI@tv-basicstudies", "Volume@tv-basicstudies"],
        container_id: widgetId,
      });
      widgetRef.current = widget;
      widget.ready(() => {
        if (cancelled) return;
        const applySelectedSymbol = (next: string | null) => {
          if (!next || next === selectedRef.current) return;
          selectedRef.current = next;
          setWatch((items) => [next, ...items.filter((item) => item !== next)].slice(0, 10));
          setSelected(next);
        };
        widget.subscribeToQuote((quote) => {
          if (cancelled) return;
          const next = appSymbolFromTradingView({
            full_name: quote.original_name,
            name: quote.short_name,
            exchange: quote.exchange,
          });
          if (!next) return;
          if (typeof quote.last_price === "number" && Number.isFinite(quote.last_price)) {
            const changePct = typeof quote.change_percent === "number" && Number.isFinite(quote.change_percent) ? quote.change_percent : null;
            const rawBid = typeof quote.bid === "number" && Number.isFinite(quote.bid) ? quote.bid : null;
            const rawAsk = typeof quote.ask === "number" && Number.isFinite(quote.ask) ? quote.ask : null;
            const hasLiveSpread = rawBid != null && rawAsk != null && rawAsk >= rawBid;
            const estimatedSpread = paperSpreadEstimate(next, quote.last_price);
            const bid = hasLiveSpread ? rawBid! : quote.last_price - estimatedSpread / 2;
            const ask = hasLiveSpread ? rawAsk! : quote.last_price + estimatedSpread / 2;
            setEstimatedSpreadSymbols((modes) => modes[next] === !hasLiveSpread ? modes : { ...modes, [next]: !hasLiveSpread });
            setSpreadSamples((samples) => ({ ...samples, [next]: [...(samples[next] ?? []), ask - bid].slice(-120) }));
            setTradingViewRows((rows) => ({
              ...rows,
              [next]: {
                symbol: next,
                name: quote.description || quote.short_name || next,
                price: quote.last_price,
                bid,
                ask,
                changePct,
                volume: typeof quote.volume === "number" && Number.isFinite(quote.volume) ? quote.volume : null,
                relativeVolume: null,
                rsi: null,
                rsi5: null,
                signal: changePct == null ? "Live tape" : changePct > 0 ? "Momentum up" : changePct < 0 ? "Momentum down" : "Flat tape",
              },
            }));
          }
          applySelectedSymbol(next);
        });
      });
    }
    void mountWidget();
    return () => {
      cancelled = true;
      // TradingView's hosted widget can throw from tv.js when its `remove()` races
      // React removing the route subtree. Let React dispose the iframe with this
      // component instead; callbacks are already guarded by `cancelled`.
      widgetRef.current = null;
    };
  }, [localeSettings.displayLanguage, localeSettings.timezone]);

  useEffect(() => {
    setForecastAt(Date.now());
  }, [selected]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function enterPosition(scaleIn = false) {
    const review = riskReview.data;
    if (!review || tapeDecision.action !== "EXECUTE" || tapeDecision.calculatedPositionSize <= 0) return;
    if (bookSymbolBlocked) return;
    if (positions.length >= MAX_OPEN_ORDERS || selectedPositions.length >= MAX_ORDERS_PER_SYMBOL) return;
    const direction = review.direction;
    const entry = tapeDecision.price ?? selectedRow?.price ?? review.entryPrice;
    const stop = review.hardStopLoss;
    const tp1 = review.takeProfitTargets[0];
    const tp2 = review.takeProfitTargets[1] ?? tp1;
    if (entry == null || stop == null || tp1 == null) return;
    const risk = Math.abs(entry - stop) || entry * 0.004;
    const availableRisk = Math.max(0, Math.min(trancheRiskBudget, riskBudget - openRisk));
    const locallyCappedSize = Math.floor(availableRisk / risk);
    const aiSize = Math.floor(Math.min(review.calculatedPositionSize, tapeDecision.calculatedPositionSize));
    const size = Math.min(locallyCappedSize, Math.max(0, aiSize));
    if (size < 1) return;
    const openedAt = Date.now();
    const executedContract: LiveForecast = { ...forecast, direction, entry, stop, target: tp1, target2: tp2, targetPct: ((tp1 - entry) / entry) * 100, color: direction === "LONG" ? "#3ecf8e" : "#f2575c" };
    const nextPosition: PaperPosition = { id: `${openedAt}:${selected}:${positions.length}`, ticker: selected, side: direction, entry, sl: stop, tp: tp1, tp2, size, remainingSize: size, realizedPnl: 0, tp1Hit: false, openedAt, contract: executedContract, openedBy: "DANTE", entryReason: `${scaleIn ? "QUANT SCALE-IN · " : ""}${review.quantitativeJustification}`, invalidationReason: review.invalidationCheck };
    setPositions((items) => [nextPosition, ...items]);
    setTradeLog((log) => [{ at: openedAt, ts: new Date(openedAt).toLocaleTimeString(), type: scaleIn ? "ADD" : "ENTER", ticker: selected, side: direction, price: entry, quantity: size, note: `DANTE · ${nextPosition.entryReason}` }, ...log].slice(0, 40));
  }

  function exitPosition(positionId: string, reason: PaperExitReason) {
    const closing = positions.find((item) => item.id === positionId);
    if (!closing) return;
    const settlementKey = `${closing.openedAt}:${reason}`;
    if (settlementKeysRef.current.has(settlementKey)) return;
    settlementKeysRef.current.add(settlementKey);
    const last = rowFor(closing.ticker)?.price ?? closing.entry;
    const pnl = (last - closing.entry) * closing.remainingSize * (closing.side === "LONG" ? 1 : -1);
    const note = reason === "STOP" ? `AUTO STOP · THESIS FAILED · ${closing.invalidationReason}` : reason === "AI_EXIT" ? `DANTE EXIT · HOURLY CONTEXT AUDIT REJECTED THESIS · ${riskReview.data?.ratingReason ?? closing.invalidationReason}` : reason === "CUT" ? "MANUAL OVERRIDE · loss cut before the hard stop" : reason === "TP2" ? "AUTO TP2 · final target executed · thesis completed" : reason === "TAKE" ? "MANUAL OVERRIDE · profit taken before the automatic target" : "MANUAL OVERRIDE · position closed before invalidation or target";
    setTradeLog((log) => [{ at: Date.now(), ts: new Date().toLocaleTimeString(), type: reason, ticker: closing.ticker, side: closing.side, price: last, pnl, quantity: closing.remainingSize, note }, ...log].slice(0, 40));
    setLastReview({
      ticker: closing.ticker,
      result: reason === "STOP" ? "STOPPED" : reason === "AI_EXIT" ? "AI EXIT" : reason === "CUT" ? "CUT LOSS" : reason === "TP2" ? "TARGET" : "MANUAL",
      thesis: closing.entryReason,
      diagnosis: reason === "STOP" ? `The ${closing.side} premise failed because price crossed the locked stop at ${formatLivePrice(closing.sl)}. Momentum did not follow through; Dante's directional read was wrong for this window.` : reason === "AI_EXIT" ? `Dante's latest multi-timeframe audit explicitly rejected the locked ${closing.side} thesis before the hard stop. ${riskReview.data?.ratingReason ?? "The confluence no longer justified carrying risk."}` : reason === "CUT" ? `The position was cut before the hard stop. The setup had weakened or the operator chose not to carry the remaining risk, so this is a defensive exit—not proof that the original stop was hit.` : reason === "TP2" ? `Price completed the planned move through TP2 at ${formatLivePrice(closing.tp2)} without breaking the locked invalidation.` : reason === "TAKE" ? "Profit was taken manually before Dante's automatic target. The trade made money, but the original target was not tested." : "The trade was closed by the user before the system could prove or disprove the original thesis.",
      nextRule: reason === "STOP" || reason === "CUT" ? `No immediate revenge trade. Wait for a fresh contract and confirmation back through ${formatLivePrice(closing.entry)} before considering the same direction.` : "Create a fresh contract from the new price; never extend an already completed setup.",
    });
    setPositions((items) => items.filter((item) => item.id !== positionId));
  }

  useEffect(() => {
    if (!autoTrade || drawdownKillSwitch || bookSymbolBlocked || forecast.direction === "WAIT" || forecast.entry == null || forecast.stop == null || forecast.target == null) return;
    if (!riskReview.data || tapeDecision.action !== "EXECUTE" || riskReview.data.executionRating < 6 || riskReview.data.newsBlackout || riskReview.data.spreadCheck !== "PASS" || riskReview.data.drawdownCheck !== "PASS") return;
    let scaleIn = false;
    if (position) {
      const current = selectedRow?.price;
      const initialRisk = Math.abs(position.entry - position.sl) || 1;
      const favorableMove = current == null ? 0 : (current - position.entry) * (position.side === "LONG" ? 1 : -1);
      scaleIn = riskReview.data.executionRating >= 8 && !position.tp1Hit && position.side === riskReview.data.direction && favorableMove >= initialRisk * 0.5;
      if (!scaleIn) return;
    }
    const entryKey = `${forecast.symbol}:${position?.id ?? forecast.generatedAt}:${riskReview.data.direction}:${selectedPositions.length}`;
    if (lastAutoEntryKeyRef.current === entryKey) return;
    lastAutoEntryKeyRef.current = entryKey;
    enterPosition(scaleIn);
  }, [autoTrade, bookSymbolBlocked, forecast, position, positions.length, riskReview.data, selectedPositions.length, selectedRow?.price, tapeDecision]);

  useEffect(() => {
    if (!autoTrade || !position || riskReview.isFetching || riskReview.data?.action !== "REJECT") return;
    exitPosition(position.id, "AI_EXIT");
  }, [autoTrade, position, riskReview.data, riskReview.isFetching]);

  useEffect(() => {
    for (const item of positions) {
      const current = rowFor(item.ticker)?.price;
      if (current == null) continue;
      const stopped = item.side === "LONG" ? current <= item.sl : current >= item.sl;
      const hitTp2 = item.side === "LONG" ? current >= item.tp2 : current <= item.tp2;
      const hitTp1 = item.side === "LONG" ? current >= item.tp : current <= item.tp;
      if (stopped) {
        exitPosition(item.id, "STOP");
        continue;
      }
      if (hitTp2) {
        exitPosition(item.id, "TP2");
        continue;
      }
      if (hitTp1 && !item.tp1Hit) {
        const settlementKey = `${item.openedAt}:TP1`;
        if (settlementKeysRef.current.has(settlementKey)) continue;
        settlementKeysRef.current.add(settlementKey);
        const quantity = item.remainingSize > 1 ? Math.max(1, Math.floor(item.remainingSize / 2)) : item.remainingSize;
        const pnl = (current - item.entry) * quantity * (item.side === "LONG" ? 1 : -1);
        setTradeLog((log) => [{ at: Date.now(), ts: new Date().toLocaleTimeString(), type: "TP1", ticker: item.ticker, side: item.side, price: current, pnl, quantity, note: "AUTO TP1 · partial profit executed" }, ...log].slice(0, 40));
        if (quantity >= item.remainingSize) setPositions((items) => items.filter((candidate) => candidate.id !== item.id));
        else setPositions((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, remainingSize: candidate.remainingSize - quantity, realizedPnl: candidate.realizedPnl + pnl, tp1Hit: true } : candidate));
      }
    }
  }, [positions, tradingViewRows, quotes]);

  const realizedPnl = useMemo(() => tradeLog.reduce((total, entry) => total + (entry.pnl ?? 0), 0), [tradeLog]);
  const unrealizedPnl = positions.reduce((total, item) => {
    const current = rowFor(item.ticker)?.price ?? item.entry;
    return total + (current - item.entry) * item.remainingSize * (item.side === "LONG" ? 1 : -1);
  }, 0);
  const totalPnl = realizedPnl + unrealizedPnl;

  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-[14px] border border-[#ff4655]/30 bg-[radial-gradient(circle_at_85%_0%,rgba(255,70,85,.17),transparent_36%),linear-gradient(145deg,#1a1518,#101012_62%)] p-4 shadow-[0_20px_60px_rgba(0,0,0,.28)] min-[760px]:p-5">
        <div className="absolute inset-y-0 left-0 w-1 bg-[#ff4655]" />
        <div className="grid items-start gap-4 min-[840px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[12px] border border-[#ff4655]/45 bg-[#ff4655]/10 font-mono text-[13px] font-black text-[#ff6b76] shadow-[0_0_28px_rgba(255,70,85,.13)]">{liveAgent.avatarUrl ? <img src={liveAgent.avatarUrl} alt="" className="h-full w-full object-cover" /> : liveAgent.mono}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-black text-[#f2f2f4]">{liveAgent.name}</span><span className="rounded-full border border-[#ff4655]/35 bg-[#ff4655]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Live desk exclusive</span></div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#ff6673]">{liveAgent.title} · Red desk</div>
              <p className="mt-2 max-w-[720px] text-[11.5px] leading-[1.55] text-[#a9a9b1]">I do not invest in this workspace. I take temporary, bounded-risk setups in liquid markets—and every call must define entry, invalidation, profit targets and maximum holding time.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DeskStatus label="Active window" value={session.name} detail={session.detail} color={session.color} />
            <DeskStatus label="Event risk" value={!autoAi ? "OFF" : riskReview.data ? (riskReview.data.newsBlackout ? "BLACKOUT" : "CALENDAR CHECKED") : ai.data ? eventRiskLabel(ai.data) : "UNVERIFIED"} detail={!autoAi ? "Dante is not running" : riskReview.data ? (riskReview.data.newsBlackout ? "No entry inside ±30 minutes" : "No Tier-1 blackout reported") : ai.data ? "Awaiting calendar audit" : "Activate Dante to inspect"} color={riskReview.data?.newsBlackout && autoAi ? "#ff6673" : "#f5c451"} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-[13px] border border-[#2a2a31] bg-[#141417] p-3 min-[760px]:grid-cols-[1fr_1fr_1.25fr] min-[760px]:items-center">
        <div>
          <div className="text-[8.5px] font-black uppercase tracking-[0.1em] text-[#6f6f78]">Execution mode</div>
          <div className="mt-2 inline-flex rounded-[9px] border border-[#2a2a31] bg-[#0e0e10] p-1">
            <button type="button" className="rounded-[6px] bg-[#ff4655] px-4 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-white">Paper</button>
            <button type="button" disabled title="Connect a supported broker API to enable real execution" className="cursor-not-allowed rounded-[6px] px-4 py-2 text-[10px] font-black uppercase tracking-[0.06em] text-[#4f4f57]">Real · locked</button>
          </div>
        </div>
        <div className="min-[760px]:border-l min-[760px]:border-[#26262c] min-[760px]:pl-4">
          <div className="text-[8.5px] font-black uppercase tracking-[0.1em] text-[#6f6f78]">Dante analysis</div>
          <button type="button" onClick={() => setAutoAi((enabled) => { if (enabled) setAutoTrade(false); return !enabled; })} className={`mt-2 rounded-[8px] border px-3 py-2 text-[10.5px] font-bold ${autoAi ? "border-[#3ecf8e]/40 bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#303038] bg-[#1a1a1e] text-[#898991]"}`}>{autoAi ? "● ON · tape 1m / context 1h" : "○ OFF · live tape only"}</button>
        </div>
        <div className="min-[760px]:border-l min-[760px]:border-[#26262c] min-[760px]:pl-4">
          <div className="flex items-center justify-between gap-3"><div><div className="text-[8.5px] font-black uppercase tracking-[0.1em] text-[#6f6f78]">AI trade permission</div><div className="mt-1 text-[9.5px] text-[#5f5f68]">Allows Dante to open and manage bounded paper tranches</div></div><button type="button" onClick={() => { if (autoTrade) setAutoTrade(false); else { setAutoAi(true); setArmEpoch(Date.now()); setAutoTrade(true); } }} className={`relative h-7 w-12 flex-none rounded-full border transition-colors ${autoTrade ? "border-[#ff4655] bg-[#ff4655]" : "border-[#36363e] bg-[#202025]"}`} aria-label={autoTrade ? "Disable AI paper trading" : "Enable AI paper trading"}><span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${autoTrade ? "left-[25px]" : "left-[3px]"}`} /></button></div>
          <div className={`mt-2 text-[10px] font-black uppercase tracking-[0.05em] ${autoTrade ? "text-[#ff6673]" : "text-[#686871]"}`}>{autoTrade ? "Armed · simulated orders may execute" : "Disarmed · analysis only"}</div>
        </div>
      </section>

      {drawdownKillSwitch ? <section className="rounded-[12px] border-2 border-[#ff4655] bg-[#ff4655]/10 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#ff6673]">Daily drawdown kill switch active</div><p className="mt-1 text-[10.5px] text-[#c9a3a6]">Realized plus floating P/L breached {maxDailyLossPercent}% of paper equity. Dante cannot add risk until 00:00 UTC server time; existing stops remain armed.</p></section> : null}

      {bookSymbolBlocked ? <section className="rounded-[12px] border border-[#f5c451]/35 bg-[#f5c451]/[0.06] px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#f5c451]">Quant book locked to {activeBookSymbol}</div><p className="mt-1 text-[10.5px] text-[#aaa18d]">You can analyze {selected}, but Dante cannot open it while {activeBookSymbol} has active tranches. Return to {activeBookSymbol} to manage the position or close that book first.</p></section> : null}

      {/* Main grid: TradingView + AI intelligence */}
      <div className="grid items-start gap-[14px] min-[1180px]:grid-cols-[minmax(0,1fr)_366px]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <section className="overflow-hidden rounded-[12px] border border-[#2a2a31] bg-[#161619]">
            <div ref={chartRef} className="h-[400px] w-full bg-[#0e0e10] min-[720px]:h-[544px]" />
          </section>
          <TradeHistoryPanel entries={tradeLog} realizedPnl={realizedPnl} onClear={() => setTradeLog([])} />
        </div>

        <aside className="flex flex-col gap-3">
          {/* Execution is the primary decision surface. Analysis supports it below. */}
          {positions.length ? (
            <ActiveOrdersBook positions={positions} rowFor={rowFor} openRisk={openRisk} riskCap={riskBudget} onExit={exitPosition} />
          ) : (
            <div className="rounded-[13px] border-2 border-[#34343c] bg-[#101012] p-[15px]">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#7a7a84]">Execution status</div><div className="mt-1 text-[19px] font-black text-[#ececee]">No paper position open</div></div>
                <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${autoTrade ? "border-[#ff4655]/40 bg-[#ff4655]/10 text-[#ff6673]" : "border-[#34343c] text-[#74747d]"}`}>{autoTrade ? "AI armed" : "AI disarmed"}</span>
              </div>
              <div className="mt-3 rounded-[9px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-[10.5px] leading-[1.5] text-[#aaaab2]">
                {!autoAi ? "Dante is offline. No setup is being evaluated and no order can execute." : !autoTrade ? "Analysis is running, but execution permission is disarmed. No order can execute." : riskReview.isFetching && !riskReview.data ? `First multi-timeframe audit · ${auditElapsed}s elapsed · hard stop at 50s. No order exists.` : tapeDecision.action === "HOLD" ? `No order exists. ${tapeDecision.reason}${riskReview.isFetching ? " Hourly context is resyncing in the background." : ""}` : tapeDecision.action === "REJECT" ? `No order exists. ${tapeDecision.reason}${riskReview.isFetching ? " Hourly context is resyncing in the background." : ""}` : riskReview.data?.action === "EXECUTE" ? `Dante's hourly thesis and latest one-minute tape check authorize a ${riskReview.data.direction} paper order.` : "Dante is scanning. No audited setup exists yet."}
              </div>
            </div>
          )}

          {autoAi && !spreadReady && !riskReview.data ? (
            <div className="rounded-[13px] border border-[#ff4655]/35 bg-[#141417] p-[15px]">
              <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Execution preflight · {selected}</span><span className="font-mono text-[9px] text-[#f5c451]">{selectedSpreadSamples.length}/5 samples</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#24242a]"><div className="h-full rounded-full bg-[#ff4655] transition-[width]" style={{ width: `${(selectedSpreadSamples.length / 5) * 100}%` }} /></div>
              <p className="mt-2 text-[10px] leading-[1.5] text-[#8f8f98]">Calibrating the paper spread before the AI audit. No order can execute until five quote samples exist.</p>
            </div>
          ) : null}

          <RiskAuditCard
            symbol={selected}
            forecast={forecast}
            review={riskReview.data}
            loading={riskReview.isFetching}
            error={riskReview.error instanceof Error ? riskReview.error.message : null}
            active={autoAi}
            locked={viewingOpenPosition}
            elapsedSeconds={auditElapsed}
            tapeDecision={tapeDecision}
            tapeChecking={tapeCheckPulse}
            tapeCheckAt={tapeCheckAt}
            spreadEstimated={Boolean(estimatedSpreadSymbols[selected])}
            onRefresh={() => void riskReview.refetch()}
          />

          {/* This surface exists only while autonomous execution is genuinely armed. */}
          {autoTrade && riskReview.data && !bookSymbolBlocked && positions.length < MAX_OPEN_ORDERS && selectedPositions.length < MAX_ORDERS_PER_SYMBOL && openRisk < riskBudget ? (
            <div className="rounded-[12px] border border-[#ff4655]/25 bg-[linear-gradient(145deg,rgba(255,70,85,.055),#161619_40%)] p-[15px]">
              <div className="mb-[10px] flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#ff6673]">{tapeDecision.action === "HOLD" ? "No order · Dante waiting" : tapeDecision.action === "REJECT" ? "No order · setup rejected" : "Execution authorized"}</span><div className="flex items-center gap-1.5">{tapeCheckPulse ? <span className="inline-flex items-center gap-1 rounded-full border border-[#ff4655]/45 bg-[#ff4655]/10 px-2 py-0.5 font-mono text-[8px] font-black uppercase text-[#ff8992]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff4655]" />Repricing tape</span> : null}{riskReview.isFetching && riskReview.data ? <span className="rounded-full border border-[#f5c451]/35 bg-[#f5c451]/10 px-2 py-0.5 font-mono text-[8px] font-black uppercase text-[#f5c451]">Context sync {auditElapsed}s</span> : null}<span className="rounded-full border px-2 py-0.5 text-[8px] font-black uppercase" style={{ borderColor: `${auditedColor}55`, backgroundColor: `${auditedColor}12`, color: auditedColor }}>{auditedDirection === "SHORT" ? "SHORT / PUT BIAS" : "LONG / CALL BIAS"}</span></div></div>
              {riskReview.data ? <div className="mb-3 flex flex-col gap-[5px]">
                <PlanRow label={`${auditedDirection} reference`} value={auditedEntry == null ? "—" : formatLivePrice(auditedEntry)} color={auditedColor} />
                <PlanRow label="Invalidation" value={auditedStop == null ? "—" : formatLivePrice(auditedStop)} color="#f2575c" />
                <PlanRow label="Target 1" value={auditedTp1 == null ? "—" : formatLivePrice(auditedTp1)} color="#3ecf8e" />
                <PlanRow label="Target 2" value={auditedTp2 == null ? "—" : formatLivePrice(auditedTp2)} color="#65dda4" />
              </div> : <div className="mb-3 rounded-[9px] border border-white/[0.06] bg-[#0e0e10] px-3 py-4"><div className="h-1.5 overflow-hidden rounded-full bg-[#24242a]"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#ff4655]" /></div><p className="mt-2 text-[9.5px] text-[#777780]">Collecting spread samples and auditing 4h, 1h, 15m, 5m, and 1m. Nothing has been submitted.</p></div>}
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                <label className="rounded-[8px] bg-[#0e0e10] px-2.5 py-2"><span className="block text-[8px] uppercase tracking-[0.06em] text-[#5f5f68]">Paper equity</span><span className="mt-1 flex items-center font-mono text-[12px] font-bold text-[#ececee]">$<input type="number" min={100} step={100} value={paperEquity} onChange={(event) => setPaperEquity(Math.max(100, Number(event.target.value) || 100))} className="min-w-0 flex-1 bg-transparent outline-none" /></span></label>
                <label className="rounded-[8px] bg-[#0e0e10] px-2.5 py-2"><span className="block text-[8px] uppercase tracking-[0.06em] text-[#5f5f68]">Risk / daily kill</span><span className="mt-1 flex items-center gap-1 font-mono text-[12px] font-bold text-[#ff6673]"><input aria-label="Risk percent" type="number" min={0.1} max={5} step={0.1} value={riskPercent} onChange={(event) => setRiskPercent(Math.min(5, Math.max(0.1, Number(event.target.value) || 0.1)))} className="w-10 bg-transparent outline-none" />% / <input aria-label="Maximum daily loss percent" type="number" min={0.5} max={10} step={0.5} value={maxDailyLossPercent} onChange={(event) => setMaxDailyLossPercent(Math.min(10, Math.max(0.5, Number(event.target.value) || 0.5)))} className="w-10 bg-transparent outline-none" />%</span></label>
                <ContractStat label="Repriced units" value={tapeDecision.action === "EXECUTE" ? String(tapeDecision.calculatedPositionSize) : "0 · no order"} color={tapeDecision.action === "EXECUTE" ? "#3ecf8e" : "#8c8c95"} />
                <ContractStat label="Live R multiple" value={tapeDecision.rMultiple == null ? "—" : `${tapeDecision.rMultiple.toFixed(2)}R`} color={tapeDecision.rMultiple != null && tapeDecision.rMultiple >= 1.5 ? "#3ecf8e" : "#f5c451"} />
              </div>
              <div className={`rounded-[9px] border px-3 py-3 ${drawdownKillSwitch || riskReview.data?.action === "REJECT" ? "border-[#ff4655]/35 bg-[#ff4655]/10" : autoTrade ? "border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.07]" : "border-[#f5c451]/30 bg-[#f5c451]/[0.06]"}`}>
                <div className={`text-[11px] font-black uppercase tracking-[0.06em] ${drawdownKillSwitch || tapeDecision.action === "REJECT" ? "text-[#ff6673]" : tapeDecision.action === "EXECUTE" ? "text-[#3ecf8e]" : "text-[#f5c451]"}`}>{drawdownKillSwitch ? "Execution halted · daily loss limit" : !riskReview.data ? "Auditing · zero orders submitted" : tapeDecision.action === "EXECUTE" ? "Authorized by context + live tape" : tapeDecision.action === "REJECT" ? "Rejected · zero orders submitted" : "Hold · zero orders submitted"}</div>
                <p className="mt-1 text-[9.5px] leading-[1.45] text-[#aaaab2]">{tapeDecision.reason}</p>
                <p className="mt-1 text-[9.5px] leading-[1.45] text-[#85858e]">No human order confirmation is requested. When armed, only Dante can create or scale a paper position after every hard gate passes.</p>
              </div>
            </div>
          ) : null}

          <div className="rounded-[12px] border border-[#2a2a31] bg-[#161619] p-[13px]">
            <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#777780]">Session paper P/L</span><span className={`font-mono text-[16px] font-black ${totalPnl >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <ContractStat label="Realized" value={`${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`} color={realizedPnl >= 0 ? "#3ecf8e" : "#f2575c"} />
              <ContractStat label="Unrealized" value={`${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}`} color={unrealizedPnl >= 0 ? "#3ecf8e" : "#f2575c"} />
            </div>
          </div>

          {lastReview ? (
            <div className={`rounded-[12px] border p-[14px] ${lastReview.result === "STOPPED" || lastReview.result === "CUT LOSS" ? "border-[#f2575c]/35 bg-[#f2575c]/[0.055]" : "border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.045]"}`}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-[#a1a1aa]">Dante post-trade review · {lastReview.ticker}</span><span className={`text-[9px] font-black ${lastReview.result === "STOPPED" || lastReview.result === "CUT LOSS" ? "text-[#ff6673]" : "text-[#3ecf8e]"}`}>{lastReview.result}</span></div>
              <p className="text-[10.5px] leading-[1.5] text-[#bdbdc4]"><span className="font-bold text-[#ececee]">Original thesis:</span> {lastReview.thesis}</p>
              <p className="mt-2 text-[10.5px] leading-[1.5] text-[#bdbdc4]"><span className="font-bold text-[#ff8992]">What happened:</span> {lastReview.diagnosis}</p>
              <p className="mt-2 text-[10.5px] leading-[1.5] text-[#bdbdc4]"><span className="font-bold text-[#f5c451]">Rule for next trade:</span> {lastReview.nextRule}</p>
            </div>
          ) : null}

          <div className="text-center font-mono text-[10.5px] text-[#5a5a62]">Chart display: TradingView · quote polling: 5s · Dante contract: simulated · no broker connected</div>
          {selectedWarning ? <div className="rounded-[12px] border border-[#5a4530] bg-[#211b12] p-3 text-[12px] leading-[1.45] text-[#f5c451]">{selectedWarning}</div> : null}
        </aside>
      </div>

      {/* Strategy builder */}
      <StrategyBuilder ticker={selected} config={strat} onChange={setStrat} signal={stratSignal} />
    </div>
  );
}

function DeskStatus({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-[9px] border border-white/[0.07] bg-black/20 px-3 py-2.5"><div className="text-[8px] font-bold uppercase tracking-[0.08em] text-[#5f5f68]">{label}</div><div className="mt-1 text-[10.5px] font-black" style={{ color }}>{value}</div><div className="mt-0.5 text-[8.5px] text-[#686871]">{detail}</div></div>;
}

function ContractStat({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="min-w-0 rounded-[8px] bg-[#0e0e10] px-2.5 py-2"><div className="text-[7.5px] font-bold uppercase tracking-[0.06em] text-[#56565e]">{label}</div><div className="mt-1 truncate font-mono text-[10.5px] font-bold" style={{ color }} title={value}>{value}</div></div>;
}

function TradeHistoryPanel({ entries, realizedPnl, onClear }: { entries: TradeLogEntry[]; realizedPnl: number; onClear: () => void }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[#2a2a31] bg-[#161619]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24242a] px-4 py-3.5">
        <div><div className="text-[13px] font-bold text-[#ececee]">Paper execution history</div><div className="mt-0.5 text-[9.5px] text-[#64646d]">Persistent on this device · entries, exits, stops and targets</div></div>
        <div className="flex items-center gap-3"><span className={`font-mono text-[12px] font-black ${realizedPnl >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>Realized {realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}</span>{entries.length > 0 ? <button type="button" onClick={onClear} className="rounded-[7px] border border-[#303038] px-2.5 py-1.5 text-[9px] font-bold text-[#777780] hover:border-[#f2575c]/40 hover:text-[#f2575c]">Clear history</button> : null}</div>
      </div>
      {entries.length === 0 ? (
        <div className="grid min-h-[170px] place-items-center px-5 py-8 text-center"><div><div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-[#33333b] bg-[#111114] text-[#5f5f68]">↳</div><div className="mt-3 text-[12px] font-semibold text-[#8d8d96]">No autonomous paper trades yet</div><div className="mt-1 text-[10px] text-[#56565e]">When AI trade permission is armed, Dante submits qualified orders without asking for confirmation.</div></div></div>
      ) : (
        <div className="max-h-[440px] overflow-y-auto">
          {entries.map((entry, index) => (
            <div key={`${entry.ts}-${index}`} className="grid grid-cols-[54px_auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-[#202025] px-3 py-3 text-[11px] last:border-b-0 min-[720px]:grid-cols-[62px_54px_78px_56px_90px_48px_minmax(120px,1fr)_70px] min-[720px]:px-4">
              <span className="font-mono text-[9.5px] text-[#5a5a62]">{entry.ts}</span>
              <span className={`rounded-[5px] px-2 py-1 text-center text-[9px] font-black ${entry.type === "ENTER" || entry.type === "ADD" ? "bg-[#4d96ff]/10 text-[#78a7ff]" : entry.type === "STOP" || entry.type === "CUT" ? "bg-[#f2575c]/10 text-[#ff6673]" : "bg-[#3ecf8e]/10 text-[#3ecf8e]"}`}>{entry.type}</span>
              <span className="truncate font-mono font-bold text-[#ececee]">{entry.ticker}</span>
              <span className="text-[9.5px] font-bold text-[#898991]">{entry.side}</span>
              <span className="font-mono text-[#d5d5da]">@ {formatLivePrice(entry.price)}</span>
              <span className="font-mono text-[9.5px] text-[#777780]">{entry.quantity != null ? `× ${entry.quantity}` : "—"}</span>
              <span className="col-span-3 truncate text-[9.5px] text-[#686871] min-[720px]:col-span-1" title={entry.note}>{entry.note ?? "—"}</span>
              <span className={`text-right font-mono font-bold ${entry.pnl == null ? "text-[#5f6f86]" : entry.pnl >= 0 ? "text-[#3ecf8e]" : "text-[#f2575c]"}`}>{entry.pnl == null ? "FILLED" : `${entry.pnl >= 0 ? "+" : ""}${entry.pnl.toFixed(2)}`}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function loadPaperTradeLog(): TradeLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PAPER_TRADE_LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function loadPaperPositions(): PaperPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(PAPER_POSITIONS_KEY) ?? "null") as PaperPosition[] | null;
    const legacy = JSON.parse(window.localStorage.getItem(PAPER_POSITION_KEY) ?? "null") as Omit<PaperPosition, "id"> | null;
    const items = Array.isArray(saved) ? saved : legacy ? [{ ...legacy, id: `${legacy.openedAt}:${legacy.ticker}:legacy` }] : [];
    return items.filter((item) => item && typeof item.ticker === "string" && typeof item.entry === "number" && item.contract).map((item, index) => ({ ...item, id: item.id || `${item.openedAt}:${item.ticker}:${index}` }));
  } catch {
    return [];
  }
}

function liveSession(now: Date): { name: string; detail: string; color: string } {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes >= 13 * 60 + 30 && minutes < 16 * 60) return { name: "LONDON × NEW YORK", detail: "Highest overlap liquidity", color: "#ff6673" };
  if (minutes >= 7 * 60 && minutes < 13 * 60 + 30) return { name: "LONDON", detail: "Expansion and macro window", color: "#f5c451" };
  if (minutes >= 16 * 60 && minutes < 21 * 60) return { name: "NEW YORK", detail: "US cash and futures flow", color: "#78a7ff" };
  if (minutes < 7 * 60) return { name: "ASIA", detail: "Range formation and regional flow", color: "#c77dff" };
  return { name: "ROLLOVER / THIN", detail: "Treat liquidity with caution", color: "#8c8c95" };
}

function eventRiskLabel(analysis: LiveAiInsight) {
  const text = [analysis.summary, analysis.recap, analysis.agentFitReason, ...analysis.bullets].filter(Boolean).join(" ").toLowerCase();
  return /\b(fed|fomc|cpi|nfp|payroll|inflation|rate decision|central bank|earnings)\b/.test(text) ? "EVENT MENTIONED" : "UNVERIFIED";
}

function RiskAuditCard({ symbol, forecast, review, loading, error, active, locked, elapsedSeconds, tapeDecision, tapeChecking, tapeCheckAt, spreadEstimated, onRefresh }: { symbol: string; forecast: LiveForecast; review: LiveTradeRiskReview | undefined; loading: boolean; error: string | null; active: boolean; locked: boolean; elapsedSeconds: number; tapeDecision: LeanTapeDecision; tapeChecking: boolean; tapeCheckAt: number; spreadEstimated: boolean; onRefresh: () => void }) {
  const verdictColor = !review ? "#8c8c95" : review.action === "EXECUTE" ? "#3ecf8e" : review.action === "HOLD" ? "#f5c451" : "#ff6673";
  if (!active) {
    return (
      <div className="rounded-[13px] border border-[#ff4655]/30 bg-[#141417] p-[15px]">
        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Professional risk audit · {symbol}</div>
        <div className="mt-2 text-[17px] font-black text-[#ececee]">Dante has not audited this trade</div>
        <p className="mt-2 text-[10.5px] leading-[1.5] text-[#8f8f98]">Turn on Dante analysis to verify the stop, search current macro risks, challenge the thesis, and gate AI execution.</p>
      </div>
    );
  }
  if (loading && !review) {
    return (
      <div className="overflow-hidden rounded-[13px] border border-[#ff4655]/35 bg-[#141417] p-[15px]">
        <div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Dante risk desk · {symbol}</span><span className="font-mono text-[9px] text-[#f5c451]">{elapsedSeconds}s / 50s max</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#24242a]"><div className="h-full rounded-full bg-[#ff4655] transition-[width] duration-1000" style={{ width: `${Math.min(96, 8 + (elapsedSeconds / 50) * 88)}%` }} /></div>
        <div className="mt-3 text-[12px] font-bold text-[#d8d8dc]">{elapsedSeconds < 8 ? "Reading five chart windows…" : elapsedSeconds < 20 ? "Checking macro events and spread…" : elapsedSeconds < 35 ? "Stress-testing both directions…" : "Finalizing the risk decision…"}</div>
        <p className="mt-1 text-[10px] leading-[1.5] text-[#777780]">No order exists during this audit. The request stops at 50 seconds instead of loading indefinitely.</p>
      </div>
    );
  }
  if (error && !review) {
    return <div className="rounded-[13px] border border-[#ff4655]/35 bg-[#ff4655]/[0.06] p-[15px]"><div className="text-[10px] font-black uppercase text-[#ff6673]">Risk audit unavailable</div><p className="mt-2 text-[10.5px] leading-[1.5] text-[#b8b8bf]">{error}</p><button type="button" onClick={onRefresh} className="mt-3 rounded-[8px] border border-[#ff4655]/35 px-3 py-2 text-[10px] font-bold text-[#ff8992]">Retry audit</button></div>;
  }
  if (!review) return null;
  return (
    <div className="rounded-[13px] border border-[#ff4655]/40 bg-[#141417] p-[15px] shadow-[0_18px_55px_rgba(0,0,0,.24)]">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Autonomous quant audit · {symbol}</div><div className="mt-1 flex items-baseline gap-2"><span className="text-[24px] font-black" style={{ color: verdictColor }}>{review.action}</span><span className="font-mono text-[13px] font-bold text-[#ececee]">{review.executionRating}/10</span></div></div>
        <button type="button" onClick={onRefresh} disabled={loading} className="text-[9px] font-bold text-[#777780] hover:text-[#ececee] disabled:opacity-50">{loading ? "refreshing…" : "↻ audit again"}</button>
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-[9px] border border-[#ff4655]/35 bg-[#ff4655]/[0.08] px-3 py-2.5">
          <span className="relative flex h-2.5 w-2.5 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff4655] opacity-50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff4655]" />
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-[#ff6673]">Hourly context resync · {elapsedSeconds}s</div>
            <div className="mt-0.5 text-[9px] text-[#a7a7af]">The current {review.action} decision remains active while news, macro, and structure refresh.</div>
          </div>
        </div>
      ) : null}
      <div className={`mt-3 rounded-[9px] border px-3 py-2.5 ${tapeChecking ? "border-[#ff4655]/35 bg-[#ff4655]/[0.08]" : "border-white/[0.07] bg-black/20"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${tapeChecking ? "animate-pulse bg-[#ff4655]" : "bg-[#3ecf8e]"}`} /><span className={`font-mono text-[9px] font-black uppercase tracking-[0.07em] ${tapeChecking ? "text-[#ff6673]" : "text-[#a7a7af]"}`}>{tapeChecking ? "Repricing live tape" : `Tape checked ${new Date(tapeCheckAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span></div>
          <span className="text-[8px] font-bold uppercase tracking-[0.06em] text-[#666670]">Price 1m · context 1h</span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3 text-[9.5px]"><span className="leading-[1.45] text-[#aaaab2]">{tapeDecision.reason}</span><span className={`flex-none font-mono font-black ${tapeDecision.action === "EXECUTE" ? "text-[#3ecf8e]" : tapeDecision.action === "REJECT" ? "text-[#ff6673]" : "text-[#f5c451]"}`}>{tapeDecision.action}</span></div>
      </div>
      <p className="mt-2 text-[10.5px] font-semibold leading-[1.5] text-[#d0d0d5]">{review.ratingReason}</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5"><ContractStat label="Session / phase" value={`${review.sessionState} · ${review.marketPhase}`} color="#78a7ff" /><ContractStat label="Execution gates" value={`${review.newsBlackout ? "NEWS BLOCK" : "NEWS OK"} · SPREAD ${review.spreadCheck}${spreadEstimated ? " (PAPER EST.)" : ""}`} color={review.newsBlackout || review.spreadCheck !== "PASS" ? "#ff6673" : "#3ecf8e"} /></div>
      <div className="mt-3 rounded-[9px] border border-white/[0.07] bg-black/20 px-3 py-2.5"><div className="text-[8.5px] font-black uppercase tracking-[0.08em] text-[#78a7ff]">Top-down bias · full resync every hour</div><div className="mt-2 grid grid-cols-5 gap-1">{review.timeframeReads.map((item) => <div key={item.timeframe} className="min-w-0 rounded-[7px] bg-[#0e0e10] px-1.5 py-2 text-center" title={item.evidence}><div className="text-[8px] font-bold text-[#666670]">{item.timeframe}</div><div className={`mt-1 text-[8px] font-black ${item.bias === "LONG" ? "text-[#3ecf8e]" : item.bias === "SHORT" ? "text-[#ff6673]" : "text-[#8c8c95]"}`}>{item.bias}</div></div>)}</div></div>
      <AuditSection title={review.action === "HOLD" ? "What Dante is waiting for" : "Next observable conditions"} color="#f5c451"><AuditList items={review.waitingFor} /></AuditSection>
      <div className="mt-3 rounded-[9px] border border-white/[0.07] bg-black/20 px-3 py-2.5"><div className="text-[8.5px] font-black uppercase tracking-[0.08em] text-[#3ecf8e]">Quant execution output</div><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9.5px]"><span className="text-[#777780]">Direction</span><span className="text-right font-mono font-bold text-[#ececee]">{review.direction}</span><span className="text-[#777780]">Entry / stop</span><span className="text-right font-mono font-bold text-[#ececee]">{formatLivePrice(review.entryPrice)} / <span className="text-[#ff6673]">{formatLivePrice(review.hardStopLoss)}</span></span><span className="text-[#777780]">Targets</span><span className="truncate text-right font-mono font-bold text-[#3ecf8e]">{review.takeProfitTargets.map(formatLivePrice).join(" / ")}</span><span className="text-[#777780]">Authorized size</span><span className="text-right font-mono font-bold text-[#f5c451]">{review.calculatedPositionSize} units</span></div><p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] leading-[1.45] text-[#b6b6bd]">{review.quantitativeJustification}</p></div>
      {locked ? <div className="mt-3 rounded-[8px] border border-[#ff4655]/25 bg-[#ff4655]/[0.06] px-3 py-2 text-[9.5px] text-[#ff8992]">Existing position audit · Dante may recommend managing or exiting, but cannot silently move the locked stop or targets.</div> : null}

      <AuditSection title={`Invalidation check · ${review.invalidationQuality}`} color={review.invalidationQuality === "LOGICAL" ? "#3ecf8e" : "#ff6673"}><p>{review.invalidationCheck}</p></AuditSection>
      <AuditSection title="Strongest case against this trade" color="#ff6673"><p>{review.devilsAdvocate}</p></AuditSection>
      <AuditSection title="Structure and tape evidence" color="#78a7ff"><AuditList items={review.structuralEvidence} /></AuditSection>
      <AuditSection title="Fundamental and event risks" color="#f5c451"><AuditList items={review.fundamentalRisks} /></AuditSection>
      <AuditSection title="Target and R-multiple logic" color="#c77dff"><p>{review.targetLogic}</p><div className="mt-2 grid grid-cols-3 gap-1.5"><ContractStat label="Stop" value={forecast.stop == null ? "—" : formatLivePrice(forecast.stop)} color="#ff6673" /><ContractStat label="TP1" value={forecast.target == null ? "—" : formatLivePrice(forecast.target)} color="#3ecf8e" /><ContractStat label="TP2" value={forecast.target2 == null ? "—" : formatLivePrice(forecast.target2)} color="#65dda4" /></div></AuditSection>
      <AuditSection title="Execution plan" color="#3ecf8e"><p>{review.executionPlan}</p></AuditSection>
      {review.missingEvidence.length ? <AuditSection title="Evidence still missing" color="#8c8c95"><AuditList items={review.missingEvidence} /></AuditSection> : null}
      {review.sources.length ? <div className="mt-3 border-t border-white/[0.07] pt-3"><div className="mb-2 text-[8.5px] font-black uppercase tracking-[0.08em] text-[#777780]">Current sources</div><div className="flex flex-col gap-1.5">{review.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="truncate text-[9.5px] text-[#78a7ff] hover:underline">{source.title} ↗</a>)}</div></div> : null}
    </div>
  );
}

function AuditSection({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return <div className="mt-3 rounded-[9px] border border-white/[0.07] bg-black/20 px-3 py-2.5"><div className="mb-1.5 text-[8.5px] font-black uppercase tracking-[0.08em]" style={{ color }}>{title}</div><div className="text-[10.5px] leading-[1.5] text-[#b6b6bd]">{children}</div></div>;
}

function AuditList({ items }: { items: string[] }) {
  return <ul className="space-y-1.5">{items.map((item, index) => <li key={`${index}:${item}`} className="flex gap-2"><span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-current opacity-70" /><span>{item}</span></li>)}</ul>;
}

/* ---------- Paper position ---------- */

function ActiveOrdersBook({ positions, rowFor, openRisk, riskCap, onExit }: { positions: PaperPosition[]; rowFor: (ticker: string) => LiveTradeRow | null; openRisk: number; riskCap: number; onExit: (positionId: string, reason: PaperExitReason) => void }) {
  const floating = positions.reduce((sum, item) => {
    const current = rowFor(item.ticker)?.price ?? item.entry;
    return sum + item.realizedPnl + (current - item.entry) * item.remainingSize * (item.side === "LONG" ? 1 : -1);
  }, 0);
  return (
    <div className="rounded-[14px] border-2 border-[#ff4655] bg-[#0d0f11] p-[15px] shadow-[0_18px_50px_rgba(255,70,85,.12)]">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ff4655]" /><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Active paper orders</span></div><div className="mt-1 text-[20px] font-black text-[#f2f2f4]">{positions.length} live {positions.length === 1 ? "tranche" : "tranches"}</div></div>
        <div className="text-right"><div className={`font-mono text-[22px] font-black ${floating >= 0 ? "text-[#3ecf8e]" : "text-[#ff6673]"}`}>{floating >= 0 ? "+" : ""}${floating.toFixed(2)}</div><div className="text-[8.5px] uppercase text-[#74747d]">Live P/L</div></div>
      </div>
      <div className="mt-3 rounded-[9px] border border-white/[0.07] bg-[#141417] px-3 py-2.5">
        <div className="flex justify-between text-[9px]"><span className="text-[#8c8c95]">Open risk across all stops</span><span className={`font-mono font-bold ${openRisk >= riskCap ? "text-[#ff6673]" : "text-[#f5c451]"}`}>${openRisk.toFixed(0)} / ${riskCap.toFixed(0)}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#24242a]"><div className="h-full rounded-full bg-[#ff4655]" style={{ width: `${Math.min(100, riskCap ? (openRisk / riskCap) * 100 : 0)}%` }} /></div>
      </div>
      <div className="mt-3 space-y-2">
        {positions.map((item, index) => {
          const current = rowFor(item.ticker)?.price ?? item.entry;
          const unrealized = (current - item.entry) * item.remainingSize * (item.side === "LONG" ? 1 : -1);
          const pnl = item.realizedPnl + unrealized;
          const pnlPct = ((current - item.entry) / item.entry) * 100 * (item.side === "LONG" ? 1 : -1);
          const elapsedMin = Math.max(0, Math.round((Date.now() - item.openedAt) / 60_000));
          return (
            <div key={item.id} className="rounded-[10px] border border-white/[0.08] bg-[#141417] p-3">
              <div className="flex items-start justify-between gap-2"><div><div className="text-[8px] font-black uppercase tracking-[0.08em] text-[#777780]">Order {positions.length - index} · {item.openedBy === "DANTE" ? "AI" : "manual"} · {elapsedMin}m</div><div className="mt-0.5 text-[14px] font-black text-[#ececee]">{item.ticker} <span className={item.side === "LONG" ? "text-[#3ecf8e]" : "text-[#ff6673]"}>{item.side}</span></div></div><div className="text-right"><div className={`font-mono text-[16px] font-black ${pnl >= 0 ? "text-[#3ecf8e]" : "text-[#ff6673]"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div><div className={`font-mono text-[8.5px] ${pnl >= 0 ? "text-[#3ecf8e]" : "text-[#ff6673]"}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% live</div></div></div>
              <div className="mt-2 grid grid-cols-4 gap-1"><ContractStat label="Entry" value={formatLivePrice(item.entry)} color="#ececee" /><ContractStat label="Now" value={formatLivePrice(current)} color={pnl >= 0 ? "#3ecf8e" : "#ff6673"} /><ContractStat label="Stop" value={formatLivePrice(item.sl)} color="#ff6673" /><ContractStat label={item.tp1Hit ? "TP2 next" : "TP1 next"} value={formatLivePrice(item.tp1Hit ? item.tp2 : item.tp)} color="#65dda4" /></div>
              <div className="mt-2 flex items-center justify-between text-[8.5px]"><span className={item.tp1Hit ? "text-[#3ecf8e]" : "text-[#f5c451]"}>{item.tp1Hit ? `TP1 filled · ${item.remainingSize} units running` : `${item.remainingSize}/${item.size} units · auto exits armed`}</span><span className="text-[#666670]">risk locked per tranche</span></div>
              <div className="mt-2 flex gap-1.5"><button type="button" onClick={() => onExit(item.id, "CUT")} className="flex-1 rounded-[7px] border border-[#f2575c]/25 bg-[#f2575c]/8 py-2 text-[9.5px] font-bold text-[#ff6673]">Cut</button><button type="button" onClick={() => onExit(item.id, "TAKE")} className="flex-1 rounded-[7px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/8 py-2 text-[9.5px] font-bold text-[#3ecf8e]">Take now</button><button type="button" onClick={() => onExit(item.id, "EXIT")} className="flex-1 rounded-[7px] border border-[#303038] py-2 text-[9.5px] font-bold text-[#8c8c95]">Close</button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PositionCard({ position, row, onExit }: { position: PaperPosition; row: LiveTradeRow | null; onExit: (reason: PaperExitReason) => void }) {
  const cur = row?.price ?? position.entry;
  const unrealized = (cur - position.entry) * position.remainingSize * (position.side === "LONG" ? 1 : -1);
  const pnl = position.realizedPnl + unrealized;
  const pnlPct = ((cur - position.entry) / position.entry) * 100 * (position.side === "LONG" ? 1 : -1);
  const pnlColor = pnl >= 0 ? "#3ecf8e" : "#f2575c";
  const range = position.side === "LONG" ? position.tp - position.sl : position.sl - position.tp;
  const traveled = position.side === "LONG" ? cur - position.sl : position.sl - cur;
  const progress = Math.max(0, Math.min(100, Math.round((traveled / (range || 1)) * 100)));
  const elapsedMin = Math.max(0, Math.round((Date.now() - position.openedAt) / 60_000));
  const riskPerUnit = Math.abs(position.entry - position.sl) || 1;
  const riskAmount = riskPerUnit * position.size;
  const tp1R = Math.abs(position.tp - position.entry) / riskPerUnit;
  const tp2R = Math.abs(position.tp2 - position.entry) / riskPerUnit;
  const nextAction = position.tp1Hit
    ? `TP1 is filled. Dante is holding the remaining ${position.remainingSize} units for TP2.`
    : `Hold. Dante will take roughly half at TP1, then manage the remainder to TP2.`;
  return (
    <div className="rounded-[14px] border-2 border-[#ff4655] bg-[#0d0f11] p-[15px] shadow-[0_18px_50px_rgba(255,70,85,.12)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ff4655]" /><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#ff6673]">Paper position open</span></div>
          <div className="mt-1 text-[20px] font-black text-[#f2f2f4]">{position.ticker} · {position.side}</div>
          <div className="mt-0.5 text-[9.5px] text-[#74747d]">Opened by {position.openedBy === "DANTE" ? "Dante AI" : "you"} · {elapsedMin}m ago · {position.remainingSize}/{position.size} units live</div>
        </div>
        <div className="text-right"><div className="font-mono text-[23px] font-black" style={{ color: pnlColor }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div><div className="font-mono text-[10px]" style={{ color: pnlColor }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% · now {formatLivePrice(cur)}</div></div>
      </div>

      <div className="mb-3 rounded-[10px] border border-[#3ecf8e]/25 bg-[#3ecf8e]/[0.07] p-3">
        <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[0.08em] text-[#3ecf8e]">Dante's next action</span><span className="rounded-full bg-[#3ecf8e]/15 px-2 py-0.5 text-[8px] font-black uppercase text-[#65dda4]">Auto-managing</span></div>
        <p className="mt-1.5 text-[11px] font-semibold leading-[1.45] text-[#d9d9dd]">{nextAction}</p>
        <p className="mt-1 text-[9.5px] leading-[1.45] text-[#85858e]">The exit plan was decided at entry and cannot drift with each AI refresh.</p>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <ContractStat label="Max risk" value={`$${riskAmount.toFixed(0)}`} color="#ff6673" />
        <ContractStat label="TP1 reward/risk" value={`1:${tp1R.toFixed(1)}`} color="#f5c451" />
        <ContractStat label="TP2 reward/risk" value={`1:${tp2R.toFixed(1)}`} color="#3ecf8e" />
      </div>

      <div className="mb-3 rounded-[10px] border border-white/[0.07] bg-[#141417] p-3">
        <div className="mb-2 text-[8.5px] font-black uppercase tracking-[0.08em] text-[#777780]">Automatic execution plan</div>
        <div className="space-y-2 text-[10px]">
          <div className="flex items-center justify-between"><span className="text-[#a4a4ac]">1 · Entry filled</span><span className="font-mono font-bold text-[#ececee]">{formatLivePrice(position.entry)} · {position.size} units</span></div>
          <div className="flex items-center justify-between"><span className={position.tp1Hit ? "text-[#3ecf8e]" : "text-[#a4a4ac]"}>2 · Take about 50%</span><span className={`font-mono font-bold ${position.tp1Hit ? "text-[#3ecf8e]" : "text-[#65dda4]"}`}>{formatLivePrice(position.tp)} · {position.tp1Hit ? "FILLED" : "AUTO"}</span></div>
          <div className="flex items-center justify-between"><span className="text-[#a4a4ac]">3 · Close remainder</span><span className="font-mono font-bold text-[#65dda4]">{formatLivePrice(position.tp2)} · AUTO</span></div>
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-2"><span className="text-[#ff8992]">Hard stop · close all</span><span className="font-mono font-bold text-[#ff6673]">{formatLivePrice(position.sl)} · ARMED</span></div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex justify-between font-mono text-[8.5px]"><span className="text-[#ff6673]">STOP</span><span className="text-[#f5c451]">ENTRY</span><span className="text-[#3ecf8e]">TP1</span></div>
        <div className="relative h-2 overflow-hidden rounded-[4px] bg-[#1a1a1e]"><div className="absolute left-0 h-full rounded-[4px] transition-[width] duration-500" style={{ width: `${progress}%`, background: pnlColor }} /></div>
      </div>

      <details className="mb-3 rounded-[9px] border border-white/[0.06] bg-white/[0.025] px-3 py-2"><summary className="cursor-pointer text-[9.5px] font-bold text-[#a7a7af]">Why Dante entered this trade</summary><p className="mt-2 text-[9.5px] leading-[1.5] text-[#8f8f98]">{position.entryReason}</p></details>

      <div className="mb-1 text-[8.5px] font-black uppercase tracking-[0.08em] text-[#666670]">Manual overrides · optional</div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onExit("CUT")} className="flex-1 rounded-[8px] border border-[#f2575c]/30 bg-[#f2575c]/10 p-[9px] text-center text-[10.5px] font-semibold text-[#f2575c] hover:bg-[#f2575c]/20">Cut now</button>
        <button type="button" onClick={() => onExit("TAKE")} className="flex-1 rounded-[8px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 p-[9px] text-center text-[10.5px] font-semibold text-[#3ecf8e] hover:bg-[#3ecf8e]/20">Take profit now</button>
        <button type="button" onClick={() => onExit("EXIT")} className="flex-1 rounded-[8px] border border-[#2a2a31] bg-[#161619] p-[9px] text-center text-[10.5px] font-semibold text-[#8c8c95] hover:text-[#ececee]">Close</button>
      </div>
    </div>
  );
}

/* ---------- Strategy builder (client-side indicator engine, ported from V8) ---------- */

type RuleKey = "emacross" | "macd" | "rsi" | "roc" | "boll" | "stoch" | "trend" | "vwap";

type StrategyConfig = {
  preset: string;
  active: Partial<Record<RuleKey, boolean>>;
  armed: boolean;
};

const STRAT_RULES: Record<RuleKey, { name: string; tag: string }> = {
  emacross: { name: "EMA 9 / 21 cross", tag: "Trend" },
  macd: { name: "MACD (12,26,9)", tag: "Momentum" },
  rsi: { name: "RSI (14)", tag: "Momentum" },
  roc: { name: "Rate of Change (10)", tag: "Momentum" },
  boll: { name: "Bollinger %B (20,2)", tag: "Volatility" },
  stoch: { name: "Stochastic %K (14)", tag: "Momentum" },
  trend: { name: "EMA-50 slope", tag: "Trend" },
  vwap: { name: "Price vs VWAP", tag: "Trend" },
};

const STRAT_PRESETS: Record<string, { label: string; rules: RuleKey[] }> = {
  momentum: { label: "Momentum", rules: ["emacross", "macd", "roc", "rsi"] },
  reversion: { label: "Mean Reversion", rules: ["rsi", "boll", "stoch"] },
  trend: { label: "Trend Follow", rules: ["emacross", "trend", "macd"] },
  breakout: { label: "Breakout", rules: ["boll", "roc", "vwap"] },
};

type RuleResult = {
  key: RuleKey;
  name: string;
  tag: string;
  reading: string;
  bias: -1 | 0 | 1;
  fill: number;
  note: string;
};

type StrategySignal = {
  rows: RuleResult[];
  dom: -1 | 0 | 1;
  aligned: number;
  against: number;
  total: number;
  conf: number;
};

function ema(values: number[], n: number) {
  const k = 2 / (n + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function emaSeries(values: number[], n: number) {
  const k = 2 / (n + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function evalRule(key: RuleKey, s: number[]): RuleResult {
  const n = s.length;
  const last = s[n - 1];
  const meta = STRAT_RULES[key];
  const mk = (reading: string, bias: -1 | 0 | 1, fill: number, note: string): RuleResult => ({ key, name: meta.name, tag: meta.tag, reading, bias, fill: Math.round(clamp(fill, 2, 98)), note });
  if (n < 3) return mk("warming up", 0, 50, "Gathering ticks…");
  if (key === "rsi") {
    const m = Math.min(14, n - 1);
    let g = 0;
    let l = 0;
    for (let i = n - m; i < n; i++) {
      const d = s[i] - s[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    const rs = l === 0 ? 100 : g / l;
    const v = 100 - 100 / (1 + rs);
    const bias = v < 38 ? 1 : v > 62 ? -1 : 0;
    return mk(`RSI ${v.toFixed(0)}`, bias, v, v < 38 ? "Oversold — snap-back likely" : v > 62 ? "Overbought — stretched" : "Neutral zone");
  }
  if (key === "emacross") {
    const e9 = ema(s, 9);
    const e21 = ema(s, 21);
    const sp = ((e9 - e21) / e21) * 100;
    return mk(`${e9 > e21 ? "9 > 21" : "9 < 21"} · ${sp >= 0 ? "+" : ""}${sp.toFixed(2)}%`, e9 > e21 ? 1 : -1, 50 + clamp(sp * 40, -48, 48), e9 > e21 ? "Fast EMA above slow — bullish" : "Fast EMA below slow — bearish");
  }
  if (key === "macd") {
    const m12 = emaSeries(s, 12);
    const m26 = emaSeries(s, 26);
    const macd = m12.map((v, i) => v - m26[i]);
    const sig = emaSeries(macd, 9);
    const hist = macd[n - 1] - sig[n - 1];
    return mk(`Hist ${hist >= 0 ? "+" : ""}${hist.toFixed(3)}`, hist > 0 ? 1 : -1, 50 + clamp((hist / last) * 8000, -48, 48), hist > 0 ? "Histogram positive — momentum up" : "Histogram negative — momentum down");
  }
  if (key === "roc") {
    const k = Math.min(10, n - 1);
    const roc = (last / s[n - 1 - k] - 1) * 100;
    const bias = roc > 0.04 ? 1 : roc < -0.04 ? -1 : 0;
    return mk(`${roc >= 0 ? "+" : ""}${roc.toFixed(2)}% / ${k}b`, bias, 50 + clamp(roc * 30, -48, 48), roc > 0.04 ? "Accelerating higher" : roc < -0.04 ? "Rolling over" : "Flat");
  }
  if (key === "boll") {
    const w = Math.min(20, n);
    const sl = s.slice(n - w);
    const avg = sl.reduce((a, b) => a + b, 0) / w;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - avg) ** 2, 0) / w) || 1e-6;
    const pB = ((last - (avg - 2 * sd)) / (4 * sd)) * 100;
    const bias = pB < 15 ? 1 : pB > 85 ? -1 : 0;
    return mk(`%B ${pB.toFixed(0)}`, bias, pB, pB < 15 ? "Riding lower band — mean-revert up" : pB > 85 ? "Pinned to upper band" : "Mid-channel");
  }
  if (key === "stoch") {
    const w = Math.min(14, n);
    const sl = s.slice(n - w);
    const hi = Math.max(...sl);
    const lo = Math.min(...sl);
    const kV = hi === lo ? 50 : ((last - lo) / (hi - lo)) * 100;
    const bias = kV < 20 ? 1 : kV > 80 ? -1 : 0;
    return mk(`%K ${kV.toFixed(0)}`, bias, kV, kV < 20 ? "Oversold turn setting up" : kV > 80 ? "Overbought" : "Neutral");
  }
  if (key === "trend") {
    const es = emaSeries(s, Math.min(50, n));
    const back = Math.min(6, es.length - 1);
    const slope = ((es[es.length - 1] - es[es.length - 1 - back]) / es[es.length - 1 - back]) * 100;
    const bias = slope > 0.02 ? 1 : slope < -0.02 ? -1 : 0;
    return mk(`${slope >= 0 ? "+" : ""}${slope.toFixed(2)}%`, bias, 50 + clamp(slope * 40, -48, 48), slope > 0.02 ? "EMA-50 rising" : slope < -0.02 ? "EMA-50 falling" : "Sideways");
  }
  // vwap (volume-weighted proxy: rolling mean of the tick series)
  const w = Math.min(20, n);
  const sl = s.slice(n - w);
  const vwap = sl.reduce((a, b) => a + b, 0) / w;
  const d = ((last - vwap) / vwap) * 100;
  const bias = d > 0.03 ? 1 : d < -0.03 ? -1 : 0;
  return mk(`${d >= 0 ? "+" : ""}${d.toFixed(2)}% vs VWAP`, bias, 50 + clamp(d * 40, -48, 48), d > 0 ? "Trading above VWAP" : "Trading below VWAP");
}

function computeStrategy(series: number[], active: Partial<Record<RuleKey, boolean>>): StrategySignal {
  const keys = (Object.keys(STRAT_RULES) as RuleKey[]).filter((key) => active[key]);
  const source = series.length ? series : [100, 100, 100];
  const rows = keys.map((key) => evalRule(key, source));
  const net = rows.reduce((acc, row) => acc + row.bias, 0);
  const dom: -1 | 0 | 1 = net > 0 ? 1 : net < 0 ? -1 : 0;
  const aligned = rows.filter((row) => row.bias !== 0 && row.bias === dom).length;
  const against = rows.filter((row) => row.bias !== 0 && row.bias !== dom).length;
  const total = rows.length;
  const conf = total ? Math.round((aligned / total) * 100) : 0;
  return { rows, dom, aligned, against, total, conf };
}

function StrategyBuilder({ ticker, config, onChange, signal }: { ticker: string; config: StrategyConfig; onChange: (config: StrategyConfig) => void; signal: StrategySignal }) {
  const domColor = signal.dom > 0 ? "#3ecf8e" : signal.dom < 0 ? "#f2575c" : "#8c8c95";
  const domLabel = signal.dom > 0 ? "LONG SETUP" : signal.dom < 0 ? "SHORT SETUP" : "NO EDGE YET";
  const confColor = signal.conf >= 75 ? "#3ecf8e" : signal.conf >= 50 ? "#f5c451" : "#8c8c95";
  const ready = config.armed && signal.dom !== 0 && signal.conf >= 75;
  const readyDir = signal.dom > 0 ? "LONG" : "SHORT";

  function setPreset(key: string) {
    const active: Partial<Record<RuleKey, boolean>> = {};
    STRAT_PRESETS[key].rules.forEach((rule) => { active[rule] = true; });
    onChange({ ...config, preset: key, active });
  }

  function toggleRule(key: RuleKey) {
    const active = { ...config.active };
    if (active[key]) delete active[key]; else active[key] = true;
    onChange({ ...config, preset: "custom", active });
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#2a2a31] bg-[#161619]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1f1f24] px-4 py-[14px]">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13V9M6 13V5M10 13V7M14 13V3" stroke="#3ecf8e" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span className="text-[13.5px] font-bold tracking-[-0.2px] text-[#ececee]">Strategy Builder</span>
          <span className="font-mono text-[10px] text-[#5a5a62]">{ticker} · live · 1-min</span>
        </div>
        <div className="ml-auto flex max-w-full gap-[3px] overflow-x-auto rounded-[9px] border border-[#23232a] bg-[#0e0e10] p-[3px] max-[699px]:order-3 max-[699px]:ml-0 max-[699px]:w-full [scrollbar-width:none]">
          {[...Object.entries(STRAT_PRESETS).map(([key, preset]) => ({ key, label: preset.label, click: () => setPreset(key) })), { key: "custom", label: "Custom", click: () => {} }].map((preset) => {
            const sel = config.preset === preset.key;
            return (
              <button key={preset.key} type="button" onClick={preset.click} className={`whitespace-nowrap rounded-[6px] px-[11px] py-1.5 text-[11.5px] font-semibold ${sel ? "bg-[#ececee] text-[#0d0f11]" : preset.key === "custom" ? "text-[#5a5a62]" : "text-[#8c8c95] hover:text-[#ececee]"}`}>
                {preset.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...config, armed: !config.armed })}
          className={`flex items-center gap-1.5 rounded-[9px] border px-[13px] py-[7px] ${config.armed ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/15 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#161619] text-[#8c8c95]"}`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current" />
          <span className="text-[11.5px] font-bold tracking-[0.4px]">{config.armed ? "ARMED" : "ARM"}</span>
        </button>
      </div>

      <div className="grid min-[900px]:grid-cols-[300px_1fr]">
        {/* Verdict rail */}
        <div className="flex flex-col gap-[14px] border-b border-[#1f1f24] p-[18px] pb-4 min-[900px]:border-b-0 min-[900px]:border-r">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.6px] text-[#8c8c95]">Composite signal</div>
            <div className="text-[26px] font-extrabold tracking-[-0.5px]" style={{ color: domColor }}>{domLabel}</div>
            <div className="mt-1 text-[12px] text-[#8c8c95]">
              <span className="font-bold text-[#3ecf8e]">{signal.aligned}</span> aligned · <span className="font-bold text-[#f2575c]">{signal.against}</span> against · {signal.total} rules
            </div>
          </div>
          <div>
            <div className="mb-[5px] flex justify-between text-[10px] text-[#5a5a62]">
              <span>Conviction</span>
              <span className="font-mono font-bold" style={{ color: confColor }}>{signal.conf}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-[5px] bg-[#0e0e10]">
              <div className="h-full rounded-[5px] transition-[width] duration-500" style={{ width: `${signal.conf}%`, background: confColor }} />
            </div>
          </div>
          {ready ? (
            <div className="rounded-[11px] p-[1.5px]" style={{ backgroundImage: "linear-gradient(135deg,#3ecf8e,#4d96ff)", backgroundSize: "200% 200%", animation: "aw-rainbow-shift 3s ease infinite" }}>
              <div className="rounded-[9.5px] bg-[#0d0f11] px-[13px] py-3">
                <div className="mb-1 flex items-center gap-[7px]">
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: domColor }} />
                  <span className="text-[11px] font-extrabold tracking-[0.4px]" style={{ color: domColor }}>SIGNAL READY · {readyDir}</span>
                </div>
                <div className="text-[11px] leading-[1.5] text-[#bcbcc2]">Your armed strategy just aligned. Conditions favor a {readyDir} entry right now.</div>
              </div>
            </div>
          ) : null}
          {config.armed && !ready ? (
            <div className="text-[10.5px] leading-[1.5] text-[#5a5a62]">Armed — AlphaWolf watches every tick and alerts the moment your rules stack up ≥ 75%.</div>
          ) : null}
        </div>

        {/* Rule stack */}
        <div className="flex flex-col gap-2 px-[14px] py-3">
          {signal.rows.length > 0 ? (
            signal.rows.map((row) => {
              const agree = row.bias !== 0 && row.bias === signal.dom;
              const state = row.bias === 0 ? "NEUTRAL" : agree ? "ALIGNED" : "AGAINST";
              const stateColor = row.bias === 0 ? "#8c8c95" : agree ? "#3ecf8e" : "#f2575c";
              const barColor = row.bias > 0 ? "#3ecf8e" : row.bias < 0 ? "#f2575c" : "#5a5a62";
              return (
                <div key={row.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border border-[#1f1f24] bg-[#0e0e10] px-[13px] py-[11px] min-[700px]:flex min-[700px]:gap-[14px]">
                  <div className="min-w-0 min-[700px]:w-[150px] min-[700px]:flex-none">
                    <div className="text-[12.5px] font-semibold text-[#ececee]">{row.name}</div>
                    <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.4px] text-[#5a5a62]">{row.tag}</div>
                  </div>
                  <div className="col-span-2 row-start-2 min-w-0 min-[700px]:flex-1">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="font-mono text-[12px] font-bold text-[#ececee]">{row.reading}</span>
                      <span className="text-[10.5px] text-[#8c8c95]">{row.note}</span>
                    </div>
                    <div className="relative h-[5px] overflow-hidden rounded-[3px] bg-[#1a1a1e]">
                      <div className="absolute bottom-0 top-0 w-px bg-[#3a3a42]" style={{ left: "calc(50% - 0.5px)" }} />
                      <div className="h-full rounded-[3px] transition-[width] duration-500" style={{ width: `${row.fill}%`, background: barColor }} />
                    </div>
                  </div>
                  <div className="col-start-1 row-start-3 min-[700px]:w-[74px] min-[700px]:flex-none min-[700px]:text-right">
                    <span className="text-[10px] font-extrabold tracking-[0.5px]" style={{ color: stateColor }}>{state}</span>
                  </div>
                  <button type="button" onClick={() => toggleRule(row.key)} className="col-start-2 row-start-1 flex h-[22px] w-[22px] flex-none items-center justify-center justify-self-end rounded-[6px] border border-[#2a2a31] bg-[#1a1a1e] text-[14px] text-[#5a5a62] hover:border-[#f2575c] hover:text-[#f2575c]">×</button>
                </div>
              );
            })
          ) : (
            <div className="p-[26px] text-center text-[12.5px] text-[#5a5a62]">No rules in the stack. Add indicators below to build your edge.</div>
          )}

          {/* Add indicators */}
          <div className="mt-1 border-t border-dashed border-[#23232a] pt-[11px]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.5px] text-[#5a5a62]">Indicator library — tap to add / remove</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STRAT_RULES) as RuleKey[]).map((key) => {
                const on = !!config.active[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleRule(key)}
                    className={`flex items-center gap-1.5 rounded-[8px] border px-[11px] py-1.5 ${on ? "border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]" : "border-[#2a2a31] bg-[#161619] text-[#8c8c95] hover:text-[#ececee]"}`}
                  >
                    <span className="text-[12px] font-semibold">{STRAT_RULES[key].name}</span>
                    <span className="text-[9px] opacity-70">{STRAT_RULES[key].tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Forecast / tracker (unchanged logic, V8 styling) ---------- */

type LiveForecast = {
  symbol: string;
  direction: "LONG" | "SHORT" | "WAIT";
  target: number | null;
  target2: number | null;
  stop: number | null;
  entry: number | null;
  targetPct: number;
  confidence: number;
  windowMin: [number, number];
  generatedAt: number;
  points: number[];
  expectedNow: number | null;
  color: string;
};

type ForecastTracker = {
  status: "tracking" | "invalidated" | "hit" | "waiting";
  label: string;
  note: string;
  matchPct: number;
  progressPct: number;
  actual: number | null;
  color: string;
  elapsedBars: number;
  totalBars: number;
};

function PlanRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between rounded-[7px] bg-[#0e0e10] px-[10px] py-2 text-[12px]">
      <span className="text-[#8c8c95]">{label}</span>
      <span className="font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

function buildForecast(symbol: string, row: LiveTradeRow | null | undefined, ai: LiveAiInsight | undefined, generatedAt: number): LiveForecast {
  const entry = row?.price ?? null;
  const rsi = row?.rsi ?? 50;
  const change = row?.changePct ?? 0;
  const relVolume = row?.relativeVolume ?? 1;
  const aiSignal = ai?.signal?.toLowerCase() ?? "";
  const wantsLong = aiSignal.includes("buy") || row?.signal === "Possible turn" || (rsi < 68 && change >= 0);
  const wantsShort = aiSignal.includes("sell") || aiSignal.includes("avoid") || rsi >= 74 || (rsi > 32 && change < 0);
  const direction: LiveForecast["direction"] = !entry ? "WAIT" : wantsShort ? "SHORT" : wantsLong ? "LONG" : "WAIT";
  const riskProfile = liveRiskProfile(symbol);
  const stopPct = riskProfile.stopPct;
  const rawMove = Math.min(riskProfile.maxTargetPct, Math.max(riskProfile.minTargetPct, stopPct * 1.5, Math.abs(change) * 0.3));
  const targetPct = direction === "SHORT" ? -rawMove : direction === "LONG" ? rawMove : 0;
  const target = entry != null ? entry * (1 + targetPct / 100) : null;
  const target2Pct = direction === "WAIT" ? 0 : Math.sign(targetPct) * Math.max(Math.abs(targetPct) * 1.6, stopPct * 2.5);
  const target2 = entry != null ? entry * (1 + target2Pct / 100) : null;
  const stop = entry != null ? entry * (1 + (direction === "SHORT" ? stopPct : direction === "LONG" ? -stopPct : -0.3) / 100) : null;
  const confidence = Math.min(92, Math.max(32, Math.round((ai?.confidence ?? 52) * 0.55 + signalConfidence(row) * 0.45)));
  const windowMin: [number, number] = relVolume >= 2 ? [6, 12] : relVolume >= 1.4 ? [10, 16] : riskProfile.windowMin;
  const color = direction === "SHORT" ? "#f2575c" : direction === "LONG" ? "#3ecf8e" : "#f5c451";
  const points = buildActualPoints(entry, change, generatedAt);
  const elapsed = Math.min(1, (Date.now() - generatedAt) / (windowMin[1] * 60_000));
  const expectedNow = entry != null && target != null ? entry + (target - entry) * elapsed : null;

  return { symbol, direction, target, target2, stop, entry, targetPct, confidence, windowMin, generatedAt, points, expectedNow, color };
}

function buildDecisionNarrative(forecast: LiveForecast, row: LiveTradeRow | null | undefined, strategy: StrategySignal, ai: LiveAiInsight | undefined) {
  const rsi = row?.rsi ?? 50;
  const change = row?.changePct ?? 0;
  const aligned = strategy.aligned;
  const total = Math.max(1, strategy.total);
  if (forecast.entry == null) {
    return {
      summary: "No trade: TradingView has not supplied a usable live price yet.",
      trigger: "A valid quote plus enough ticks to measure direction and risk.",
      invalidation: "No position exists, so no capital should be exposed.",
    };
  }
  if (forecast.direction === "WAIT") {
    return {
      summary: `No edge yet. Price is ${change >= 0 ? "+" : ""}${change.toFixed(2)}%, tape RSI is ${rsi.toFixed(0)}, and only ${aligned}/${total} active rules agree. Dante will not manufacture a trade from mixed evidence.`,
      trigger: `Momentum expansion with at least ${Math.min(total, Math.max(2, aligned + 1))}/${total} rules aligned and price holding beyond the current ${formatLivePrice(forecast.entry)} pivot.`,
      invalidation: "Entering before confirmation would make the stop arbitrary rather than evidence-based.",
    };
  }
  const directionWord = forecast.direction === "LONG" ? "upside" : "downside";
  const aiSupport = ai?.summary ? " Dante's latest tape read supports the setup." : " The call is based on live tape only; catalyst timing remains unverified.";
  return {
    summary: `${forecast.direction} because ${directionWord} momentum is active: price is ${change >= 0 ? "+" : ""}${change.toFixed(2)}%, RSI is ${rsi.toFixed(0)}, and ${aligned}/${total} strategy rules align.${aiSupport}`,
    trigger: `${forecast.direction === "LONG" ? "Buyers" : "Sellers"} must keep price on the correct side of ${formatLivePrice(forecast.entry)} and continue toward TP1 ${forecast.target == null ? "—" : formatLivePrice(forecast.target)} within ${forecast.windowMin[1]} minutes.`,
    invalidation: `${forecast.direction === "LONG" ? "Buyers lose control" : "Sellers lose control"} if price reaches the locked stop ${forecast.stop == null ? "—" : formatLivePrice(forecast.stop)}; exit automatically and review the failed momentum assumption.`,
  };
}

function isCrossAssetSymbol(symbol: string) {
  return symbol.includes(":") && !symbol.startsWith("SET:");
}

function paperSpreadEstimate(symbol: string, price: number) {
  const normalized = symbol.toUpperCase();
  if (/XAU/.test(normalized)) return 0.5;
  if (/XAG/.test(normalized)) return 0.03;
  if (/JPY/.test(normalized)) return 0.012;
  if (/^(OANDA|FX|FOREXCOM|SAXO):/.test(normalized)) return Math.max(price * 0.00002, 0.00002);
  if (/^(BINANCE|COINBASE|KRAKEN|BITSTAMP):|BTC|ETH|SOL/.test(normalized)) return Math.max(price * 0.0003, 0.01);
  if (/1!$|^(CME|CBOT|COMEX|NYMEX):/.test(normalized)) return Math.max(price * 0.0001, 0.01);
  return Math.max(price * 0.0001, 0.01);
}

function buildLiveTapeInsight(symbol: string, row: LiveTradeRow | null | undefined): LiveAiInsight {
  const change = row?.changePct ?? 0;
  const rsi = row?.rsi ?? 50;
  const direction = change > 0 ? "LONG" : change < 0 ? "SHORT" : "WAIT";
  const momentum = change > 0 ? "positive" : change < 0 ? "negative" : "flat";
  return {
    signal: direction,
    confidence: signalConfidence(row),
    summary: `${symbol} has ${momentum} live momentum (${change >= 0 ? "+" : ""}${change.toFixed(2)}%) with estimated tape RSI near ${rsi.toFixed(0)}. Dante is sizing this from the current TradingView quote; macro releases and session liquidity still require confirmation.`,
    bullets: [
      `Live price: ${row?.price == null ? "unavailable" : formatLivePrice(row.price)}.`,
      `Current tape bias: ${direction}.`,
      "News and scheduled-event timing are not verified by the quote stream.",
    ],
    recap: `${direction} tape bias for ${symbol}`,
    agentFitReason: "Cross-asset live-tape fallback",
  };
}

function liveRiskProfile(symbol: string): { stopPct: number; minTargetPct: number; maxTargetPct: number; windowMin: [number, number] } {
  const normalized = symbol.toUpperCase();
  if (/XAU|XAG/.test(normalized)) return { stopPct: 0.22, minTargetPct: 0.36, maxTargetPct: 1.1, windowMin: [8, 20] };
  if (/^(OANDA|FX|FOREXCOM|SAXO):/.test(normalized)) return { stopPct: 0.12, minTargetPct: 0.2, maxTargetPct: 0.65, windowMin: [8, 18] };
  if (/^(BINANCE|COINBASE|KRAKEN|BITSTAMP):|BTC|ETH|SOL/.test(normalized)) return { stopPct: 0.7, minTargetPct: 1.1, maxTargetPct: 3.5, windowMin: [12, 30] };
  if (/1!$|^(CME|CBOT|COMEX|NYMEX):/.test(normalized)) return { stopPct: 0.3, minTargetPct: 0.5, maxTargetPct: 1.6, windowMin: [8, 20] };
  return { stopPct: 0.55, minTargetPct: 0.83, maxTargetPct: 2.4, windowMin: [18, 26] };
}

type LeanTapeDecision = {
  action: "EXECUTE" | "HOLD" | "REJECT";
  price: number | null;
  calculatedPositionSize: number;
  rMultiple: number | null;
  spreadCheck: "PASS" | "FAIL" | "UNVERIFIABLE";
  reason: string;
};

function buildLeanTapeDecision(review: LiveTradeRiskReview | undefined, row: LiveTradeRow | null, riskBudget: number, historicalSpreadMean: number | null, spreadSampleCount: number, drawdownKillSwitch: boolean): LeanTapeDecision {
  const price = row?.price ?? null;
  if (!review) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple: null, spreadCheck: "UNVERIFIABLE", reason: "Waiting for the first full context audit." };
  if (drawdownKillSwitch) return { action: "REJECT", price, calculatedPositionSize: 0, rMultiple: null, spreadCheck: "FAIL", reason: "Daily drawdown kill switch is active." };
  if (review.action !== "EXECUTE") return { action: review.action, price, calculatedPositionSize: 0, rMultiple: null, spreadCheck: review.spreadCheck, reason: review.action === "HOLD" ? "Hourly context still says wait; price alone cannot authorize a new trade." : "Hourly context rejected the setup; price alone cannot revive it." };
  if (price == null) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple: null, spreadCheck: "UNVERIFIABLE", reason: "Live price is unavailable, so execution is paused." };

  const currentSpread = row?.ask != null && row?.bid != null ? Math.max(0, row.ask - row.bid) : null;
  const spreadCheck = currentSpread == null || historicalSpreadMean == null || spreadSampleCount < 5
    ? "UNVERIFIABLE"
    : currentSpread <= historicalSpreadMean * 2 ? "PASS" : "FAIL";
  if (spreadCheck !== "PASS") return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple: null, spreadCheck, reason: spreadCheck === "FAIL" ? "The live spread expanded beyond the 2× rolling limit." : "The one-minute tape check lacks enough spread evidence." };

  const riskPerUnit = Math.abs(price - review.hardStopLoss);
  const target = review.takeProfitTargets[0];
  const rewardPerUnit = Math.abs(target - price);
  const rMultiple = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;
  const stopBroken = review.direction === "LONG" ? price <= review.hardStopLoss : price >= review.hardStopLoss;
  const targetPassed = review.direction === "LONG" ? price >= target : price <= target;
  if (stopBroken) return { action: "REJECT", price, calculatedPositionSize: 0, rMultiple, spreadCheck, reason: "Price crossed the audited structural invalidation." };
  if (targetPassed) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple, spreadCheck, reason: "Price already reached the audited first target; do not chase a stale entry." };
  if (rMultiple == null || rMultiple < 1.5) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple, spreadCheck, reason: "Repriced reward-to-risk is now below the required 1.5R." };

  const originalRisk = Math.abs(review.entryPrice - review.hardStopLoss) || 1;
  const entryDrift = Math.abs(price - review.entryPrice) / originalRisk;
  if (entryDrift > 0.5) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple, spreadCheck, reason: "Price moved more than 0.5R from the audited entry; wait for the hourly context refresh." };
  const calculatedPositionSize = Math.max(0, Math.floor(riskBudget / riskPerUnit));
  if (calculatedPositionSize < 1) return { action: "HOLD", price, calculatedPositionSize: 0, rMultiple, spreadCheck, reason: "Current stop distance is too large for the allowed tranche risk." };
  return { action: "EXECUTE", price, calculatedPositionSize, rMultiple, spreadCheck, reason: `Price, spread, and repriced ${rMultiple.toFixed(2)}R still support the hourly ${review.direction} thesis.` };
}

function buildTracker(forecast: LiveForecast, row: LiveTradeRow | null | undefined): ForecastTracker {
  const actual = row?.price ?? forecast.entry;
  const elapsedBars = Math.min(forecast.windowMin[1], Math.max(0, Math.round((Date.now() - forecast.generatedAt) / 60_000)));
  const totalBars = forecast.windowMin[1];
  if (forecast.direction === "WAIT" || forecast.entry == null || forecast.target == null || forecast.stop == null || actual == null || forecast.expectedNow == null) {
    return { status: "waiting", label: "WAITING", note: "Need a live price and a clean direction before tracking forecast quality.", matchPct: 0, progressPct: 0, actual, color: "#f5c451", elapsedBars, totalBars };
  }

  const targetDistance = Math.abs(forecast.target - forecast.entry) || 1;
  const miss = Math.abs(actual - forecast.expectedNow);
  const matchPct = Math.max(0, Math.min(100, Math.round(100 - (miss / targetDistance) * 100)));
  const progressRaw = forecast.direction === "LONG"
    ? ((actual - forecast.entry) / (forecast.target - forecast.entry)) * 100
    : ((forecast.entry - actual) / (forecast.entry - forecast.target)) * 100;
  const progressPct = Math.max(0, Math.min(100, Math.round(progressRaw)));
  const invalidated = forecast.direction === "LONG" ? actual <= forecast.stop : actual >= forecast.stop;
  const hit = forecast.direction === "LONG" ? actual >= forecast.target : actual <= forecast.target;

  if (invalidated) {
    return { status: "invalidated", label: "INVALIDATED", note: "Thesis broke: price crossed the invalidation level. AI should revise the plan.", matchPct: 0, progressPct, actual, color: "#f2575c", elapsedBars, totalBars };
  }
  if (hit) {
    return { status: "hit", label: "TARGET HIT", note: "Forecast target was reached. Stop tracking this call and create a fresh read.", matchPct: 100, progressPct: 100, actual, color: "#3ecf8e", elapsedBars, totalBars };
  }
  return { status: "tracking", label: matchPct >= 65 ? "TRACKING" : "DRIFTING", note: matchPct >= 65 ? "Price is still following the forecast path." : "Price is drifting away from the expected path; wait for confirmation before acting.", matchPct, progressPct, actual, color: matchPct >= 65 ? "#3ecf8e" : "#f5c451", elapsedBars, totalBars };
}

function signalConfidence(row: LiveTradeRow | null | undefined) {
  if (!row) return 45;
  const rsi = row.rsi ?? 50;
  const relVolume = row.relativeVolume ?? 1;
  const change = Math.abs(row.changePct ?? 0);
  const rsiScore = rsi > 70 || rsi < 35 ? 70 : rsi >= 45 && rsi <= 62 ? 62 : 50;
  return Math.min(90, Math.round(rsiScore + Math.max(0, relVolume - 1) * 9 + Math.min(10, change * 2)));
}

function calculateRsi(values: number[]) {
  if (values.length < 3) return 50;
  const period = Math.min(14, values.length - 1);
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  return 100 - 100 / (1 + gains / losses);
}

function buildActualPoints(entry: number | null, change: number, generatedAt: number) {
  const base = entry ?? 100;
  const drift = (change / 100) * base;
  const age = Math.min(10, Math.max(1, Math.round((Date.now() - generatedAt) / 60_000) + 5));
  return Array.from({ length: 11 }, (_, index) => {
    const t = index / 10;
    const wave = Math.sin(index * 1.7) * base * 0.0009;
    return base - drift * (1 - t) - age * base * 0.00018 + wave;
  });
}

// Warm-up ticks so the indicator engine has enough history before real ticks accumulate.
function seedSeries(price: number) {
  return Array.from({ length: 40 }, (_, index) => {
    const wiggle = Math.sin(index * 0.9) * price * 0.0006 + Math.cos(index * 2.3) * price * 0.0003;
    return parseFloat((price + wiggle).toFixed(4));
  });
}

function formatLivePrice(value: number) {
  return formatCurrency(value, "USD");
}

function ensureTradingViewScript() {
  if (window.TradingView) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://s3.tradingview.com/tv.js"]');
  if (existing) {
    return new Promise<void>((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (window.TradingView) resolve();
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView script failed to load"));
    document.head.appendChild(script);
  });
}
