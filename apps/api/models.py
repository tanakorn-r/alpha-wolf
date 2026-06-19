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
