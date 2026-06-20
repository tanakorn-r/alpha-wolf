from __future__ import annotations

from typing import Any

from internal.store.cache import cache_get, cache_set
from internal.store.presets import list_market_presets
from internal.market.universe import get_live_records
from internal.store.utils import as_float, string_or_none
from models import DiscoveryKind, LookupItem, LookupResponse, LookupSection


def lookup_discovery(query: str, kind: DiscoveryKind, limit: int, ttl_seconds: int, region: str | None = None) -> LookupResponse:
    cache_key = f"{kind.value}:{region or 'all'}:{limit}:{query.lower()}"
    cached = cache_get("lookup", cache_key)
    if isinstance(cached, dict):
        return LookupResponse.model_validate(cached)

    presets = list_market_presets(kind=None if kind is DiscoveryKind.all else kind.value, region=region)
    records = {str(record.get("symbol") or "").upper(): record for record in get_live_records()}
    if not presets or not records:
        result = LookupResponse(query=query, kind=kind)
        cache_set("lookup", cache_key, result.model_dump(), ttl_seconds)
        return result

    sections: list[LookupSection] = []
    combined: list[LookupItem] = []

    for preset in presets:
        items = []
        for symbol in preset.symbols:
            record = records.get(str(symbol).upper())
            if not record:
                continue
            item = build_lookup_item(record, preset.code, query)
            if item.symbol and matches_lookup_query(item, query):
                items.append(item)

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


def build_lookup_item(record: dict[str, Any], kind: str, query: str) -> LookupItem:
    symbol = str(record.get("symbol") or "").upper()
    name = str(record.get("name") or record.get("shortName") or record.get("longName") or symbol)

    return LookupItem(
        symbol=symbol,
        name=name,
        kind=kind,
        query=query,
        exchange=string_or_none(record.get("exchange") or record.get("fullExchangeName") or record.get("exchangeDisp")),
        quoteType=string_or_none(record.get("quoteType") or record.get("typeDisp")),
        sector=string_or_none(record.get("sector") or record.get("sectorDisp")),
        industry=string_or_none(record.get("industry") or record.get("industryDisp")),
        currency=string_or_none(record.get("currency") or record.get("currencyCode")),
        price=as_float(record.get("price") or record.get("regularMarketPrice") or record.get("currentPrice")),
        changePct=as_float(record.get("changePct") or record.get("regularMarketChangePercent") or record.get("changePercent")),
        marketCap=as_float(record.get("marketCap")),
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
