import type { StockRecord } from "../data/market";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type AuthUser = {
  id: number;
  googleSub: string;
  email: string;
  name: string;
  pictureUrl?: string | null;
  createdAt: string;
  premiumRedeemedAt?: string | null;
  premiumExpiresAt?: string | null;
  proActive?: boolean;
  plan?: "free" | "pro";
  aiUsage?: { period: string; used: number; limit: number; remaining: number };
};

export async function loadAuthUser(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to restore account: ${response.status}`);
  const payload = (await response.json()) as { user?: AuthUser | null };
  return payload.user ?? null;
}

export async function loadPremiumPromoActive(): Promise<boolean> {
  const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (!response.ok) return true;
  const payload = (await response.json()) as { premiumPromoActive?: boolean };
  return payload.premiumPromoActive ?? true;
}

export async function redeemPremiumPromo(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE}/auth/redeem-premium`, { method: "POST", credentials: "include" });
  if (!response.ok) {
    let message = `Could not redeem Pro (${response.status})`;
    try { message = ((await response.json()) as { detail?: string }).detail ?? message; } catch { /* HTTP fallback */ }
    throw new Error(message);
  }
  const payload = (await response.json()) as { user: AuthUser | null };
  return payload.user;
}

export async function loadGoogleAuthBootstrap(): Promise<{ configured: boolean; clientId?: string | null; nonce?: string | null }> {
  const response = await fetch(`${API_BASE}/auth/google/bootstrap`, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to initialize Google sign-in: ${response.status}`);
  return (await response.json()) as { configured: boolean; clientId?: string | null; nonce?: string | null };
}

export async function connectGoogleAccount({ credential, nonce }: { credential: string; nonce: string }): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, nonce }),
  });
  if (!response.ok) throw new Error(`Google sign-in failed: ${response.status}`);
  const payload = (await response.json()) as { user: AuthUser };
  return payload.user;
}

export async function disconnectAccount(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error(`Sign-out failed: ${response.status}`);
}

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
  stochasticK?: number;
  stochasticD?: number;
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
  multiTimeframe?: { returns: Record<string, number | null>; alignment: "BULLISH" | "BEARISH" | "MIXED"; note: string };
  dowTheory?: { trend: string; higherHigh: boolean; higherLow: boolean; lowerHigh: boolean; lowerLow: boolean; confirmation: string };
  wyckoff?: { phase: string; rangePositionPct?: number | null; volumeRatio?: number | null; note: string };
  elliottWave?: { bias: string; confidence: "LOW" | "MEDIUM"; note: string };
  fibonacci?: {
    direction: string;
    swingLow?: number | null;
    swingHigh?: number | null;
    retracements: Record<string, number>;
    extensions: Record<string, number>;
    note: string;
  };
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
  // True on a fresh cache miss: the backend fetches yfinance data in the background and
  // returns immediately rather than blocking, so every numeric field below is a zero/empty
  // placeholder until the next request after the refresh lands — never format these as real.
  dataPending?: boolean;
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
    totalCash?: number;
    totalDebt?: number;
    bookValuePerShare?: number;
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

export type StockAnalysisScore = { label: string; score: number | null; why: string };

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
  confidence: number | null;
  summary: string;
  longTermView: {
    structureScore: number;
    outlookRating: "STRONG" | "FAVORABLE" | "NO_EDGE" | "AVOID";
    perspectiveSections: Array<{
      title: string;
      rating: "STRENGTH" | "POSITIVE" | "WATCH" | "RISK" | "UNPROVEN";
      body: string;
      evidence: string[];
    }>;
    outlookHorizon: string;
    outlookTitle: string;
    agentOutlook: string;
    actionPlan: string;
    allocationPlan: {
      tier: "FULL" | "BUILD" | "STARTER" | "OBSERVE" | "AVOID";
      plannedPositionPct: number;
      label: string;
      rationale: string;
      scaleUpTrigger: string;
      cutTrigger: string;
    };
    keySignals: string[];
    thesisBreakers: string[];
  };
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

export type AnalystBriefResponse = {
  signal: string;
  headline: string;
  tone: "good" | "warn" | "bad";
  confidence: number | null;
  summary: string;
  thesis: string;
  actionPlan: string;
  evidence: string[];
  risks: string[];
  changeTrigger: string;
  recap: string;
  agentFit: "aligned" | "neutral" | "against";
  agentFitReason: string;
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
};

export type AnalystReportResponse = {
  status: "ready";
  detail: StockDetailResponse;
  analysis: AnalystBriefResponse;
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
  analystFocus?: string | null;
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
    peRatio?: number | null;
    forwardPE?: number | null;
    dividendYield?: number | null;
  };
  structureBand: {
    discountAnchor?: number | null;
    fairAnchor?: number | null;
    now?: number | null;
    zoneLabel: string;
  };
  whatAiSees: Array<{ tone: "GOOD" | "WATCH" | "BAD"; title: string; text: string }>;
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
  holdingAction: "HOLD" | "NO_ACTION" | "ADD_SMALL" | "ADD" | "REDUCE" | "SELL";
  holdingActionReason: string;
  todayRead: string;
  horizonAlignment: {
    status: "ALIGNED" | "WATCH" | "BROKEN" | "NO_PLAN";
    planHorizon: string;
    structureRead: string;
    why: string;
  };
  evidence: string[];
  continueGate: string;
  exitGate: string;
  nextCheck: string;
  risk: string;
  recap: string;
  agentFit: "aligned" | "neutral" | "against";
  agentFitReason: string;
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
};

export type TechnicalAnalysisResponse = {
  symbol: string;
  signal: "BUY" | "HOLD" | "WAIT" | "TRIM" | "SELL";
  tone: "good" | "warn" | "bad";
  confidence: number;
  headline: string;
  summary: string;
  structureContext: string;
  frameworks: Array<{
    framework: "DOW" | "WYCKOFF" | "ELLIOTT" | "FIBONACCI" | "MULTI_TIMEFRAME";
    weight: "PRIMARY" | "CONFIRMATION" | "LOW_WEIGHT";
    stance: "GOOD" | "MIXED" | "BAD";
    verdict: string;
    evidence: string;
  }>;
  action: string;
  invalidations: [string, string];
  source?: "openai";
  model?: string;
  agent?: AgentBadge | null;
  generatedAt?: string | null;
};

export type BacktradeDecision = {
  date: string;
  action: "BUY" | "HOLD" | "TRIM" | "SELL";
  buyCashPct: number;
  trimPositionPct: number;
  conviction: number;
  signalRead: string;
  timingRead: string;
  analystRead: string;
  decisionBasis: "SIGNAL" | "BUY_TIMING" | "ANALYST" | "BLENDED";
  reason: string;
  invalidation: string;
  source: "ai" | "calculated_fallback";
  evidenceFocus?: string;
  close: number;
  cashBefore: number;
  sharesBefore: number;
  executedPrice?: number | null;
  executedValue: number;
};

export type BacktradeResult = {
  symbol: string;
  agent: AgentBadge;
  mode: "monthly" | "event" | "weekly";
  sessions: number;
  decisionCount: number;
  aiDecisionCount: number;
  fallbackDecisionCount: number;
  totalContributed: number;
  endingValue: number;
  dcaEndingValue: number;
  returnPct: number;
  dcaReturnPct: number;
  maxDrawdownPct: number;
  dcaMaxDrawdownPct: number;
  endingCash: number;
  endingShares: number;
  agentDividendsReceived: number;
  dcaDividendsReinvested: number;
  equity: Array<{ date: string; price: number; agent: number; dca: number; contributed: number; cash: number; invested: number; shares: number; stockExposurePct: number }>;
  decisions: BacktradeDecision[];
  limitations: string[];
};

export type BacktradeJob = {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  stage: string;
  symbol: string;
  agent: AgentBadge;
  createdAt: string;
  config: { years: number; monthlyContribution: number; mode: "monthly" | "event" | "weekly" };
  result?: BacktradeResult | null;
  error?: string | null;
};

export async function startBacktrade(payload: { symbol: string; agent: string; years: number; monthlyContribution: number; mode: "monthly" | "event" | "weekly" }): Promise<BacktradeJob> {
  const response = await fetch(`${API_BASE}/backtrade/jobs`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(await backtradeApiError(response, `Could not start replay (${response.status})`));
  return (await response.json()) as BacktradeJob;
}

export async function loadBacktradeJob(jobId: string): Promise<BacktradeJob> {
  const response = await fetch(`${API_BASE}/backtrade/jobs/${encodeURIComponent(jobId)}`, { credentials: "include" });
  if (!response.ok) throw new Error(await backtradeApiError(response, `Could not load replay (${response.status})`));
  return (await response.json()) as BacktradeJob;
}

async function backtradeApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail || fallback;
  } catch {
    return fallback;
  }
}

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

export type TickerPreset = {
  code: string;
  kind: string;
  region: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  symbols: string[];
  source: string;
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

export async function loadUpwardMoves(symbol: string, timeframe: "1D" | "1W", agent?: string, force = false): Promise<UpwardMovesResponse> {
  const query = new URLSearchParams({ timeframe });
  if (agent) query.set("agent", agent);
  if (force) query.set("force", "true");
  const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/upward-moves?${query}`, { credentials: "include" });
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
  const response = await fetch(`${API_BASE}/calendar${query.toString() ? `?${query}` : ""}`, { credentials: "include" });
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
  perspectiveScore?: number | null;
  perspectiveReason?: string | null;
  todayInstruction?: string | null;
  nextMove?: string | null;
  nextMoveTiming?: string | null;
  buyCondition?: string | null;
  reduceCondition?: string | null;
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
  businessStructure?: { status: "INTACT" | "MIXED" | "AT_RISK" | "UNPROVEN"; roe?: number | null; profitMargin?: number | null; revenueGrowth?: number | null; debtToEquity?: number | null; reasons: string[] };
  timeline?: {
    start?: string | null;
    end?: string | null;
    todayPct?: number | null;
    nextExPct?: number | null;
    buyZone: { startPct?: number | null; endPct?: number | null; start?: string | null; end?: string | null; label?: string | null };
    trimZone: { startPct?: number | null; endPct?: number | null; start?: string | null; end?: string | null; label?: string | null };
  } | null;
  seasonality: Array<{ month: string; returnPct: number }>;
  comparisonYear?: number;
  cheapestMonth?: string | null;
  peakMonth?: string | null;
  monthlyMap?: Array<{ month: string; score: number; action: "BUY" | "TRIM" | "HOLD"; returnPct: number; currentYearReturnPct?: number | null; isExMonth: boolean; isCurrent: boolean; note: string }>;
  agentMonthlyPlan?: Array<{ month: string; score: number; action: "BUY" | "ADD_SMALL" | "HOLD" | "TRIM" | "SELL"; buyBudgetPct: number; trimPositionPct: number; calculatedAction: "BUY" | "TRIM" | "HOLD"; returnPct: number; currentYearReturnPct?: number | null; isExMonth: boolean; isCurrent: boolean; note: string; reason: string }> | null;
  monthlyHistory?: Array<{ date: string; month: string; close: number }>;
  backtest?: { years: number; observedMonths: number; investedMonths: number; skippedMonths: number; monthlyContribution: number; totalContributed: number; endingValue: number; endingCash: number; endingStockValue: number; profitLoss: number; alwaysBuyEndingValue: number; strategyReturnPct: number; alwaysBuyReturnPct: number; strategyMoneyWeightedReturnPct?: number | null; alwaysBuyMoneyWeightedReturnPct?: number | null; exposureNormalizedReturnPct?: number | null; matchedExposureBenchmarkReturnPct?: number | null; strategyReturnWithoutDividendsPct: number; alwaysBuyReturnWithoutDividendsPct: number; strategyDividendReturnBoostPct: number; alwaysBuyDividendReturnBoostPct: number; edgePct: number; strategyMaxDrawdownPct: number; alwaysBuyMaxDrawdownPct: number; averageStockExposurePct: number; agentDividendsReceived: number; alwaysBuyDividendsReinvested: number; method: string; inSample: boolean; ledger: Array<{ date: string; month: string; action: string; buyBudgetPct: number; trimPositionPct: number; dividendIncome: number; contributed: number; cash: number; stockValue: number; accountValue: number; profitLoss: number }> } | null;
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

export async function loadBuyTiming(symbol: string, agent?: string, force = false): Promise<BuyTimingResponse> {
  const query = new URLSearchParams();
  if (agent) query.set("agent", agent);
  if (force) query.set("force", "true");
  const suffix = query.size ? `?${query}` : "";
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const response = await fetch(`${API_BASE}/details/${encodeURIComponent(symbol)}/buy-timing${suffix}`, { credentials: "include" });
    if (response.status === 202) {
      const pending = (await response.json()) as { retryAfterSeconds?: number };
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(1, pending.retryAfterSeconds ?? 3) * 1_000));
      continue;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(payload?.detail || `Failed to load buy timing: ${response.status}`);
    }
    return (await response.json()) as BuyTimingResponse;
  }
  throw new Error("Buy Timing market data did not become ready within one minute.");
}

export async function summarizeStock(symbol: string, strategy?: string, agent?: string, force = false): Promise<StockAnalysisResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}${query}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    let detail = `Failed to summarize stock: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the HTTP status fallback for non-JSON errors.
    }
    throw new Error(detail);
  }

  return (await response.json()) as StockAnalysisResponse;
}

export async function loadAnalystReport(
  symbol: string,
  strategy: string,
  agent: string,
  force = false,
  onStage?: (stage: "market_data" | "analysis") => void,
): Promise<AnalystReportResponse> {
  const startedAt = Date.now();
  const deadlineMs = 60_000;
  let firstRequest = true;

  while (Date.now() - startedAt < deadlineMs) {
    onStage?.(firstRequest ? "market_data" : "analysis");
    const analysisStageTimer = window.setTimeout(() => onStage?.("analysis"), 1_000);
    const params = new URLSearchParams({ agent });
    if (force) params.set("force", "true");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/report?${params}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Stock Analyst timed out. Please retry.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      window.clearTimeout(analysisStageTimer);
    }

    if (response.status === 202) {
      firstRequest = false;
      onStage?.("market_data");
      const pending = (await response.json()) as { retryAfterSeconds?: number };
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(1, pending.retryAfterSeconds ?? 3) * 1_000));
      continue;
    }
    if (!response.ok) {
      let message = `Stock Analyst failed: ${response.status}`;
      try { message = ((await response.json()) as { detail?: string }).detail ?? message; } catch { /* HTTP fallback */ }
      throw new Error(message);
    }
    onStage?.("analysis");
    return (await response.json()) as AnalystReportResponse;
  }

  throw new Error("Market data did not become ready within one minute. Please retry.");
}

export async function loadQuantPerspective(symbol: string, strategy?: string, mode?: string, agent?: string, force = false): Promise<QuantPerspectiveResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/quant${query}`, {
    method: "POST",
    credentials: "include",
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

export async function loadValuationVerdict(symbol: string, strategy?: string, agent?: string, force = false): Promise<ValuationVerdictResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/valuation${query}`, {
    method: "POST",
    credentials: "include",
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

export async function loadTodayPerformance(symbol: string, strategy?: string, agent?: string, force = false): Promise<TodayPerformanceResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/today${query}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    let detail = `Failed to load Daily Brief AI: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the HTTP status fallback for non-JSON responses.
    }
    throw new Error(detail);
  }

  return (await response.json()) as TodayPerformanceResponse;
}

export async function loadTechnicalAnalysis(symbol: string, agent?: string, force = false): Promise<TechnicalAnalysisResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const response = await fetch(`${API_BASE}/analysis/${encodeURIComponent(symbol)}/technical?${params}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    let detail = `Failed to load Technical Analysis: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch { /* keep status fallback */ }
    throw new Error(detail);
  }
  return (await response.json()) as TechnicalAnalysisResponse;
}

export async function loadStrategyPlaybook(params: { strategy: string; region?: "all" | "us" | "th"; limit?: number; candidateLimit?: number; agent?: string; force?: boolean }): Promise<StrategyPlaybookResponse> {
  const queryParams = new URLSearchParams();
  if (params.agent) queryParams.set("agent", params.agent);
  if (params.force) queryParams.set("force", "true");
  const query = queryParams.size ? `?${queryParams}` : "";
  const response = await fetch(`${API_BASE}/strategy/recommendations${query}`, {
    method: "POST",
    credentials: "include",
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

export async function loadPortfolioReview(agent?: string, force = false): Promise<PortfolioReviewResponse> {
  const params = new URLSearchParams();
  if (agent) params.set("agent", agent);
  if (force) params.set("force", "true");
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_BASE}/analysis/portfolio/review${query}`, { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load portfolio review: ${response.status}`);
  return (await response.json()) as PortfolioReviewResponse;
}

export async function loadPortfolio(): Promise<PortfolioDashboard> {
  const response = await fetch(`${API_BASE}/portfolio`, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load portfolio: ${response.status}`);
  return (await response.json()) as PortfolioDashboard;
}

export async function loadPortfolioWatchlist(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/portfolio/watchlist`, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load watchlist: ${response.status}`);
  const payload = (await response.json()) as { symbols?: string[] };
  return payload.symbols ?? [];
}

export async function addPortfolioWatchlistSymbols(symbols: string[]): Promise<string[]> {
  const response = await fetch(`${API_BASE}/portfolio/watchlist`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
  if (!response.ok) throw new Error(`Failed to save watchlist: ${response.status}`);
  const payload = (await response.json()) as { symbols?: string[] };
  return payload.symbols ?? [];
}

export async function deletePortfolioWatchlistSymbol(symbol: string): Promise<void> {
  const response = await fetch(`${API_BASE}/portfolio/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error(`Failed to remove watchlist symbol: ${response.status}`);
}

export async function saveHolding(value: { symbol: string; shares: number; averageCost: number; strategy: string; monthlyDca: number }) {
  const response = await fetch(`${API_BASE}/portfolio/holdings`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Failed to save holding: ${response.status}`);
}

export async function deleteHolding(symbol: string) {
  const response = await fetch(`${API_BASE}/portfolio/holdings/${encodeURIComponent(symbol)}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error(`Failed to delete holding: ${response.status}`);
}

export async function saveDcaOrder(value: { symbol: string; amount: number; scheduledFor: string; strategy: string; shares?: number }) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Failed to save DCA order: ${response.status}`);
  return (await response.json()) as DcaOrder;
}

export async function updateDcaOrderAmount(orderId: number, amount: number, shares?: number) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders/${orderId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, shares }) });
  if (!response.ok) throw new Error(`Failed to update DCA order: ${response.status}`);
  return (await response.json()) as DcaOrder;
}

export async function deleteDcaOrder(orderId: number) {
  const response = await fetch(`${API_BASE}/portfolio/dca-orders/${orderId}`, { method: "DELETE", credentials: "include" });
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
  sector?: string;
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
  if (params?.sector && params.sector !== "all") query.set("sector", params.sector);
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

export async function loadTickerPresets(params?: { kind?: string; region?: string }): Promise<TickerPreset[]> {
  const query = new URLSearchParams();
  if (params?.kind) query.set("kind", params.kind);
  if (params?.region) query.set("region", params.region);
  const response = await fetch(`${API_BASE}/presets${query.toString() ? `?${query}` : ""}`);
  if (!response.ok) throw new Error(`Failed to load ticker presets: ${response.status}`);
  return (await response.json()) as TickerPreset[];
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
