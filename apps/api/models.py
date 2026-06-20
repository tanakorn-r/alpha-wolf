from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


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
    source: str = "snapshots"


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


class DcaOrder(DcaOrderInput):
    id: int
    executedPrice: float | None = None
    shares: float | None = None
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
