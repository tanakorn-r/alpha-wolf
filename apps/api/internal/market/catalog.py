from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from typing import Any

import yfinance as yf

from internal.market.records import percent_change
from internal.market.scoring import recommendation_from_best_strategy, score_strategies, story_from_strategy
from internal.market.technicals import relative_position_from_range, safe_ratio
from internal.store.universe_cache import load_market_universe, save_market_universe
from internal.store.cache import cache_get, cache_set
from internal.store.utils import as_float, slugify_index
from models import MarketCatalogStatus, MarketUniverseCache, UniverseEntry

CATALOG_TTL_SECONDS = 86_400
CATALOG_PAGE_SIZE = 250
CATALOG_REGIONS = ("us", "th")
_REFRESH_LOCK = threading.Lock()


def get_industry_peers(region: str, industry: str) -> list[dict[str, Any]]:
    industry = _canonical_industry_name(industry)
    cache_key = f"v3:{region}:{industry.lower()}"
    cached = cache_get("industry_peers", cache_key)
    if isinstance(cached, list):
        return cached
    query = yf.EquityQuery("and", [
        yf.EquityQuery("eq", ["region", region]),
        yf.EquityQuery("eq", ["industry", industry]),
    ])
    payload = yf.screen(query, size=250, sortField="intradaymarketcap", sortAsc=False)
    quotes = payload.get("quotes", []) if isinstance(payload, dict) else []
    records = [
        _record_from_quote(quote, region)
        for quote in quotes
        if isinstance(quote, dict) and quote.get("symbol") and _is_supported_quote(quote, region)
    ]
    cache_set("industry_peers", cache_key, records, CATALOG_TTL_SECONDS)
    return records


def _canonical_industry_name(industry: str) -> str:
    target = slugify_index(industry)
    values = yf.EquityQuery("eq", ["region", "us"]).valid_values.get("industry", {})
    for group in values.values() if isinstance(values, dict) else []:
        for candidate in group:
            if slugify_index(str(candidate)) == target:
                return str(candidate)
    return industry


def get_market_catalog() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    cached = [load_market_universe(region) for region in CATALOG_REGIONS]
    if all(value and datetime.fromisoformat(value.expiresAt) > now for value in cached):
        return [record for value in cached if value for record in _sanitize_cached_records(value)]

    with _REFRESH_LOCK:
        cached = [load_market_universe(region) for region in CATALOG_REGIONS]
        now = datetime.now(timezone.utc)
        if all(value and datetime.fromisoformat(value.expiresAt) > now for value in cached):
            return [record for value in cached if value for record in _sanitize_cached_records(value)]
        refreshed = [_refresh_region(region) for region in CATALOG_REGIONS]
        return [record for value in refreshed for record in value.records]


def ensure_market_catalog() -> MarketCatalogStatus:
    now = datetime.now(timezone.utc)
    before = [load_market_universe(region) for region in CATALOG_REGIONS]
    cache_hit = all(value and datetime.fromisoformat(value.expiresAt) > now for value in before)
    get_market_catalog()
    values = [value for region in CATALOG_REGIONS if (value := load_market_universe(region))]
    return MarketCatalogStatus(
        cacheHit=cache_hit,
        ttlSeconds=CATALOG_TTL_SECONDS,
        counts={value.region: len(value.records) for value in values},
        fetchedAt={value.region: value.fetchedAt for value in values},
        expiresAt={value.region: value.expiresAt for value in values},
    )


def _refresh_region(region: str) -> MarketUniverseCache:
    query = yf.EquityQuery("eq", ["region", region])
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    page_count = 2 if region == "th" else 1
    for page in range(page_count):
        payload = yf.screen(query, offset=page * CATALOG_PAGE_SIZE, size=CATALOG_PAGE_SIZE, sortField="intradaymarketcap", sortAsc=False)
        quotes = payload.get("quotes", []) if isinstance(payload, dict) else []
        for quote in quotes:
            if not isinstance(quote, dict) or not quote.get("symbol"):
                continue
            symbol = str(quote["symbol"]).upper()
            if symbol in seen or not _is_supported_quote(quote, region):
                continue
            seen.add(symbol)
            records.append(_record_from_quote(quote, region))
            if len(records) == CATALOG_PAGE_SIZE:
                break
        if len(records) == CATALOG_PAGE_SIZE:
            break
    if not records:
        raise RuntimeError(f"yfinance returned an empty {region.upper()} market universe")
    now = datetime.now(timezone.utc)
    value = MarketUniverseCache(
        region=region,
        records=records,
        fetchedAt=now.isoformat(),
        expiresAt=(now + timedelta(seconds=CATALOG_TTL_SECONDS)).isoformat(),
    )
    save_market_universe(value)
    return value


def _sanitize_cached_records(value: MarketUniverseCache) -> list[dict[str, Any]]:
    records = [record for record in value.records if _is_supported_quote(record, value.region)]
    if len(records) != len(value.records):
        value.records = records
        save_market_universe(value)
    return records


def _is_supported_symbol(symbol: str, region: str) -> bool:
    return not (region == "th" and symbol.upper().endswith("-R.BK"))


def _is_supported_quote(quote: dict[str, Any], region: str) -> bool:
    symbol = str(quote.get("symbol") or "")
    if not _is_supported_symbol(symbol, region):
        return False
    if region != "th":
        return True
    name = str(quote.get("longName") or quote.get("shortName") or quote.get("name") or "").upper()
    return "_DR" not in name and "DEPOSITARY RECEIPT" not in name


def _record_from_quote(quote: dict[str, Any], region: str) -> dict[str, Any]:
    symbol = str(quote["symbol"]).upper()
    name = str(quote.get("longName") or quote.get("shortName") or symbol)
    sector = str(quote.get("sector") or "Unknown")
    price = as_float(quote.get("regularMarketPrice")) or 0.0
    previous = as_float(quote.get("regularMarketPreviousClose"))
    change_pct = as_float(quote.get("regularMarketChangePercent"))
    if change_pct is None:
        change_pct = percent_change(price, previous)
    fifty_day = as_float(quote.get("fiftyDayAverage"))
    two_hundred_day = as_float(quote.get("twoHundredDayAverage"))
    monthly_trend = percent_change(price, fifty_day)
    quarterly_trend = percent_change(price, two_hundred_day)
    entry = UniverseEntry(symbol=symbol, name=name, sector=sector, indexes=("stock", region))
    dividend_yield = as_float(quote.get("dividendYield"))
    scores = score_strategies(
        entry,
        market_cap=as_float(quote.get("marketCap")),
        revenue_growth=None,
        operating_margins=None,
        gross_margins=None,
        free_cashflow=None,
        debt_to_equity=None,
        dividend_yield=dividend_yield,
        payout_ratio=None,
        beta=as_float(quote.get("beta")),
        volatility=abs(change_pct),
        weekly_trend=change_pct,
        monthly_trend=monthly_trend,
        quarterly_trend=quarterly_trend,
        relative_position=relative_position_from_range(price, as_float(quote.get("fiftyTwoWeekLow")), as_float(quote.get("fiftyTwoWeekHigh"))),
        volume_ratio=safe_ratio(as_float(quote.get("regularMarketVolume")), as_float(quote.get("averageDailyVolume3Month"))),
    )
    best_strategy = max(scores, key=scores.get)
    story = story_from_strategy(best_strategy=best_strategy, score=scores[best_strategy], revenue_growth=None, dividend_yield=dividend_yield, volatility=abs(change_pct), weekly_trend=change_pct)
    story = story.replace("weekly move", "daily move").replace("daily volatility", "session move")
    return {
        "symbol": symbol,
        "name": name,
        "sector": sector,
        "industry": quote.get("industry") or sector,
        "exchange": quote.get("exchange") or quote.get("fullExchangeName"),
        "quoteType": quote.get("quoteType"),
        "currency": quote.get("currency"),
        "marketCap": as_float(quote.get("marketCap")),
        "oneYearReturn": as_float(quote.get("fiftyTwoWeekChangePercent")),
        "indexes": ["stock", region],
        "price": round(price, 2),
        "changePct": round(change_pct, 2),
        "weeklyTrend": round(change_pct, 2),
        "sparkline": [],
        "recommendation": recommendation_from_best_strategy(best_strategy, scores[best_strategy]),
        "story": story,
        "strategyScores": {key: int(round(value)) for key, value in scores.items()},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
