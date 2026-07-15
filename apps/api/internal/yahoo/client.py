from __future__ import annotations

import threading
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

import pandas as pd
import yfinance as yf

from internal.store.cache import should_attempt_refresh, try_acquire_compute_lock
from internal.store.utils import as_float
from internal.store.utils import safe_dict
from internal.store.yahoo_cache import YahooCacheEntry, load_yahoo_data, save_yahoo_data

QUOTE_TTL_SECONDS = 60
MODULES_TTL_SECONDS = 90 * 86_400
HISTORY_TTL_SECONDS = 86_400
LONG_HISTORY_TTL_SECONDS = 86_400
FULL_HISTORY_REFRESH_SECONDS = 604_800
NEWS_TTL_SECONDS = 900
DIVIDENDS_TTL_SECONDS = 86_400

# Floor on how often we'll even ATTEMPT a refresh for the same key, regardless of outcome.
# Without this, a symbol that keeps failing/timing out against Yahoo would get re-attempted
# on every single request that finds it stale — the lock only stops concurrent duplicates,
# not this kind of sequential retry storm against an already-struggling upstream.
MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS = 60
YAHOO_BACKGROUND_WORKERS = max(1, int(os.getenv("YAHOO_BACKGROUND_WORKERS", "6")))
_YAHOO_EXECUTOR = ThreadPoolExecutor(max_workers=YAHOO_BACKGROUND_WORKERS, thread_name_prefix="yahoo-refresh")


def ticker(symbol: str) -> yf.Ticker:
    return yf.Ticker(symbol)


def _refresh_in_background(namespace: str, key: str, task: Callable[[], None]) -> None:
    """Run `task` (fetch live data + upsert into the cache) on a daemon thread instead of
    blocking the caller. Every read below is cache-first: it always returns whatever is
    already stored (even stale or empty) immediately, and only ever touches yfinance from
    here, off the request path. A non-blocking per-key lock means at most one background
    refresh per key runs at a time — if one's already in flight, this silently skips
    scheduling a duplicate rather than piling up redundant Yahoo calls. A separate cooldown
    (`should_attempt_refresh`) additionally caps how often a *new* attempt can even start,
    so a symbol that keeps failing doesn't get retried on every request that hits it.
    """
    if not should_attempt_refresh(namespace, key, MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS):
        return

    lock = try_acquire_compute_lock(namespace, key)
    if lock is None:
        return

    def _run() -> None:
        try:
            task()
        except Exception:
            pass
        finally:
            lock.release()

    _YAHOO_EXECUTOR.submit(_run)


def _safe_info(t: yf.Ticker) -> dict[str, Any]:
    try:
        return safe_dict(getattr(t, "info", {}))
    except Exception:
        return {}


def _safe_fast_info(t: yf.Ticker) -> dict[str, Any]:
    try:
        fast = getattr(t, "fast_info", None)
        if fast is None:
            return {}
        # IMPORTANT: currency, exchange, quote_type, and timezone all call
        # _get_exchange_metadata() → get_history_metadata() internally, which raises
        # KeyError('exchangeTimezoneName') for some tickers on recent yfinance versions.
        # Only read the price/volume properties that use _get_1y_prices() instead.
        result: dict[str, Any] = {}
        for key in ("last_price", "market_cap", "previous_close",
                    "regular_market_previous_close", "last_volume",
                    "year_high", "year_low"):
            try:
                val = getattr(fast, key, None)
                if val is not None:
                    result[key] = val
            except Exception:
                pass
        return result
    except Exception:
        return {}


def _build_flat_info(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    info = _safe_info(t)
    fast = _safe_fast_info(t)
    flat: dict[str, Any] = dict(info)

    if fast:
        flat.setdefault("regularMarketPrice", fast.get("last_price"))
        flat.setdefault("currentPrice", flat.get("regularMarketPrice") or fast.get("last_price"))
        flat.setdefault("regularMarketPreviousClose", fast.get("regular_market_previous_close") or fast.get("previous_close"))
        flat.setdefault("regularMarketVolume", fast.get("last_volume"))
        flat.setdefault("marketCap", fast.get("market_cap"))
        flat.setdefault("fiftyTwoWeekHigh", fast.get("year_high"))
        flat.setdefault("fiftyTwoWeekLow", fast.get("year_low"))

    flat.setdefault("symbol", symbol)
    flat.setdefault("shortName", flat.get("shortName") or flat.get("longName") or flat.get("name") or symbol)
    flat.setdefault("longName", flat.get("longName") or flat.get("shortName") or symbol)
    flat.setdefault("displayName", flat.get("displayName") or flat.get("shortName") or symbol)
    flat.setdefault("longBusinessSummary", flat.get("longBusinessSummary") or flat.get("longName") or symbol)
    flat.setdefault("sector", flat.get("sector") or "Unknown")
    flat.setdefault("industry", flat.get("industry") or flat.get("sector") or "Unknown")

    return flat


def build_ticker_modules(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    flat = _build_flat_info(t, symbol)
    calendar = safe_dict(_safe_attr(t, "calendar", {}))

    price = {
        "symbol": symbol,
        "shortName": flat.get("shortName"),
        "longName": flat.get("longName"),
        "displayName": flat.get("displayName"),
        "quoteType": flat.get("quoteType"),
        "exchange": flat.get("exchange"),
        "currency": flat.get("currency"),
        "marketCap": flat.get("marketCap"),
        "regularMarketPrice": flat.get("regularMarketPrice"),
        "currentPrice": flat.get("currentPrice"),
        "regularMarketPreviousClose": flat.get("regularMarketPreviousClose"),
        "regularMarketVolume": flat.get("regularMarketVolume"),
        "averageVolume": flat.get("averageVolume"),
        "beta": flat.get("beta"),
    }

    summary_detail = {
        "marketCap": flat.get("marketCap"),
        "currentPrice": flat.get("currentPrice"),
        "regularMarketPrice": flat.get("regularMarketPrice"),
        "regularMarketPreviousClose": flat.get("regularMarketPreviousClose"),
        "regularMarketVolume": flat.get("regularMarketVolume"),
        "averageVolume": flat.get("averageVolume") or flat.get("averageVolume10days"),
        "fiftyTwoWeekHigh": flat.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": flat.get("fiftyTwoWeekLow"),
        "enterpriseValue": flat.get("enterpriseValue"),
        "trailingPE": flat.get("trailingPE"),
        "forwardPE": flat.get("forwardPE"),
        "priceToBook": flat.get("priceToBook"),
        "beta": flat.get("beta"),
        "beta3Year": flat.get("beta3Year"),
        "dividendYield": flat.get("dividendYield"),
        "dividendRate": flat.get("dividendRate"),
        "exDividendDate": flat.get("exDividendDate"),
        "dividendDate": flat.get("dividendDate"),
        "payoutRatio": flat.get("payoutRatio"),
        "recommendationKey": flat.get("recommendationKey"),
        "recommendationMean": flat.get("recommendationMean"),
        "targetMeanPrice": flat.get("targetMeanPrice"),
    }

    summary_profile = {
        "sector": flat.get("sector"),
        "sectorKey": flat.get("sectorKey"),
        "industry": flat.get("industry"),
        "industryKey": flat.get("industryKey"),
        "longBusinessSummary": flat.get("longBusinessSummary"),
    }

    asset_profile = {
        "sector": flat.get("sector"),
        "sectorKey": flat.get("sectorKey"),
        "industry": flat.get("industry"),
        "industryKey": flat.get("industryKey"),
        "longBusinessSummary": flat.get("longBusinessSummary"),
    }

    financial_data = {
        "returnOnEquity": flat.get("returnOnEquity"),
        "returnOnAssets": flat.get("returnOnAssets"),
        "profitMargins": flat.get("profitMargins"),
        "operatingMargins": flat.get("operatingMargins"),
        "grossMargins": flat.get("grossMargins"),
        "revenueGrowth": flat.get("revenueGrowth"),
        "earningsGrowth": flat.get("earningsGrowth"),
        "debtToEquity": flat.get("debtToEquity"),
        "freeCashflow": flat.get("freeCashflow"),
        "recommendationKey": flat.get("recommendationKey"),
        "recommendationMean": flat.get("recommendationMean"),
        "targetMeanPrice": flat.get("targetMeanPrice"),
    }

    quote_type = {
        "symbol": symbol,
        "quoteType": flat.get("quoteType"),
        "exchange": flat.get("exchange"),
        "market": flat.get("market"),
        "currency": flat.get("currency"),
    }

    return {
        symbol: {
            "price": price,
            "summaryDetail": summary_detail,
            "summaryProfile": summary_profile,
            "assetProfile": asset_profile,
            "financialData": financial_data,
            "quoteType": quote_type,
            "calendarEvents": calendar,
        }
    }


def build_quote_modules(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    """Small one-minute quote payload, separate from quarterly company modules."""
    fast = _safe_fast_info(t)
    last_price = fast.get("last_price")
    previous_close = fast.get("regular_market_previous_close") or fast.get("previous_close")
    metadata = safe_dict(_safe_attr(t, "history_metadata", {}))
    price = {
        key: value for key, value in {
            "symbol": symbol,
            "regularMarketPrice": last_price,
            "currentPrice": last_price,
            "regularMarketPreviousClose": previous_close,
            "regularMarketVolume": fast.get("last_volume"),
            "marketCap": fast.get("market_cap"),
            "regularMarketTime": metadata.get("regularMarketTime"),
        }.items() if value is not None
    }
    summary = {
        key: value for key, value in {
            "currentPrice": last_price,
            "regularMarketPrice": last_price,
            "regularMarketPreviousClose": previous_close,
            "regularMarketVolume": fast.get("last_volume"),
            "marketCap": fast.get("market_cap"),
            "fiftyTwoWeekHigh": fast.get("year_high"),
            "fiftyTwoWeekLow": fast.get("year_low"),
        }.items() if value is not None
    }
    return {symbol: {"price": price, "summaryDetail": summary}}


def _merge_module_payloads(company: dict[str, Any], quote: dict[str, Any], symbol: str) -> dict[str, Any]:
    company_modules = safe_dict(company.get(symbol))
    quote_modules = safe_dict(quote.get(symbol))
    merged = dict(company_modules)
    for section, values in quote_modules.items():
        if isinstance(values, dict):
            merged[section] = {**safe_dict(merged.get(section)), **values}
        elif values is not None:
            merged[section] = values
    return {symbol: merged} if merged else {}


def load_ticker_modules(
    t: yf.Ticker,
    symbol: str,
    *,
    company_cached: YahooCacheEntry | None = None,
    quote_cached: YahooCacheEntry | None = None,
    cache_supplied: bool = False,
    refresh_stale: bool = True,
) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    if not cache_supplied:
        company_cached = load_yahoo_data(normalized, "modules")
        quote_cached = load_yahoo_data(normalized, "quote")

    if not company_cached or (refresh_stale and not company_cached.is_fresh):
        def _refresh_company() -> None:
            result = build_ticker_modules(t, normalized)
            if _modules_have_market_data(result, normalized):
                save_yahoo_data(normalized, "modules", result, ttl_seconds=MODULES_TTL_SECONDS)

        _refresh_in_background("yahoo_modules", normalized, _refresh_company)

    if not quote_cached or (refresh_stale and not quote_cached.is_fresh):
        def _refresh_quote() -> None:
            result = build_quote_modules(t, normalized)
            if _modules_have_quote(result, normalized):
                save_yahoo_data(normalized, "quote", result, ttl_seconds=QUOTE_TTL_SECONDS)

        _refresh_in_background("yahoo_quote", normalized, _refresh_quote)

    company = company_cached.payload if company_cached and isinstance(company_cached.payload, dict) else {}
    quote = quote_cached.payload if quote_cached and isinstance(quote_cached.payload, dict) else {}
    return _merge_module_payloads(company, quote, normalized)


def quote_snapshot_meta(
    symbol: str,
    *,
    cached_entry: YahooCacheEntry | None = None,
    cache_supplied: bool = False,
) -> dict[str, Any]:
    cached = cached_entry if cache_supplied else load_yahoo_data(symbol.upper().strip(), "quote")
    return {
        "fresh": bool(cached and cached.is_fresh and isinstance(cached.payload, dict)),
        "stale": bool(cached and not cached.is_fresh and isinstance(cached.payload, dict)),
        "available": bool(cached and isinstance(cached.payload, dict)),
        "fetchedAt": cached.fetched_at.isoformat() if cached else None,
        "expiresAt": cached.expires_at.isoformat() if cached else None,
    }


def fetch_history(
    t: yf.Ticker,
    period: str = "1y",
    auto_adjust: bool = True,
    *,
    cached_entry: YahooCacheEntry | None = None,
    cache_supplied: bool = False,
    refresh_stale: bool = True,
) -> pd.DataFrame:
    # auto_adjust=False keeps Close split-adjusted but dividend-UNADJUSTED (plus a raw "Dividends"
    # per-share column). Callers that need to book real dividend cash flows without double-counting
    # them against Yahoo's default continuously-reinvested adjusted Close must pass False.
    symbol = _ticker_symbol(t)
    dataset = "history" if auto_adjust else "history_raw"
    cached = cached_entry if cache_supplied else load_yahoo_data(symbol, dataset, period) if symbol else None
    frame = _history_from_payload(cached.payload) if cached else pd.DataFrame()

    if symbol and (not cached or frame.empty or (refresh_stale and not cached.is_fresh)):
        def _refresh() -> None:
            # Re-read inside the task (not the value captured above) since some time may
            # have passed between scheduling and actually running on the background thread.
            current = load_yahoo_data(symbol, dataset, period)
            is_long_history = period.lower() in {"5y", "10y", "max"}
            full_refresh = load_yahoo_data(symbol, f"{dataset}_full_refresh", period) if is_long_history else None
            live_period = "1mo" if current and is_long_history and full_refresh and full_refresh.is_fresh else period
            try:
                result = normalize_history_frame(t.history(period=live_period, interval="1d", auto_adjust=auto_adjust))
            except Exception:
                result = pd.DataFrame()
            if result.empty:
                return
            if live_period != period and current:
                result = _merge_history(_history_from_payload(current.payload), result)
            save_yahoo_data(symbol, dataset, _history_to_payload(result), period=period, ttl_seconds=_history_ttl(period))
            if live_period == period and is_long_history:
                save_yahoo_data(
                    symbol,
                    f"{dataset}_full_refresh",
                    {"period": period},
                    period=period,
                    ttl_seconds=FULL_HISTORY_REFRESH_SECONDS,
                )

        _refresh_in_background("yahoo_history", f"{symbol}:{period}:{dataset}", _refresh)

    return frame


def normalize_history_frame(history: Any) -> pd.DataFrame:
    if not isinstance(history, pd.DataFrame) or history.empty:
        return pd.DataFrame()

    frame = history.copy()
    rename_map = {
        "open": "Open",
        "high": "High",
        "low": "Low",
        "close": "Close",
        "adjclose": "Adj Close",
        "volume": "Volume",
    }
    frame = frame.rename(columns={column: rename_map.get(str(column).lower(), column) for column in frame.columns})
    if "symbol" in frame.columns:
        frame = frame.drop(columns=["symbol"])
    return frame


def fetch_news(
    t: yf.Ticker,
    *,
    cached_entry: YahooCacheEntry | None = None,
    cache_supplied: bool = False,
    refresh_stale: bool = True,
) -> list[dict[str, Any]]:
    symbol = _ticker_symbol(t)
    cached = cached_entry if cache_supplied else load_yahoo_data(symbol, "news") if symbol else None
    has_data = bool(cached and isinstance(cached.payload, list))

    if symbol and (not cached or (refresh_stale and not cached.is_fresh)):
        def _refresh() -> None:
            result = _fetch_news_live(t)
            if result:
                save_yahoo_data(symbol, "news", result, ttl_seconds=NEWS_TTL_SECONDS)

        _refresh_in_background("yahoo_news", symbol, _refresh)

    return cached.payload if has_data else []


def _fetch_news_live(t: yf.Ticker) -> list[dict[str, Any]]:
    try:
        raw_news = getattr(t, "news", []) or []
    except Exception:
        raw_news = []

    from internal.store.utils import normalize_timestamp

    news_items: list[dict[str, Any]] = []
    for item in raw_news[:8]:
        if not isinstance(item, dict):
            continue
        content = safe_dict(item.get("content"))
        title = _first_text(content.get("title"), item.get("title"), item.get("headline"))
        if not title:
            continue
        news_items.append(
            {
                "title": title,
                "link": _first_text(
                    item.get("link"),
                    item.get("url"),
                    _url_value(content.get("clickThroughUrl")),
                    _url_value(content.get("canonicalUrl")),
                ),
                "publisher": (
                    _publisher_name(content.get("provider"))
                    or _publisher_name(item.get("provider"))
                    or item.get("publisher")
                    or "Yahoo Finance"
                ),
                "publishedAt": normalize_timestamp(
                    item.get("providerPublishTime")
                    or content.get("pubDate")
                    or content.get("displayTime")
                    or item.get("pubDate")
                    or item.get("published_at")
                ),
                "summary": _first_text(
                    content.get("summary"),
                    item.get("summary"),
                    content.get("description"),
                    item.get("description"),
                ),
            }
        )
    return news_items


def _first_text(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                return text
    return None


def _url_value(value: Any) -> str | None:
    if isinstance(value, dict):
        return _first_text(value.get("url"))
    return _first_text(value)


def _publisher_name(value: Any) -> str | None:
    if isinstance(value, dict):
        return _first_text(value.get("displayName"), value.get("name"), value.get("sourceId"))
    return _first_text(value)


def fetch_dividends(
    t: yf.Ticker,
    period: str = "ytd",
    *,
    cached_entry: YahooCacheEntry | None = None,
    cache_supplied: bool = False,
    refresh_stale: bool = True,
) -> pd.Series:
    symbol = _ticker_symbol(t)
    cached = cached_entry if cache_supplied else load_yahoo_data(symbol, "dividends", period) if symbol else None
    series = _dividends_from_payload(cached.payload) if cached else pd.Series(dtype="float64")

    if symbol and (not cached or series.empty or (refresh_stale and not cached.is_fresh)):
        def _refresh() -> None:
            try:
                dividends = t.get_dividends(period=period)
                result = dividends if isinstance(dividends, pd.Series) else pd.Series(dtype="float64")
            except Exception:
                result = pd.Series(dtype="float64")
            if not result.empty:
                save_yahoo_data(symbol, "dividends", _dividends_to_payload(result), period=period, ttl_seconds=DIVIDENDS_TTL_SECONDS)

        _refresh_in_background("yahoo_dividends", f"{symbol}:{period}", _refresh)

    return series


def _ticker_symbol(t: Any) -> str:
    return str(getattr(t, "ticker", None) or getattr(t, "symbol", None) or "").upper().strip()


def _modules_have_market_data(value: dict[str, Any], symbol: str) -> bool:
    modules = value.get(symbol) if isinstance(value, dict) else None
    if not isinstance(modules, dict):
        return False
    price = modules.get("price") or {}
    details = modules.get("summaryDetail") or {}
    quote = modules.get("quoteType") or {}
    return any(
        item is not None and item != ""
        for item in (
            price.get("currentPrice"),
            price.get("regularMarketPrice"),
            details.get("marketCap"),
            quote.get("quoteType"),
            quote.get("exchange"),
        )
    )


def _modules_have_quote(value: dict[str, Any], symbol: str) -> bool:
    modules = value.get(symbol) if isinstance(value, dict) else None
    price = modules.get("price") if isinstance(modules, dict) else None
    return isinstance(price, dict) and any(
        price.get(key) is not None
        for key in ("currentPrice", "regularMarketPrice", "regularMarketPreviousClose")
    )


def _history_ttl(period: str) -> int:
    return LONG_HISTORY_TTL_SECONDS if period.lower() in {"5y", "10y", "max"} else HISTORY_TTL_SECONDS


def _history_to_payload(frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, row in normalize_history_frame(frame).iterrows():
        item: dict[str, Any] = {"date": index.isoformat() if hasattr(index, "isoformat") else str(index)}
        for column, value in row.items():
            item[str(column)] = None if pd.isna(value) else float(value)
        rows.append(item)
    return rows


def _history_from_payload(payload: Any) -> pd.DataFrame:
    if not isinstance(payload, list) or not payload:
        return pd.DataFrame()
    frame = pd.DataFrame(payload)
    if "date" not in frame.columns:
        return pd.DataFrame()
    index = pd.to_datetime(frame.pop("date"), utc=True, errors="coerce")
    frame.index = index
    frame = frame[~frame.index.isna()]
    return normalize_history_frame(frame)


def _merge_history(base: pd.DataFrame, update: pd.DataFrame) -> pd.DataFrame:
    if base.empty:
        return normalize_history_frame(update)
    if update.empty:
        return normalize_history_frame(base)
    merged = pd.concat([normalize_history_frame(base), normalize_history_frame(update)])
    merged = merged[~merged.index.duplicated(keep="last")].sort_index()
    return merged


def _dividends_to_payload(series: pd.Series) -> list[dict[str, Any]]:
    return [
        {
            "date": index.isoformat() if hasattr(index, "isoformat") else str(index),
            "amount": None if pd.isna(value) else float(value),
        }
        for index, value in series.items()
        if not pd.isna(value)
    ]


def _dividends_from_payload(payload: Any) -> pd.Series:
    if not isinstance(payload, list) or not payload:
        return pd.Series(dtype="float64")
    dates: list[pd.Timestamp] = []
    values: list[float] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        date = pd.to_datetime(item.get("date"), utc=True, errors="coerce")
        amount = as_float(item.get("amount"))
        if pd.isna(date) or amount is None:
            continue
        dates.append(date)
        values.append(amount)
    return pd.Series(values, index=pd.DatetimeIndex(dates), dtype="float64")


def safe_call(func: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return func(*args, **kwargs)
    except Exception:
        return pd.DataFrame()


def fetch_sector(key: str) -> yf.Sector:
    return yf.Sector(key)


def fetch_industry(key: str) -> yf.Industry:
    return yf.Industry(key)


def _safe_attr(t: yf.Ticker, name: str, default: Any) -> Any:
    try:
        return getattr(t, name)
    except Exception:
        return default
