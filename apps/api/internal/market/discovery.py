from __future__ import annotations

from typing import Any

from internal.store.cache import cache_get, cache_set
from internal.store.presets import list_market_presets
from internal.store.utils import as_float, percent_value, string_or_none
from internal.yahoo.client import fetch_quote_map
from models import DiscoveryKind, LookupItem, LookupResponse, LookupSection


def lookup_discovery(query: str, kind: DiscoveryKind, limit: int, ttl_seconds: int) -> LookupResponse:
    cache_key = f"{kind.value}:{limit}:{query.lower()}"
    cached = cache_get("lookup", cache_key)
    if isinstance(cached, dict):
        return LookupResponse.model_validate(cached)

    presets = list_market_presets(kind=None if kind is DiscoveryKind.all else kind.value)
    if not presets:
        result = LookupResponse(query=query, kind=kind)
        cache_set("lookup", cache_key, result.model_dump(), ttl_seconds)
        return result

    sections: list[LookupSection] = []
    combined: list[LookupItem] = []

    for preset in presets:
        quotes = fetch_quote_map(preset.symbols)
        if not quotes:
            continue

        items = [build_lookup_item(quote, preset.code, query) for quote in quotes.values()]
        items = [item for item in items if item.symbol and matches_lookup_query(item, query)]
        if not items:
            continue

        items = sort_lookup_items(items)
        section_items = items[:limit]
        sections.append(LookupSection(kind=preset.code, label=preset.label, count=len(items), items=section_items))
        combined.extend(section_items)

    combined = sort_lookup_items(combined)[: max(limit * len(sections), limit)]
    result = LookupResponse(query=query, kind=kind, count=len(combined), sections=sections, items=combined)
    cache_set("lookup", cache_key, result.model_dump(), ttl_seconds)
    return result


def build_lookup_item(quote: dict[str, Any], kind: str, query: str) -> LookupItem:
    symbol = str(quote.get("symbol") or quote.get("ticker") or "").upper()
    name = (
        quote.get("longname")
        or quote.get("longName")
        or quote.get("shortname")
        or quote.get("shortName")
        or quote.get("name")
        or quote.get("displayName")
        or symbol
    )

    return LookupItem(
        symbol=symbol,
        name=str(name),
        kind=kind,
        query=query,
        exchange=string_or_none(quote.get("exchange") or quote.get("fullExchangeName") or quote.get("exchDisp")),
        quoteType=string_or_none(quote.get("quoteType") or quote.get("typeDisp")),
        sector=string_or_none(quote.get("sector") or quote.get("sectorDisp")),
        industry=string_or_none(quote.get("industry") or quote.get("industryDisp")),
        currency=string_or_none(quote.get("currency") or quote.get("currencyCode")),
        price=as_float(quote.get("regularMarketPrice") or quote.get("price") or quote.get("lastPrice")),
        changePct=percent_value(quote.get("regularMarketChangePercent") or quote.get("changePercent") or quote.get("percentChange")),
        marketCap=as_float(quote.get("marketCap")),
    )


def matches_lookup_query(item: LookupItem, query: str) -> bool:
    term = query.strip().lower()
    if not term:
        return True

    haystack = " ".join(
        str(value or "") for value in (item.symbol, item.name, item.sector, item.industry, item.exchange, item.quoteType)
    ).lower()
    return term in haystack


def sort_lookup_items(items: list[LookupItem]) -> list[LookupItem]:
    return sorted(
        items,
        key=lambda item: (item.marketCap or 0.0, item.changePct or 0.0, item.price or 0.0, item.symbol),
        reverse=True,
    )
