import type { StockRecord } from "../data/market";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type MarketCatalogStatus = {
  source: string;
  cacheHit: boolean;
  ttlSeconds: number;
  counts: Record<string, number>;
  fetchedAt: Record<string, string>;
  expiresAt: Record<string, string>;
};

export async function ensureMarketCatalog(): Promise<MarketCatalogStatus> {
  const response = await fetch(`${API_BASE}/catalog`);
  if (!response.ok) throw new Error(`Failed to initialize market catalog: ${response.status}`);
  return (await response.json()) as MarketCatalogStatus;
}

export type StockTechnicals = {
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema20?: number;
  volatility?: number;
  avgVolume?: number;
  currentVolume?: number;
  volumeRatio?: number;
  support?: number;
  resistance?: number;
  momentum?: number;
  trend?: {
    week?: number;
    month?: number;
    quarter?: number;
  };
  signal?: string;
};

export type StockNewsItem = {
  title: string;
  link?: string;
  publisher?: string;
  provider?: string;
  publishedAt?: string;
  summary?: string;
};

export type StockDetailResponse = {
  stock: StockRecord;
  history: Array<{
    date: string;
    close: number;
    volume?: number;
    high?: number;
    low?: number;
    open?: number;
  }>;
  technicals: StockTechnicals;
  news: StockNewsItem[];
  business?: {
    sector?: string;
    industry?: string;
    marketCap?: number;
    enterpriseValue?: number;
    peRatio?: number;
    priceToBook?: number;
    roe?: number;
    roa?: number;
    profitMargin?: number;
    operatingMargin?: number;
    grossMargin?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
    dividendYield?: number;
    payoutRatio?: number;
    debtToEquity?: number;
    beta?: number;
    ytdReturn?: number;
    oneYearReturn?: number;
    twoYearReturn?: number;
    threeYearReturn?: number;
    fourYearReturn?: number;
    analystRating?: string;
    analystScore?: number;
    targetMeanPrice?: number;
    currentPrice?: number;
    companySummary?: string;
  };
  performance?: {
    trend?: string;
    momentumScore?: number;
    returns?: {
      ytd?: number;
      "1y"?: number;
      "2y"?: number;
      "3y"?: number;
      "4y"?: number;
    };
    line?: number[];
  };
  peerRank?: {
    sector?: string;
    industry?: string;
    count?: number;
    rank?: number;
    isNo1?: boolean;
    leader?: string;
    leaderScore?: number;
  };
  verdict?: {
    action?: "BUY" | "BUY SETUP" | "WATCH" | "WAIT" | "PASS";
    headline?: string;
    analyst?: string;
    confidence?: string;
    score?: number;
    setup?: "breakout" | "swing" | "reversal";
    setupLabel?: string;
    strategyScore?: number;
    setupScore?: number;
  };
  outlook?: {
    summary?: string;
    bull?: string;
    bear?: string;
    industryLeader?: boolean;
  };
  financials?: {
    incomeStatement?: Record<string, unknown>;
    quarterlyIncomeStatement?: Record<string, unknown>;
    balanceSheet?: Record<string, unknown>;
    quarterlyBalanceSheet?: Record<string, unknown>;
    cashFlow?: Record<string, unknown>;
    quarterlyCashFlow?: Record<string, unknown>;
    earnings?: Array<Record<string, unknown>>;
    calendar?: Record<string, unknown>;
    secFilings?: Array<Record<string, unknown>>;
  };
  sectorInsight?: {
    key?: string;
    industries?: Array<Record<string, unknown>>;
    topEtfs?: Array<{ symbol: string; name: string }>;
    topMutualFunds?: Array<{ symbol: string; name: string }>;
  } | null;
  industryInsight?: {
    key?: string;
    sectorKey?: string | null;
    sectorName?: string | null;
    topPerformingCompanies?: Array<Record<string, unknown>>;
    topGrowthCompanies?: Array<Record<string, unknown>>;
  } | null;
  strategy?: string;
  ai?: StockAnalysisResponse;
};

export type StockResearchResponse = {
  incomeStatement?: { latest?: Record<string, number>; history?: Array<Record<string, number | string | null>> };
  quarterlyIncomeStatement?: { latest?: Record<string, number>; history?: Array<Record<string, number | string | null>> };
  balanceSheet?: { latest?: Record<string, number>; history?: Array<Record<string, number | string | null>> };
  cashFlow?: { latest?: Record<string, number>; history?: Array<Record<string, number | string | null>> };
  calendar?: Record<string, unknown>;
  recommendationsSummary?: Array<Record<string, unknown>>;
  analystPriceTargets?: Record<string, unknown>;
  earningsEstimate?: Array<Record<string, unknown>>;
  revenueEstimate?: Array<Record<string, unknown>>;
  earningsHistory?: Array<Record<string, unknown>>;
  epsTrend?: Array<Record<string, unknown>>;
  epsRevisions?: Array<Record<string, unknown>>;
  growthEstimates?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
  dividends?: Array<Record<string, unknown>>;
};

export type StockAnalysisScore = { label: string; score: number; why: string };

export type StockAnalysisTargetPrice = {
  currentPrice?: number | null;
  targetPrice?: number | null;
  impliedUpsidePct?: number | null;
  timeHorizon: string;
  basis: string;
};

export type StockAnalysisEntryPrice = {
  currentPrice?: number | null;
  entryPrice?: number | null;
  distanceFromCurrentPct?: number | null;
  why: string;
};

export type StockAnalysisResponse = {
  signal: string;
  headline: string;
  tone: "good" | "warn" | "bad";
  confidence: number;
  summary: string;
  targetPrice?: StockAnalysisTargetPrice;
  entryPrice?: StockAnalysisEntryPrice;
  scores: StockAnalysisScore[];
  bullets: string[];
  dcaTiming?: string;
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
  recap?: string | null;
  agentFit?: "aligned" | "neutral" | "against" | null;
  agentFitReason?: string | null;
};

export type AgentStyle = { Discipline: number; Patience: number; Data: number; Instinct: number };

export type AgentBadge = {
  id: string;
  name: string;
  mono: string;
  title: string;
  color: string;
  avatarUrl?: string | null;
  premium?: boolean;
};

export type AgentProfile = AgentBadge & {
  tagline: string;
  years: number;
  bio: string;
  belief: string;
  knows: string[];
  style: AgentStyle;
};

export type StrategyPick = {
  ticker: string;
  name: string;
  action: string;
  tone: "good" | "warn" | "bad";
  subtitle: string;
  reason: string;
  entry?: number | null;
  target?: number | null;
  stop?: number | null;
  riskReward?: string | null;
  upsidePct?: number | null;
  conviction: number;
};

export type StrategyPlaybookResponse = {
  strategy: string;
  headline: string;
  marketRead: string;
  picks: StrategyPick[];
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
  recap?: string | null;
  agentFit?: "aligned" | "neutral" | "against" | null;
  agentFitReason?: string | null;
};

export type QuantPerspectiveCheck = {
  label: string;
  value: string;
  status: "good" | "warn" | "bad";
  insight: string;
};

export type QuantPerspectiveResponse = {
  signal: string;
  tone: "good" | "warn" | "bad";
  buyScore: number;
  investability: "FAVORABLE" | "WATCH" | "AVOID";
  hook: string;
  nextActionWindow: string;
  buyPlan: string;
  summary: string;
  setup: string;
  trigger: string;
  risk: string;
  checks: QuantPerspectiveCheck[];
  tradingViewFocus: string[];
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
  recap?: string | null;
  agentFit?: "aligned" | "neutral" | "against" | null;
  agentFitReason?: string | null;
};

export type ValuationVerdictResponse = {
  symbol: string;
  name: string;
  currency: string;
  verdict: "CHASING" | "FAIR" | "DISCOUNT" | "INSUFFICIENT_DATA";
  chasingAnswer: string;
  narrative: string;
  rightNow: {
    action: "BUY" | "WAIT" | "TRIM" | "AVOID";
    note: string;
    entryOnlyAt?: number | null;
    pctAway?: number | null;
    conviction: number;
  };
  metrics: {
    currentPrice?: number | null;
    ytdPct?: number | null;
    bookValuePerShare?: number | null;
    pbv?: number | null;
    pbvFloor?: number | null;
    dividendYield?: number | null;
  };
  structureBand: {
    discountAnchor?: number | null;
    fairAnchor?: number | null;
    now?: number | null;
    zoneLabel: string;
  };
  whatAiSees: string[];
  thePlay: {
    text: string;
    addBackLow?: number | null;
    addBackHigh?: number | null;
  };
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
  recap?: string | null;
  agentFit?: "aligned" | "neutral" | "against" | null;
  agentFitReason?: string | null;
};

export type TodayPerformanceResponse = {
  signal: string;
  tone: "good" | "warn" | "bad";
  buyScore: number;
  headline: string;
  summary: string;
  sessionRead: string;
  whatChangedToday: string;
  keyLevel: string;
  action: string;
  risk: string;
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
};

export type PortfolioReviewResponse = {
  score: number;
  verdict: string;
  intro: string;
  sections: Array<{ h: string; b: string }>;
  bullets: string[];
  sign: string;
  source?: "openai";
  model?: string;
  agent: AgentBadge;
};

export type PortfolioHolding = StockRecord & {
  id: number;
  shares: number;
  averageCost: number;
  strategy: string;
  monthlyDca: number;
  createdAt: string;
  value: number;
  cost: number;
  gainLoss: number;
  gainLossPct: number;
};

export type DcaOrder = {
  id: number;
  symbol: string;
  amount: number;
  scheduledFor: string;
  strategy: string;
  status: string;
  executedPrice?: number | null;
  shares?: number | null;
  createdAt: string;
};

export type PortfolioDashboard = {
  summary: { totalValue: number; invested: number; gainLoss: number; gainLossPct: number; dividendsYtd: number; forwardYield: number };
  holdings: PortfolioHolding[];
  dcaOrders: DcaOrder[];
  chart: Array<{ date: string; value: number; cost: number }>;
  markers: Array<{ date: string; symbol: string; amount: number }>;
  incomeEvents: Array<{ date: string; symbol: string; kind: string; amount?: number | null }>;
};

export type MarketCalendarEvent = {
  date: string;
  symbol: string;
  name: string;
  kind: "ex-dividend" | "payment";
  region: "us" | "th";
  marketLabel: string;
  isHolding: boolean;
  amount?: number | null;
  note?: string | null;
};

export type MarketCalendarResponse = {
  month: string;
  region: "all" | "us" | "th";
  summary: {
    totalEvents: number;
    holdingEvents: number;
    usEvents: number;
    thEvents: number;
    paymentsTotal: number;
  };
  events: MarketCalendarEvent[];
};

export type MarketSnapshot = { market: string; status: Record<string, unknown>; summary: Record<string, unknown> };

export type MarketComparisonResponse = {
  stock: { symbol: string; name: string; returnPct: number };
  benchmark: { symbol: string; name: string; returnPct: number };
  peer: { symbol: string; name: string; returnPct: number };
  points: Array<{ date: string; stock: number; benchmark: number; peer: number }>;
};

export type PaginatedStocksResponse = {
  stocks?: StockRecord[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  performance?: {
    score?: number;
    confidence?: string;
    recommendation?: string;
  };
  strategy?: string;
  label?: string;
  narrative?: Record<string, string>;
  matches?: StockRecord[];
};

export type DiscoveryItem = {
  symbol: string;
  name: string;
  kind: string;
  query: string;
  exchange?: string | null;
  quoteType?: string | null;
  sector?: string | null;
  industry?: string | null;
  currency?: string | null;
  price?: number | null;
  changePct?: number | null;
  marketCap?: number | null;
  source?: string;
};

export type DiscoverySection = {
  kind: string;
  label: string;
  count: number;
  items: DiscoveryItem[];
};

export type DiscoveryResponse = {
  query: string;
  kind: string;
  limit: number;
  page: number;
  total: number;
  totalPages: number;
  count: number;
  items: DiscoveryItem[];
  sections: DiscoverySection[];
  live: StockRecord[];
};

export type SectorInsightResponse = {
  key?: string;
  industries?: Array<Record<string, unknown>>;
  topEtfs?: Array<{ symbol: string; name: string }>;
  topMutualFunds?: Array<{ symbol: string; name: string }>;
};

export type IndustryInsightResponse = {
  key?: string;
  sectorKey?: string | null;
  sectorName?: string | null;
  topPerformingCompanies?: Array<Record<string, unknown>>;
  topGrowthCompanies?: Array<Record<string, unknown>>;
};

export type LiveTradePreset = "overbought" | "oversold" | "active" | "turning";

export type LiveTradeRow = {
  symbol: string;
  name: string;
  price?: number | null;
  changePct?: number | null;
  volume?: number | null;
  relativeVolume?: number | null;
  rsi?: number | null;
  rsi5?: number | null;
  signal: string;
};

export type LiveTradeScreenerResponse = {
  preset: LiveTradePreset;
  source: string;
  warning?: string;
  rows: LiveTradeRow[];
};

export type LiveTradeQuoteResponse = {
  symbol: string;
  source: string;
  warning?: string;
  row: LiveTradeRow | null;
};

export async function loadStockDetail(symbol: string, strategy?: string, mode?: string): Promise<StockDetailResponse> {
  const params = new URLSearchParams();
  if (strategy) params.set("strategy", strategy);
  if (mode) params.set("mode", mode);
  const query = params.toString() ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}${query}`);
  if (!response.ok) {
    throw new Error(`Failed to load stock detail: ${response.status}`);
  }

  return (await response.json()) as StockDetailResponse;
}

export async function loadStockResearch(symbol: string): Promise<StockResearchResponse> {
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/financials`);
  if (!response.ok) throw new Error(`Failed to load stock research: ${response.status}`);
  return (await response.json()) as StockResearchResponse;
}

export type UpwardMove = {
  date: string;
  movePct: number;
  direction?: "UP" | "DOWN" | "FLAT";
  phase?: "impulse" | "pullback" | "base" | "breakout" | "rejection" | "retest" | "continuation" | "mean_reversion" | "distribution" | "accumulation";
  confidence: number;
  reason?: string;
};

export type HistoricalMove = {
  date: string;
  fromPrice?: number | null;
  toPrice?: number | null;
  movePct: number;
  direction: "UP" | "DOWN" | "FLAT";
  confidence: number;
  reason?: string | null;
};

export type UpwardMovesResponse = {
  symbol: string;
  timeframe: "1D" | "1W";
  currentPrice: number;
  pathBias?: "BULLISH_CONTINUATION" | "PULLBACK_THEN_BOUNCE" | "RESISTANCE_REJECTION" | "SIDEWAYS_COMPRESSION" | "BREAKDOWN_RISK" | "VOLATILE_RANGE";
  directionChanges?: number;
  headline?: string;
  thesis?: string;
  risk?: string;
  history?: Array<{ date: string; close: number }>;
  historicalMoves?: HistoricalMove[];
  moves: UpwardMove[];
  sampleSize: number;
  averageMovePct: number;
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
};

export async function loadUpwardMoves(symbol: string, timeframe: "1D" | "1W", agent?: string): Promise<UpwardMovesResponse> {
  const query = new URLSearchParams({ timeframe });
  if (agent) query.set("agent", agent);
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/upward-moves?${query}`);
  if (!response.ok) {
    let detail = `Failed to load technical moves: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the HTTP status fallback when the backend does not return JSON.
    }
    throw new Error(detail);
  }
  return (await response.json()) as UpwardMovesResponse;
}

export async function loadMarketSnapshot(market: string): Promise<MarketSnapshot> {
  const response = await fetch(`${API_BASE}/market/${encodeURIComponent(market)}`);
  if (!response.ok) throw new Error(`Failed to load market: ${response.status}`);
  return (await response.json()) as MarketSnapshot;
}

export async function loadMarketCalendar(params?: { month?: string; region?: "all" | "us" | "th" }): Promise<MarketCalendarResponse> {
  const query = new URLSearchParams();
  if (params?.month) query.set("month", params.month);
  if (params?.region) query.set("region", params.region);
  const response = await fetch(`${API_BASE}/calendar${query.toString() ? `?${query}` : ""}`);
  if (!response.ok) throw new Error(`Failed to load market calendar: ${response.status}`);
  return (await response.json()) as MarketCalendarResponse;
}

export async function loadMarketComparison(symbol: string): Promise<MarketComparisonResponse> {
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/market-comparison`);
  if (!response.ok) throw new Error(`Failed to load market comparison: ${response.status}`);
  return (await response.json()) as MarketComparisonResponse;
}

export type DeepAnalysisResponse = {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  changePercent: number;
  signal: string;
  color: string;
  chart: Array<{ date: string; close: number }>;
  entry: number;
  stop: number;
  target: number;
  riskReward: number;
  buyZoneLow: number;
  buyZoneHigh: number;
  support?: number;
  resistance?: number;
  action: string;
  bullets: string[];
  when: string;
  generatedAt: string;
};

export type BuyTimingResponse = {
  symbol: string;
  name: string;
  currency: string;
  price?: number | null;
  headline: string;
  summary: string;
  action: "BUY" | "WAIT" | "TRIM" | "AVOID";
  narrativeSource: "calculated" | "openai";
  model?: string | null;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
  recap?: string | null;
  agentFit?: "aligned" | "neutral" | "against" | null;
  agentFitReason?: string | null;
  nextBuy: { start?: string | null; end?: string | null; opensInDays?: number | null; label?: string | null };
  nextTrim: { start?: string | null; end?: string | null; opensInDays?: number | null; label?: string | null };
  entryBand: {
    low?: number | null;
    high?: number | null;
    entry?: number | null;
    gapPct?: number | null;
    upsideLeftPct?: number | null;
    isAtOrBelowEntry?: boolean;
  };
  cycle: {
    nextExDate?: string | null;
    lastExDate?: string | null;
    cycleDays?: number | null;
    positionPct?: number | null;
    daysToEx?: number | null;
    isInferred: boolean;
    confidence?: "measured" | "estimated_annual" | "none";
  };
  postExDipPattern: {
    hasPattern: boolean;
    sampleSize: number;
    hitRate?: number | null;
    averageDipPct?: number | null;
    averageRandomDipPct?: number | null;
  };
  stats: {
    cyclesTested: number;
    cyclesHit: number;
    avgPostExDipPct?: number | null;
    fullRecoverySessions?: number | null;
    edgeVsRandomBuyPct?: number | null;
  };
  priceContext?: {
    years?: number | null;
    samples?: number | null;
    avgPrice?: number | null;
    low?: number | null;
    high?: number | null;
    currentPct?: number | null;
    vsAvgPct?: number | null;
  } | null;
  timeline?: {
    start?: string | null;
    end?: string | null;
    todayPct?: number | null;
    nextExPct?: number | null;
    buyZone: { startPct?: number | null; endPct?: number | null; start?: string | null; end?: string | null; label?: string | null };
    trimZone: { startPct?: number | null; endPct?: number | null; start?: string | null; end?: string | null; label?: string | null };
  } | null;
  seasonality: Array<{ month: string; returnPct: number }>;
  cheapestMonth?: string | null;
  peakMonth?: string | null;
  monthlyMap?: Array<{ month: string; score: number; action: "BUY" | "TRIM" | "HOLD"; returnPct: number; isExMonth: boolean; isCurrent: boolean; note: string }>;
  events: Array<{ exDate: string; amount?: number | null; dipPct: number; recoverySessions?: number | null }>;
  technicalContext?: {
    signal?: string | null;
    entry?: number | null;
    target?: number | null;
    stop?: number | null;
    support?: number | null;
    resistance?: number | null;
  };
};

export async function loadDeepAnalysis(symbol: string): Promise<DeepAnalysisResponse> {
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/deep`);
  if (!response.ok) throw new Error(`Failed to load deep analysis: ${response.status}`);
  return (await response.json()) as DeepAnalysisResponse;
}

export async function loadStockDetailsBatch(
  items: Array<{ symbol: string; strategy: string }>,
): Promise<Record<string, StockDetailResponse>> {
  const response = await fetch(`${API_BASE}/details/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error(`Failed to load stock detail batch: ${response.status}`);
  const payload = (await response.json()) as { items?: Record<string, StockDetailResponse> };
  return payload.items ?? {};
}

export async function loadAgents(): Promise<AgentProfile[]> {
  const response = await fetch(`${API_BASE}/agents`);
  if (!response.ok) throw new Error(`Failed to load agents: ${response.status}`);
  return (await response.json()) as AgentProfile[];
}

export async function loadBuyTiming(symbol: string, agent?: string): Promise<BuyTimingResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/buy-timing${query}`);
  if (!response.ok) throw new Error(`Failed to load buy timing: ${response.status}`);
  return (await response.json()) as BuyTimingResponse;
}

export async function summarizeStock(symbol: string, strategy?: string, agent?: string): Promise<StockAnalysisResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    throw new Error(`Failed to summarize stock: ${response.status}`);
  }

  return (await response.json()) as StockAnalysisResponse;
}

export async function loadQuantPerspective(symbol: string, strategy?: string, mode?: string, agent?: string): Promise<QuantPerspectiveResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/quant${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy, mode })
  });

  if (!response.ok) {
    throw new Error(`Failed to load quant perspective: ${response.status}`);
  }

  return (await response.json()) as QuantPerspectiveResponse;
}

export async function loadValuationVerdict(symbol: string, strategy?: string, agent?: string): Promise<ValuationVerdictResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/valuation${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    throw new Error(`Failed to load valuation verdict: ${response.status}`);
  }

  return (await response.json()) as ValuationVerdictResponse;
}

export async function loadTodayPerformance(symbol: string, strategy?: string, agent?: string): Promise<TodayPerformanceResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/today${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    throw new Error(`Failed to load today performance: ${response.status}`);
  }

  return (await response.json()) as TodayPerformanceResponse;
}

export async function loadStrategyPlaybook(params: { strategy: string; region?: "all" | "us" | "th"; limit?: number; candidateLimit?: number; agent?: string }): Promise<StrategyPlaybookResponse> {
  const query = params.agent ? `?agent=${encodeURIComponent(params.agent)}` : "";
  const response = await fetch(`${API_BASE}/strategy/recommendations${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      strategy: params.strategy,
      region: params.region ?? "all",
      limit: params.limit ?? 5,
      candidateLimit: params.candidateLimit ?? 40
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to load strategy recommendations: ${response.status}`);
  }

  return (await response.json()) as StrategyPlaybookResponse;
}

export async function loadPortfolioReview(agent?: string): Promise<PortfolioReviewResponse> {
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : "";
  const response = await fetch(`${API_BASE}/analysis/portfolio/review${query}`, { method: "POST" });
  if (!response.ok) throw new Error(`Failed to load portfolio review: ${response.status}`);
  return (await response.json()) as PortfolioReviewResponse;
}

export async function loadPortfolio(): Promise<PortfolioDashboard> {
  const response = await fetch(`${API_BASE}/portfolio`);
  if (!response.ok) throw new Error(`Failed to load portfolio: ${response.status}`);
  return (await response.json()) as PortfolioDashboard;
}

export async function saveHolding(value: { symbol: string; shares: number; averageCost: number; strategy: string; monthlyDca: number }) {
  const response = await fetch(`${API_BASE}/portfolio/holdings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Failed to save holding: ${response.status}`);
}

export async function deleteHolding(symbol: string) {
  const response = await fetch(`${API_BASE}/portfolio/holdings/${encodeURIComponent(symbol)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Failed to delete holding: ${response.status}`);
}

export async function saveDcaOrder(value: { symbol: string; amount: number; scheduledFor: string; strategy: string; shares?: number }) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Failed to save DCA order: ${response.status}`);
  return (await response.json()) as DcaOrder;
}

export async function updateDcaOrderAmount(orderId: number, amount: number, shares?: number) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, shares }) });
  if (!response.ok) throw new Error(`Failed to update DCA order: ${response.status}`);
  return (await response.json()) as DcaOrder;
}

export async function deleteDcaOrder(orderId: number) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders/${orderId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Failed to delete DCA order: ${response.status}`);
}

export async function loadStocks(params?: {
  strategy?: string;
  q?: string;
  page?: number;
  limit?: number;
  endpoint?: "stocks" | "dashboard";
}): Promise<PaginatedStocksResponse> {
  const endpoint = params?.endpoint ?? "stocks";
  const query = new URLSearchParams();
  if (params?.strategy) {
    query.set("strategy", params.strategy);
  }
  if (params?.q) {
    query.set("q", params.q);
  }
  if (typeof params?.page === "number") {
    query.set("page", String(params.page));
  }
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }

  const response = await fetch(`${API_BASE}/${endpoint}${query.toString() ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error(`Failed to load stocks: ${response.status}`);
  }

  return (await response.json()) as PaginatedStocksResponse;
}

export async function loadDiscoveries(params?: {
  q?: string;
  kind?: string;
  strategy?: string;
  mode?: string;
  sort?: string;
  region?: "all" | "us" | "th";
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<DiscoveryResponse> {
  const query = new URLSearchParams();
  if (params?.q) {
    query.set("q", params.q);
  }
  if (params?.kind) {
    query.set("kind", params.kind);
  }
  if (params?.strategy) query.set("strategy", params.strategy);
  if (params?.mode) query.set("mode", params.mode);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.region) query.set("region", params.region);
  if (typeof params?.page === "number") query.set("page", String(params.page));
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }

  const response = await fetch(`${API_BASE}/discover${query.toString() ? `?${query}` : ""}`, {
    signal: params?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load discovery data: ${response.status}`);
  }

  return (await response.json()) as DiscoveryResponse;
}

export async function loadSectorInsight(key: string): Promise<SectorInsightResponse> {
  const response = await fetch(`${API_BASE}/sectors/${encodeURIComponent(key)}`);
  if (!response.ok) {
    throw new Error(`Failed to load sector insight: ${response.status}`);
  }
  return (await response.json()) as SectorInsightResponse;
}

export async function loadIndustryInsight(key: string): Promise<IndustryInsightResponse> {
  const response = await fetch(`${API_BASE}/industries/${encodeURIComponent(key)}`);
  if (!response.ok) {
    throw new Error(`Failed to load industry insight: ${response.status}`);
  }
  return (await response.json()) as IndustryInsightResponse;
}

export async function loadLiveTradeScreener(params?: { preset?: LiveTradePreset; limit?: number }): Promise<LiveTradeScreenerResponse> {
  const query = new URLSearchParams();
  if (params?.preset) query.set("preset", params.preset);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const response = await fetch(`${API_BASE}/live-trade/screener${query.toString() ? `?${query}` : ""}`);
  if (!response.ok) throw new Error(`Failed to load live trade screener: ${response.status}`);
  return (await response.json()) as LiveTradeScreenerResponse;
}

export async function loadLiveTradeQuote(symbol: string): Promise<LiveTradeQuoteResponse> {
  const response = await fetch(`${API_BASE}/live-trade/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`Failed to load live trade quote: ${response.status}`);
  return (await response.json()) as LiveTradeQuoteResponse;
}
