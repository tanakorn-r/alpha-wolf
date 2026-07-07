from __future__ import annotations

from typing import Any

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.cache import cache_get, cache_set
from internal.yahoo.client import load_ticker_modules, ticker as make_ticker

DETAIL_TTL_SECONDS = 180

# A typed name that isn't a real ticker still hits yfinance, which may 404/raise or
# resolve to a non-security (a fund/currency/index whose display name reads like a
# person). Only real tradeable instruments are accepted; everything else → no match.
_SUPPORTED_QUOTE_TYPES = {"EQUITY", "ETF", "MUTUALFUND", "MUTUAL_FUND"}


def fetch_symbol_record(symbol: str) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    if not normalized:
        return None

    cached = cache_get("symbol_record", normalized)
    if cached is not None:
        return cached

    try:
        ticker = make_ticker(normalized)
        modules = load_ticker_modules(ticker, normalized)
        info = merge_ticker_info(modules, normalized)
        if not info:
            return None

        quote_type = str(info.get("quoteType") or "").upper()
        if quote_type and quote_type not in _SUPPORTED_QUOTE_TYPES:
            return None

        entry = build_entry_from_info(normalized, info)
        record = fetch_record_from_ticker(entry, ticker=ticker, info=info)
    except Exception:
        # yfinance raises (KeyError/ValueError/HTTP) for unknown or delisted symbols;
        # a search miss must degrade to "no result", never a 500.
        return None

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
