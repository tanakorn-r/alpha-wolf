from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

import pandas as pd

from internal.store.utils import as_float, normalize_timestamp
from internal.store.yahoo_cache import YahooCacheEntry, load_yahoo_data
from internal.store.universe_cache import load_market_universe


YAHOO_PROVIDER_POLICY: dict[str, Any] = {
    "primary": "Yahoo Finance via yfinance",
    "fallback": "Last stored Yahoo snapshot; price may fall back to the latest stored historical close",
    "rules": [
        "Yahoo market data may be delayed and is never labeled real-time.",
        "Expired snapshots remain usable only when visibly marked stale.",
        "Missing fields remain null and are never inferred from unrelated fields or providers.",
        "A historical-close price fallback is labeled separately from a quote.",
    ],
    "cacheWindows": {
        "quote": "60 seconds",
        "history": "1 day",
        "news": "15 minutes",
        "dividends": "1 day",
        "fundamentals": "90 days",
    },
}


def yahoo_dataset_meta(
    symbol: str,
    name: str,
    *,
    data_type: str | None = None,
    period: str = "",
    cache_entries: dict[tuple[str, str, str], YahooCacheEntry] | None = None,
) -> dict[str, Any]:
    cache_key = (symbol.upper().strip(), (data_type or name).lower(), period.lower())
    entry = cache_entries.get(cache_key) if cache_entries is not None else load_yahoo_data(*cache_key)
    available = bool(entry and entry.payload not in (None, {}, []))
    return {
        "name": name,
        "provider": "Yahoo Finance",
        "available": available,
        "fetchedAt": entry.fetched_at.isoformat() if entry else None,
        "expiresAt": entry.expires_at.isoformat() if entry else None,
        "stale": bool(available and not entry.is_fresh) if entry else False,
    }


def build_yahoo_data_trust(
    symbol: str,
    *,
    stock: dict[str, Any] | None = None,
    business: dict[str, Any] | None = None,
    history: pd.DataFrame | None = None,
    history_period: str = "5y",
    include_news: bool = True,
    include_dividends: bool = True,
    check_fundamentals: bool = True,
    dividends_period: str | None = None,
    cache_entries: dict[tuple[str, str, str], YahooCacheEntry] | None = None,
) -> dict[str, Any]:
    stock = stock or {}
    business = business or {}
    history = history if isinstance(history, pd.DataFrame) else pd.DataFrame()
    datasets = [
        yahoo_dataset_meta(symbol, "quote", cache_entries=cache_entries),
        yahoo_dataset_meta(symbol, "fundamentals", data_type="modules", cache_entries=cache_entries),
        yahoo_dataset_meta(symbol, "history", period=history_period, cache_entries=cache_entries),
    ]
    if include_news:
        datasets.append(yahoo_dataset_meta(symbol, "news", cache_entries=cache_entries))
    if include_dividends:
        datasets.append(yahoo_dataset_meta(symbol, "dividends", period=dividends_period or history_period, cache_entries=cache_entries))

    quote_time = normalize_timestamp(stock.get("marketTimestamp") or stock.get("regularMarketTime"))
    market_time = quote_time or _latest_history_timestamp(history)
    fetched_values = [item["fetchedAt"] for item in datasets if item.get("fetchedAt")]
    relevant = [item for item in datasets if item["name"] in {"quote", "fundamentals", "history"}]
    stale = any(item["stale"] for item in relevant if item["available"])
    fallback_used = stock.get("priceSource") == "stored_history_close"

    required = {
        "stock.price": stock.get("price"),
        "stock.currency": stock.get("currency"),
        "marketTimestamp": market_time,
    }
    if check_fundamentals:
        required.update({
            "business.marketCap": business.get("marketCap"),
            "business.peRatio": business.get("peRatio"),
            "business.priceToBook": business.get("priceToBook"),
            "business.roe": business.get("roe"),
            "business.profitMargin": business.get("profitMargin"),
            "business.revenueGrowth": business.get("revenueGrowth"),
            "business.dividendYield": business.get("dividendYield"),
            "business.debtToEquity": business.get("debtToEquity"),
        })
    missing = [name for name, value in required.items() if _missing(value)]
    unavailable = _missing(stock.get("price")) and history.empty
    status = "unavailable" if unavailable else "stale" if stale else "partial" if missing else "delayed"
    return {
        "provider": "Yahoo Finance",
        "transport": "yfinance",
        "symbol": symbol.upper().strip(),
        "marketTimestamp": market_time,
        "marketTimestampSource": "quote" if quote_time else "latest daily close" if market_time else None,
        # Oldest component is the safe timestamp for a composite card; individual dataset
        # timestamps remain available below for inspection.
        "fetchedAt": min(fetched_values) if fetched_values else None,
        "status": status,
        "stale": stale,
        "delayed": True,
        "fallback": {
            "used": fallback_used,
            "source": "latest stored historical close" if fallback_used else None,
            "reason": "Yahoo quote price was missing" if fallback_used else None,
        },
        "missingFields": missing,
        "datasets": datasets,
        "policy": YAHOO_PROVIDER_POLICY,
    }


def aggregate_data_trust(items: Iterable[dict[str, Any] | None]) -> dict[str, Any]:
    trusts = [item for item in items if item]
    if not trusts:
        return {
            "provider": "Yahoo Finance",
            "transport": "yfinance",
            "marketTimestamp": None,
            "marketTimestampSource": None,
            "fetchedAt": None,
            "status": "unavailable",
            "stale": False,
            "delayed": True,
            "fallback": {"used": False, "source": None, "reason": None},
            "missingFields": ["market data"],
            "datasets": [],
            "policy": YAHOO_PROVIDER_POLICY,
        }
    statuses = {str(item.get("status")) for item in trusts}
    status = "unavailable" if "unavailable" in statuses else "stale" if "stale" in statuses else "partial" if "partial" in statuses else "delayed"
    market_times = [str(item["marketTimestamp"]) for item in trusts if item.get("marketTimestamp")]
    fetched_times = [str(item["fetchedAt"]) for item in trusts if item.get("fetchedAt")]
    missing = sorted({f"{item.get('symbol', 'market')}: {field}" for item in trusts for field in item.get("missingFields", [])})
    fallbacks = [item.get("fallback") or {} for item in trusts]
    return {
        "provider": "Yahoo Finance",
        "transport": "yfinance",
        "marketTimestamp": min(market_times) if market_times else None,
        "marketTimestampSource": "oldest component observation" if market_times else None,
        "fetchedAt": min(fetched_times) if fetched_times else None,
        "status": status,
        "stale": any(bool(item.get("stale")) for item in trusts),
        "delayed": True,
        "fallback": {
            "used": any(bool(item.get("used")) for item in fallbacks),
            "source": "one or more stored snapshots" if any(bool(item.get("used")) for item in fallbacks) else None,
            "reason": "one or more live quote fields were unavailable" if any(bool(item.get("used")) for item in fallbacks) else None,
        },
        "missingFields": missing,
        "datasets": [dataset for item in trusts for dataset in item.get("datasets", [])],
        "policy": YAHOO_PROVIDER_POLICY,
    }


def build_universe_data_trust(region: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    regions = ["us", "th"] if region == "all" else [region]
    caches = [item for item in (load_market_universe(item) for item in regions) if item]
    now = datetime.now(timezone.utc)
    stale = any(_as_utc(item.expiresAt) <= now for item in caches)
    fetched = [item.fetchedAt for item in caches if item.fetchedAt]
    market_times = [str(item.get("updatedAt")) for item in records if item.get("updatedAt")]
    missing = sorted({f"{item.get('symbol', 'candidate')}.{field}" for item in records for field in ("price", "currency", "updatedAt") if _missing(item.get(field))})
    return {
        "provider": "Yahoo Finance",
        "transport": "yfinance screen cache",
        "marketTimestamp": min(market_times) if market_times else None,
        "marketTimestampSource": "universe snapshot observation" if market_times else None,
        "fetchedAt": min(fetched) if fetched else None,
        "status": "unavailable" if not caches else "stale" if stale else "partial" if missing else "delayed",
        "stale": stale,
        "delayed": True,
        "fallback": {
            "used": stale,
            "source": "last stored market-universe snapshot" if stale else None,
            "reason": "Yahoo universe refresh is unavailable or expired" if stale else None,
        },
        "missingFields": missing,
        "datasets": [{
            "name": f"{item.region} universe",
            "provider": "Yahoo Finance",
            "available": bool(item.records),
            "fetchedAt": item.fetchedAt,
            "expiresAt": item.expiresAt,
            "stale": _as_utc(item.expiresAt) <= now,
        } for item in caches],
        "policy": YAHOO_PROVIDER_POLICY,
    }


def _latest_history_timestamp(history: pd.DataFrame) -> str | None:
    if history.empty:
        return None
    try:
        value = history.index[-1]
        if isinstance(value, pd.Timestamp):
            value = value.to_pydatetime()
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat()
        return normalize_timestamp(value)
    except Exception:
        return None


def _missing(value: Any) -> bool:
    if value is None or value == "":
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    return False


def _as_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
