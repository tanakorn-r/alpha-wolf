from __future__ import annotations

from typing import Any

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.cache import cache_get, cache_set
from internal.store.db import store_records
from internal.yahoo.client import load_ticker_modules, ticker as make_ticker

DETAIL_TTL_SECONDS = 180


def fetch_symbol_record(symbol: str) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    if not normalized:
        return None

    cached = cache_get("symbol_record", normalized)
    if cached is not None:
        return cached

    ticker = make_ticker(normalized)
    modules = load_ticker_modules(ticker, normalized)
    info = merge_ticker_info(modules, normalized)
    if not info:
        return None

    entry = build_entry_from_info(normalized, info)
    record = fetch_record_from_ticker(entry, ticker=ticker, info=info)
    store_records([record])
    cache_set("symbol_record", normalized, record, DETAIL_TTL_SECONDS)
    return record


def get_single_record(symbol: str) -> dict[str, Any] | None:
    cached = cache_get("symbol_record", symbol.upper())
    if cached is not None:
        return cached
    record = fetch_symbol_record(symbol)
    if record:
        cache_set("symbol_record", symbol.upper(), record, DETAIL_TTL_SECONDS)
    return record
