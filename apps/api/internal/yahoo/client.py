from __future__ import annotations

from typing import Any

import pandas as pd
import yfinance as yf

from internal.store.utils import as_float
from internal.store.utils import safe_dict


def ticker(symbol: str) -> yf.Ticker:
    return yf.Ticker(symbol)


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


def load_ticker_modules(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    return build_ticker_modules(t, symbol)


def fetch_history(t: yf.Ticker, period: str = "1y") -> pd.DataFrame:
    try:
        return normalize_history_frame(t.history(period=period, interval="1d"))
    except (KeyError, Exception):
        # Some tickers raise KeyError('exchangeTimezoneName') inside yfinance when
        # Yahoo returns incomplete metadata. Fall back to an empty frame so callers
        # can still produce a partial record using live price from fast_info.
        return pd.DataFrame()


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


def fetch_news(t: yf.Ticker) -> list[dict[str, Any]]:
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


def fetch_dividends(t: yf.Ticker, period: str = "ytd") -> pd.Series:
    try:
        dividends = t.get_dividends(period=period)
        return dividends if isinstance(dividends, pd.Series) else pd.Series(dtype="float64")
    except Exception:
        return pd.Series(dtype="float64")


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
