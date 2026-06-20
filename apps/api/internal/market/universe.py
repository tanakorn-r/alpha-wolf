from __future__ import annotations

import math
from typing import Any

from internal.store.cache import cache_get, cache_set
from internal.market.catalog import get_market_catalog
from models import UniverseEntry

LIVE_RECORDS_TTL_SECONDS = 60
EMPTY_TTL_SECONDS = 15


def get_live_universe_entries() -> list[UniverseEntry]:
    cached = cache_get("live_universe", "all")
    if cached is not None:
        return cached

    entries = [
        UniverseEntry(
            symbol=str(record.get("symbol") or "").upper(),
            name=str(record.get("name") or record.get("shortName") or record.get("longName") or record.get("symbol") or ""),
            sector=str(record.get("sector") or "Unknown"),
            indexes=tuple(sorted(str(index) for index in record.get("indexes", []) if str(index).strip())),
        )
        for record in get_market_catalog()
        if str(record.get("symbol") or "").strip()
    ]

    if entries:
        cache_set("live_universe", "all", entries, LIVE_RECORDS_TTL_SECONDS)
        return entries

    cache_set("live_universe", "all", [], EMPTY_TTL_SECONDS)
    return []


def get_live_records() -> list[dict[str, Any]]:
    cached = cache_get("live_records", "all")
    if cached is not None:
        return cached

    records = get_market_catalog()
    if records:
        cache_set("live_records", "all", records, LIVE_RECORDS_TTL_SECONDS)
        return records

    cache_set("live_records", "all", [], EMPTY_TTL_SECONDS)
    return []


def paginate_records(records: list[dict[str, Any]], page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    total_pages = max(1, math.ceil(len(records) / max(limit, 1)))
    safe_page = min(max(page, 1), total_pages)
    start = (safe_page - 1) * limit
    end = start + limit
    return records[start:end], total_pages


def build_market_page(*, page: int, limit: int, strategy: str | None = None, region: str = "all", query: str = "") -> tuple[list[dict[str, Any]], int, int]:
    records = get_market_catalog()
    if region in {"us", "th"}:
        records = [record for record in records if region in record.get("indexes", [])]
    term = query.strip().lower()
    if term:
        records = [record for record in records if term in str(record.get("symbol") or "").lower() or term in str(record.get("name") or "").lower()]
    if strategy:
        records = sorted(records, key=lambda record: (record.get("strategyScores", {}).get(strategy, 0), record.get("marketCap") or 0), reverse=True)
    page_items, total_pages = paginate_records(records, page, limit)
    return page_items, total_pages, len(records)
