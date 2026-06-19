from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
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
        return safe_dict(getattr(t, "fast_info", {}))
    except Exception:
        return {}


def _build_flat_info(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    info = _safe_info(t)
    fast = _safe_fast_info(t)
    flat: dict[str, Any] = dict(info)

    if fast:
        flat.setdefault("currency", fast.get("currency"))
        flat.setdefault("exchange", fast.get("exchange"))
        flat.setdefault("quoteType", fast.get("quote_type") or fast.get("quoteType"))
        flat.setdefault("marketCap", fast.get("market_cap") or fast.get("marketCap"))
        flat.setdefault("regularMarketPrice", fast.get("last_price") or fast.get("lastPrice"))
        flat.setdefault("currentPrice", flat.get("regularMarketPrice") or fast.get("last_price"))
        flat.setdefault("regularMarketPreviousClose", fast.get("previous_close") or fast.get("previousClose"))
        flat.setdefault("regularMarketVolume", fast.get("last_volume") or fast.get("lastVolume"))

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
        "payoutRatio": flat.get("payoutRatio"),
        "recommendationKey": flat.get("recommendationKey"),
        "recommendationMean": flat.get("recommendationMean"),
        "targetMeanPrice": flat.get("targetMeanPrice"),
    }

    summary_profile = {
        "sector": flat.get("sector"),
        "industry": flat.get("industry"),
        "longBusinessSummary": flat.get("longBusinessSummary"),
    }

    asset_profile = {
        "sector": flat.get("sector"),
        "industry": flat.get("industry"),
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


def _fetch_one_quote(symbol: str) -> dict[str, Any] | None:
    flat = _build_flat_info(ticker(symbol), symbol)
    if not flat:
        return None

    price = as_float(flat.get("regularMarketPrice") or flat.get("currentPrice") or flat.get("lastPrice") or flat.get("last_price"))
    previous_close = as_float(flat.get("regularMarketPreviousClose") or flat.get("previousClose") or flat.get("previous_close"))
    change_pct = None
    if price is not None and previous_close not in (None, 0):
        change_pct = ((price - previous_close) / previous_close) * 100.0

    return {
        "symbol": symbol,
        "longName": flat.get("longName") or flat.get("shortName") or symbol,
        "shortName": flat.get("shortName") or flat.get("longName") or symbol,
        "name": flat.get("shortName") or flat.get("longName") or symbol,
        "displayName": flat.get("displayName") or flat.get("shortName") or symbol,
        "exchange": flat.get("exchange"),
        "fullExchangeName": flat.get("fullExchangeName") or flat.get("exchange"),
        "quoteType": flat.get("quoteType"),
        "sector": flat.get("sector"),
        "industry": flat.get("industry"),
        "currency": flat.get("currency"),
        "regularMarketPrice": price,
        "price": price,
        "lastPrice": price,
        "regularMarketChangePercent": change_pct,
        "changePercent": change_pct,
        "marketCap": as_float(flat.get("marketCap")),
    }


def fetch_quote_map(symbols: list[str]) -> dict[str, dict[str, Any]]:
    # yfinance has no batch-quote endpoint (unlike yahooquery's Ticker(list).quotes),
    # so each symbol needs its own `.info` call. Without concurrency this loop took
    # 1-2s per symbol times 150+ symbols per preset - several minutes per refresh.
    cleaned = [str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()]
    if not cleaned:
        return {}

    quotes: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(16, len(cleaned))) as pool:
        futures = {pool.submit(_fetch_one_quote, symbol): symbol for symbol in cleaned}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                quote = future.result()
            except Exception:
                continue
            if quote:
                quotes[symbol] = quote

    return quotes


def load_ticker_modules(t: yf.Ticker, symbol: str) -> dict[str, Any]:
    return build_ticker_modules(t, symbol)


def fetch_history(t: yf.Ticker, period: str = "1y") -> pd.DataFrame:
    try:
        return normalize_history_frame(t.history(period=period, interval="1d"))
    except Exception:
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
        title = item.get("title") or item.get("headline")
        if not title:
            continue
        news_items.append(
            {
                "title": title,
                "link": item.get("link") or item.get("url"),
                "publisher": item.get("publisher") or item.get("provider") or "Yahoo Finance",
                "publishedAt": normalize_timestamp(item.get("providerPublishTime") or item.get("pubDate") or item.get("published_at")),
                "summary": item.get("summary") or item.get("description"),
            }
        )
    return news_items


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
