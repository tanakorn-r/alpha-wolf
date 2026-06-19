from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from internal.market.records import fetch_record
from internal.store.cache import cache_get, cache_set
from internal.store.db import store_records
from internal.store.presets import list_market_presets
from internal.store.utils import slugify_index
from internal.yahoo.client import fetch_quote_map
from models import UniverseEntry

LIVE_RECORDS_TTL_SECONDS = 60
LIVE_UNIVERSE_TTL_SECONDS = 300
EMPTY_TTL_SECONDS = 15


def get_live_universe_entries() -> list[UniverseEntry]:
    cached = cache_get("live_universe", "all")
    if cached is not None:
        return cached

    presets = list_market_presets(kind="stock")
    entries: dict[str, dict[str, Any]] = {}

    # Presets used to be fetched one at a time, each one a blocking
    # yfinance round-trip; with two presets (US/TH) that doubled cold-start
    # latency for no reason since they're independent of each other.
    with ThreadPoolExecutor(max_workers=max(len(presets), 1)) as pool:
        futures = {pool.submit(fetch_quote_map, preset.symbols): preset for preset in presets}
        for future in as_completed(futures):
            preset = futures[future]
            try:
                quotes = future.result()
            except Exception:
                continue
            if not quotes:
                continue
            merge_preset_quotes(entries, preset, quotes)

    ordered: list[UniverseEntry] = []
    for symbol, data in entries.items():
        ordered.append(
            UniverseEntry(
                symbol=symbol,
                name=str(data["name"]),
                sector=str(data["sector"]),
                indexes=tuple(sorted(str(index) for index in data["indexes"])),
            )
        )

    if ordered:
        cache_set("live_universe", "all", ordered, LIVE_UNIVERSE_TTL_SECONDS)
        return ordered

    cache_set("live_universe", "all", [], EMPTY_TTL_SECONDS)
    return []


def merge_preset_quotes(entries: dict[str, dict[str, Any]], preset: Any, quotes: dict[str, dict[str, Any]]) -> None:
    for symbol, quote in quotes.items():
        symbol = str(symbol).upper().strip()
        if not symbol:
            continue

        name = (
            quote.get("shortName")
            or quote.get("longName")
            or quote.get("name")
            or quote.get("displayName")
            or symbol
        )
        sector = quote.get("sector") or quote.get("sectorDisp") or quote.get("industry") or "Unknown"
        indexes = {preset.kind, preset.region, preset.code, slugify_index(sector)}
        if str(quote.get("quoteType") or "").upper() == "ETF":
            indexes.add("etf")

        current = entries.get(symbol)
        if current:
            current["indexes"].update(indexes)
            if current["sector"] == "Unknown" and sector != "Unknown":
                current["sector"] = sector
            if current["name"] == symbol and name != symbol:
                current["name"] = name
        else:
            entries[symbol] = {"symbol": symbol, "name": name, "sector": sector, "indexes": set(indexes)}


def refresh_entries(entries: tuple[UniverseEntry, ...] | list[UniverseEntry]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(8, max(len(entries), 1))) as pool:
        futures = {pool.submit(fetch_record, entry): entry for entry in entries}
        for future in as_completed(futures):
            try:
                record = future.result()
            except Exception:
                continue
            if record:
                results.append(record)

    # Persisted once, outside the worker pool, instead of one sqlite
    # connection+commit per ticker racing across up to 8 threads.
    store_records(results)
    return results


def get_live_records() -> list[dict[str, Any]]:
    cached = cache_get("live_records", "all")
    if cached is not None:
        return cached

    ordered = refresh_entries(get_live_universe_entries())
    if ordered:
        cache_set("live_records", "all", ordered, LIVE_RECORDS_TTL_SECONDS)
        return ordered

    cache_set("live_records", "all", [], EMPTY_TTL_SECONDS)
    return []


def paginate_records(records: list[dict[str, Any]], page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    total_pages = max(1, math.ceil(len(records) / max(limit, 1)))
    safe_page = min(max(page, 1), total_pages)
    start = (safe_page - 1) * limit
    end = start + limit
    return records[start:end], total_pages


def build_market_page(*, page: int, limit: int) -> tuple[list[dict[str, Any]], int, int]:
    records = sorted(get_live_records(), key=lambda record: str(record.get("symbol", "")))
    page_items, total_pages = paginate_records(records, page, limit)
    return page_items, total_pages, len(records)
