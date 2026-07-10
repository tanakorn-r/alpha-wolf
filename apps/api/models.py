from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DiscoveryKind(str, Enum):
    all = "all"
    stock = "stock"
    etf = "etf"
    index = "index"
    mutualfund = "mutualfund"
    currency = "currency"
    cryptocurrency = "cryptocurrency"
    future = "future"


class LookupItem(BaseModel):
    symbol: str = ""
    name: str = ""
    kind: str = ""
    query: str = ""
    exchange: str | None = None
    quoteType: str | None = None
    sector: str | None = None
    industry: str | None = None
    currency: str | None = None
    price: float | None = None
    changePct: float | None = None
    marketCap: float | None = None
    source: str = "lookup"


class LookupSection(BaseModel):
    kind: str = ""
    label: str = ""
    count: int = 0
    items: list[LookupItem] = Field(default_factory=list)


class LookupResponse(BaseModel):
    query: str = ""
    kind: DiscoveryKind = DiscoveryKind.all
    count: int = 0
    sections: list[LookupSection] = Field(default_factory=list)
    items: list[LookupItem] = Field(default_factory=list)


class DiscoverResponse(BaseModel):
    query: str = ""
    kind: DiscoveryKind = DiscoveryKind.all
    limit: int = 0
    page: int = 1
    total: int = 0
    totalPages: int = 1
    count: int = 0
    sections: list[LookupSection] = Field(default_factory=list)
    items: list[LookupItem] = Field(default_factory=list)
    live: list[dict[str, object]] = Field(default_factory=list)


class UniverseEntry(BaseModel):
    symbol: str
    name: str
    sector: str
    indexes: tuple[str, ...] = ()


class TickerPreset(BaseModel):
    code: str
    kind: str
    region: str
    label: str
    sortOrder: int = 0
    enabled: bool = True
    symbols: list[str] = Field(default_factory=list)
    source: str = "yfinance-screen-24h-cache"


class HoldingInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    shares: float = Field(gt=0)
    averageCost: float = Field(gt=0)
    strategy: str = "stable_dca"
    monthlyDca: float = Field(default=0, ge=0)


class Holding(HoldingInput):
    id: int
    createdAt: str


class DcaOrderInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    amount: float = Field(gt=0)
    scheduledFor: str
    strategy: str = "stable_dca"
    status: str = "planned"
    shares: float | None = Field(default=None, gt=0)


class DcaOrder(DcaOrderInput):
    id: int
    executedPrice: float | None = None
    createdAt: str


class PortfolioPoint(BaseModel):
    date: str
    value: float
    cost: float


class PortfolioMarker(BaseModel):
    date: str
    symbol: str
    amount: float


class IncomeEvent(BaseModel):
    date: str
    symbol: str
    kind: str
    amount: float | None = None


class MarketCalendarEvent(BaseModel):
    date: str
    symbol: str
    name: str
    kind: Literal["ex-dividend", "payment"]
    region: Literal["us", "th"]
    marketLabel: str
    isHolding: bool = False
    amount: float | None = None
    note: str | None = None


class MarketCalendarSummary(BaseModel):
    totalEvents: int = 0
    holdingEvents: int = 0
    usEvents: int = 0
    thEvents: int = 0
    paymentsTotal: float = 0


class MarketCalendarResponse(BaseModel):
    month: str
    region: Literal["all", "us", "th"] = "all"
    summary: MarketCalendarSummary = Field(default_factory=MarketCalendarSummary)
    events: list[MarketCalendarEvent] = Field(default_factory=list)


class PortfolioSummary(BaseModel):
    totalValue: float = 0
    invested: float = 0
    gainLoss: float = 0
    gainLossPct: float = 0
    dividendsYtd: float = 0
    forwardYield: float = 0


class PortfolioDashboard(BaseModel):
    summary: PortfolioSummary = Field(default_factory=PortfolioSummary)
    holdings: list[dict[str, object]] = Field(default_factory=list)
    dcaOrders: list[DcaOrder] = Field(default_factory=list)
    chart: list[PortfolioPoint] = Field(default_factory=list)
    markers: list[PortfolioMarker] = Field(default_factory=list)
    incomeEvents: list[IncomeEvent] = Field(default_factory=list)


class MarketSnapshot(BaseModel):
    market: str
    status: dict[str, object] = Field(default_factory=dict)
    summary: dict[str, object] = Field(default_factory=dict)


class MarketComparisonPoint(BaseModel):
    date: str
    stock: float
    benchmark: float
    peer: float


class MarketComparisonAsset(BaseModel):
    symbol: str
    name: str
    returnPct: float


class MarketComparison(BaseModel):
    stock: MarketComparisonAsset
    benchmark: MarketComparisonAsset
    peer: MarketComparisonAsset
    points: list[MarketComparisonPoint] = Field(default_factory=list)


class StockAnalysisScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Literal["Value", "Financial health", "Dividend safety", "Growth", "Timing"]
    score: int = Field(ge=0, le=100)
    why: str


class StockAnalysisTargetPrice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currentPrice: float | None = None
    targetPrice: float | None = None
    impliedUpsidePct: float | None = None
    timeHorizon: str
    basis: str


class StockAnalysisEntryPrice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currentPrice: float | None = None
    entryPrice: float | None = None
    distanceFromCurrentPct: float | None = None
    why: str


class StockAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: str
    headline: str
    tone: Literal["good", "warn", "bad"]
    confidence: int = Field(ge=0, le=100)
    summary: str
    targetPrice: StockAnalysisTargetPrice
    entryPrice: StockAnalysisEntryPrice
    scores: list[StockAnalysisScore] = Field(min_length=5, max_length=5)
    bullets: list[str] = Field(min_length=2, max_length=4)
    dcaTiming: str
    recap: str
    agentFit: Literal["aligned", "neutral", "against"]
    agentFitReason: str


class AgentBadge(BaseModel):
    id: str
    name: str
    mono: str
    title: str
    color: str
    avatarUrl: str | None = None
    premium: bool = False


class StockAnalysisResponse(StockAnalysis):
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None
    recap: str | None = None
    agentFit: Literal["aligned", "neutral", "against"] | None = None
    agentFitReason: str | None = None


class StrategyPick(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    name: str
    action: str
    tone: Literal["good", "warn", "bad"]
    subtitle: str
    reason: str
    entry: float | None = None
    target: float | None = None
    stop: float | None = None
    riskReward: str | None = None
    upsidePct: float | None = None
    conviction: int = Field(ge=0, le=100)


class StrategyPlaybook(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: str
    headline: str
    marketRead: str
    picks: list[StrategyPick] = Field(min_length=1, max_length=5)
    recap: str
    agentFit: Literal["aligned", "neutral", "against"]
    agentFitReason: str


class StrategyPlaybookResponse(StrategyPlaybook):
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None
    recap: str | None = None
    agentFit: Literal["aligned", "neutral", "against"] | None = None
    agentFitReason: str | None = None


class StrategyRecommendationRequest(BaseModel):
    strategy: str = Field(min_length=1, max_length=500)
    region: Literal["all", "us", "th"] = "all"
    limit: int = Field(default=5, ge=1, le=5)
    candidateLimit: int = Field(default=40, ge=5, le=50)


class QuantCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: str
    status: Literal["good", "warn", "bad"]
    insight: str


class QuantPerspective(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: str
    tone: Literal["good", "warn", "bad"]
    buyScore: int = Field(ge=1, le=100)
    investability: Literal["FAVORABLE", "WATCH", "AVOID"]
    hook: str
    nextActionWindow: str
    buyPlan: str
    summary: str
    setup: str
    trigger: str
    risk: str
    checks: list[QuantCheck] = Field(min_length=4, max_length=6)
    tradingViewFocus: list[str] = Field(min_length=2, max_length=4)
    recap: str
    agentFit: Literal["aligned", "neutral", "against"]
    agentFitReason: str


class QuantPerspectiveResponse(QuantPerspective):
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None
    recap: str | None = None
    agentFit: Literal["aligned", "neutral", "against"] | None = None
    agentFitReason: str | None = None


class ValuationRightNow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["BUY", "WAIT", "TRIM", "AVOID"]
    note: str
    entryOnlyAt: float | None = None
    pctAway: float | None = None
    conviction: int = Field(ge=0, le=100)


class ValuationMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currentPrice: float | None = None
    ytdPct: float | None = None
    bookValuePerShare: float | None = None
    pbv: float | None = None
    pbvFloor: float | None = None
    dividendYield: float | None = None


class ValuationStructureBand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    discountAnchor: float | None = None
    fairAnchor: float | None = None
    now: float | None = None
    zoneLabel: str


class ValuationPlay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    addBackLow: float | None = None
    addBackHigh: float | None = None


class ValuationVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    name: str
    currency: str
    verdict: Literal["CHASING", "FAIR", "DISCOUNT", "INSUFFICIENT_DATA"]
    chasingAnswer: str
    narrative: str
    rightNow: ValuationRightNow
    metrics: ValuationMetrics
    structureBand: ValuationStructureBand
    whatAiSees: list[str] = Field(min_length=2, max_length=5)
    thePlay: ValuationPlay
    recap: str
    agentFit: Literal["aligned", "neutral", "against"]
    agentFitReason: str


class ValuationVerdictResponse(ValuationVerdict):
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None
    recap: str | None = None
    agentFit: Literal["aligned", "neutral", "against"] | None = None
    agentFitReason: str | None = None


class TodayPerformance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: str
    tone: Literal["good", "warn", "bad"]
    buyScore: int = Field(ge=1, le=100)
    headline: str
    summary: str
    sessionRead: str
    whatChangedToday: str
    keyLevel: str
    action: str
    risk: str


class TodayPerformanceResponse(TodayPerformance):
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None


class AgentStyle(BaseModel):
    Discipline: int = Field(ge=0, le=100)
    Patience: int = Field(ge=0, le=100)
    Data: int = Field(ge=0, le=100)
    Instinct: int = Field(ge=0, le=100)


class AgentProfile(AgentBadge):
    avatarUrl: str | None = None
    premium: bool = False
    tagline: str
    years: int
    bio: str
    belief: str
    knows: list[str]
    style: AgentStyle


class PortfolioReviewSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    h: str
    b: str


class PortfolioReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=0, le=100)
    verdict: str
    intro: str
    sections: list[PortfolioReviewSection] = Field(min_length=1, max_length=4)
    bullets: list[str] = Field(min_length=2, max_length=4)
    sign: str


class PortfolioReviewResponse(PortfolioReview):
    source: Literal["openai"]
    model: str
    agent: AgentBadge
    generatedAt: str | None = None


class BuyTimingNarrative(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str
    summary: str
    action: Literal["BUY", "WAIT", "TRIM", "AVOID"]
    recap: str
    agentFit: Literal["aligned", "neutral", "against"]
    agentFitReason: str


class PredictedTechnicalMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str
    movePct: float
    direction: Literal["UP", "DOWN", "FLAT"]
    phase: Literal["impulse", "pullback", "base", "breakout", "rejection", "retest", "continuation", "mean_reversion", "distribution", "accumulation"]
    confidence: int = Field(ge=1, le=100)
    reason: str


class HistoricalTechnicalMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str
    fromPrice: float | None = None
    toPrice: float | None = None
    movePct: float
    direction: Literal["UP", "DOWN", "FLAT"]
    confidence: int = Field(ge=0, le=100)
    reason: str | None = None


class TechnicalHistoryPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str
    close: float


class TechnicalMovesPrediction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    timeframe: Literal["1D", "1W"]
    currentPrice: float
    pathBias: Literal["BULLISH_CONTINUATION", "PULLBACK_THEN_BOUNCE", "RESISTANCE_REJECTION", "SIDEWAYS_COMPRESSION", "BREAKDOWN_RISK", "VOLATILE_RANGE"]
    directionChanges: int = Field(ge=0, le=3)
    headline: str
    thesis: str
    risk: str
    sampleSize: int = Field(ge=0)
    averageMovePct: float
    moves: list[PredictedTechnicalMove] = Field(min_length=10, max_length=10)


class TechnicalMovesPredictionResponse(TechnicalMovesPrediction):
    history: list[TechnicalHistoryPoint] = Field(default_factory=list)
    historicalMoves: list[HistoricalTechnicalMove] = Field(default_factory=list)
    source: Literal["openai"]
    model: str
    agent: AgentBadge | None = None
    generatedAt: str | None = None


class MarketUniverseCache(BaseModel):
    region: str
    records: list[dict[str, object]] = Field(default_factory=list)
    fetchedAt: str
    expiresAt: str


class MarketCatalogStatus(BaseModel):
    source: str = "yfinance-screen"
    cacheHit: bool
    ttlSeconds: int
    counts: dict[str, int] = Field(default_factory=dict)
    fetchedAt: dict[str, str] = Field(default_factory=dict)
    expiresAt: dict[str, str] = Field(default_factory=dict)
