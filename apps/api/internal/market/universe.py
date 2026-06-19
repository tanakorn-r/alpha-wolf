from __future__ import annotations

import math
from typing import Any

from internal.store.cache import cache_get, cache_set
from internal.store.db import count_snapshots, load_snapshot_records
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
        for record in load_snapshot_records()
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

    records = load_snapshot_records()
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


def build_market_page(*, page: int, limit: int) -> tuple[list[dict[str, Any]], int, int]:
    offset = (max(page, 1) - 1) * max(limit, 1)
    page_items = load_snapshot_records(limit=limit, offset=offset)
    total = count_snapshots()
    total_pages = max(1, math.ceil(total / max(limit, 1)))
    return page_items, total_pages, total
