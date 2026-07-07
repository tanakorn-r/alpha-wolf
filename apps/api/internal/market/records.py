from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from internal.market.scoring import (
    StrategyKey,
    recommendation_from_best_strategy,
    score_strategies,
    story_from_strategy,
)
from internal.market.technicals import (
    daily_volatility,
    extract_closes,
    relative_position_from_range,
    return_over_window,
    safe_ratio,
)
from internal.store.utils import as_float, percent_value, safe_dict, slugify_index
from internal.yahoo.client import fetch_history, load_ticker_modules, ticker as make_ticker
from models import UniverseEntry


def module_payload(modules: dict[str, Any], name: str, symbol: str | None = None) -> dict[str, Any]:
    container: dict[str, Any] = modules
    if symbol and isinstance(modules.get(symbol), dict):
        container = safe_dict(modules[symbol])
    return safe_dict(container.get(name, {}))


def merge_ticker_info(modules: dict[str, Any], symbol: str) -> dict[str, Any]:
    summary_detail = module_payload(modules, "summaryDetail", symbol)
    summary_profile = module_payload(modules, "summaryProfile", symbol)
    asset_profile = module_payload(modules, "assetProfile", symbol)
    financial_data = module_payload(modules, "financialData", symbol)
    price = module_payload(modules, "price", symbol)
    quote_type = module_payload(modules, "quoteType", symbol)
    calendar_events = module_payload(modules, "calendarEvents", symbol)

    info: dict[str, Any] = {}
    info.update(price)
    info.update(summary_detail)
    info.update(financial_data)
    info.update(asset_profile)
    info.update(summary_profile)
    info.update(calendar_events)
    if quote_type:
        info.update(quote_type)

    # Each (field, fallback sources in priority order) pair below replaces what
    # used to be ~90 lines of repeated `if not info.get(x): info[x] = ...`.
    fallbacks: tuple[tuple[str, tuple[dict[str, Any], ...], tuple[str, ...]], ...] = (
        ("shortName", (info,), ("longName", "name")),
        ("longBusinessSummary", (info,), ("longName",)),
        ("sector", (asset_profile, summary_profile), ()),
        ("industry", (asset_profile, summary_profile), ("sector",)),
        ("marketCap", (price, summary_detail), ()),
        ("regularMarketPrice", (price,), ("currentPrice",)),
        ("currentPrice", (price,), ("regularMarketPrice",)),
        ("regularMarketPreviousClose", (price,), ()),
        ("recommendationKey", (financial_data, summary_detail), ()),
        ("recommendationMean", (financial_data, summary_detail), ()),
        ("targetMeanPrice", (financial_data, summary_detail), ()),
        ("dividendYield", (summary_detail,), ()),
        ("dividendRate", (summary_detail,), ()),
        ("exDividendDate", (summary_detail, calendar_events), ()),
        ("dividendDate", (summary_detail, calendar_events), ()),
        ("payoutRatio", (summary_detail,), ()),
        ("beta", (price, summary_detail), ()),
        ("beta3Year", (summary_detail,), ()),
        ("regularMarketVolume", (price,), ()),
        ("averageVolume", (summary_detail, price), ()),
        ("fiftyTwoWeekHigh", (summary_detail,), ()),
        ("fiftyTwoWeekLow", (summary_detail,), ()),
        ("enterpriseValue", (summary_detail,), ()),
        ("trailingPE", (summary_detail,), ()),
        ("forwardPE", (summary_detail,), ()),
        ("priceToBook", (summary_detail,), ()),
        ("returnOnEquity", (financial_data, summary_detail), ()),
        ("returnOnAssets", (financial_data, summary_detail), ()),
        ("profitMargins", (financial_data, summary_detail), ()),
        ("operatingMargins", (financial_data, summary_detail), ()),
        ("grossMargins", (financial_data, summary_detail), ()),
        ("revenueGrowth", (financial_data, summary_detail), ()),
        ("earningsGrowth", (financial_data, summary_detail), ()),
        ("debtToEquity", (financial_data, summary_detail), ()),
        ("freeCashflow", (financial_data, summary_detail), ()),
        ("longBusinessSummary", (summary_profile, asset_profile, summary_detail), ("shortName",)),
    )
    for field, sources, info_fallback_fields in fallbacks:
        if info.get(field):
            continue
        for source in sources:
            if source.get(field):
                info[field] = source[field]
                break
        if not info.get(field):
            for fallback_field in info_fallback_fields:
                if info.get(fallback_field):
                    info[field] = info[fallback_field]
                    break
    if not info.get("shortName"):
        info["shortName"] = symbol
    if not info.get("longBusinessSummary"):
        info["longBusinessSummary"] = info.get("shortName") or symbol
    if not info.get("quoteType") and quote_type:
        info["quoteType"] = quote_type.get("quoteType") or quote_type.get("quote_type")
    if not info.get("sector"):
        info["sector"] = "Unknown"
    if not info.get("industry"):
        info["industry"] = info.get("sector") or "Unknown"

    return info


def build_entry_from_info(symbol: str, info: dict[str, Any]) -> UniverseEntry:
    name = (
        info.get("shortName")
        or info.get("longName")
        or info.get("displayName")
        or info.get("name")
        or symbol
    )
    sector = str(info.get("sector") or "Unknown")
    quote_type = str(info.get("quoteType") or "").upper()
    indexes = {slugify_index(sector)}
    type_index = {
        "ETF": "etf",
        "MUTUALFUND": "mutualfund",
        "MUTUAL_FUND": "mutualfund",
        "CURRENCY": "currency",
        "CRYPTOCURRENCY": "cryptocurrency",
        "INDEX": "index",
        "FUTURE": "future",
    }.get(quote_type)
    if type_index:
        indexes.add(type_index)
    return UniverseEntry(
        symbol=symbol,
        name=str(name),
        sector=sector,
        indexes=tuple(sorted(indexes)) or ("live",),
    )


def fetch_record_from_ticker(
    entry: UniverseEntry,
    *,
    ticker: yf.Ticker,
    info: dict[str, Any] | None = None,
    history=None,
) -> dict[str, Any]:
    info = safe_dict(info or merge_ticker_info(load_ticker_modules(ticker, entry.symbol), entry.symbol))
    history = history if history is not None else fetch_history(ticker)

    closes = extract_closes(history)
    price = resolve_price(info, closes)
    previous_close = resolve_previous_close(info, closes)
    change_pct = percent_change(price, previous_close)
    weekly_trend = return_over_window(closes, 5)
    monthly_trend = return_over_window(closes, 21)
    quarterly_trend = return_over_window(closes, 63)
    volatility = daily_volatility(closes)
    high_52 = as_float(info.get("fiftyTwoWeekHigh"))
    low_52 = as_float(info.get("fiftyTwoWeekLow"))
    relative_position = relative_position_from_range(price, low_52, high_52)

    market_cap = as_float(info.get("marketCap"))
    one_year_return = percent_value(info.get("fiftyTwoWeekChangePercent"))
    pe_ratio = as_float(info.get("trailingPE")) or as_float(info.get("forwardPE"))
    price_to_book = as_float(info.get("priceToBook"))
    return_on_equity = percent_value(info.get("returnOnEquity"))
    return_on_assets = percent_value(info.get("returnOnAssets"))
    profit_margins = percent_value(info.get("profitMargins"))
    revenue_growth = percent_value(info.get("revenueGrowth"))
    operating_margins = percent_value(info.get("operatingMargins"))
    gross_margins = percent_value(info.get("grossMargins"))
    free_cashflow = as_float(info.get("freeCashflow"))
    debt_to_equity = as_float(info.get("debtToEquity"))
    dividend_yield = as_float(info.get("dividendYield"))
    payout_ratio = percent_value(info.get("payoutRatio"))
    beta = as_float(info.get("beta")) or as_float(info.get("beta3Year"))
    volume = as_float(info.get("regularMarketVolume"))
    avg_volume = as_float(info.get("averageVolume"))
    volume_ratio = safe_ratio(volume, avg_volume)

    strategy_scores = score_strategies(
        entry,
        market_cap=market_cap,
        revenue_growth=revenue_growth,
        operating_margins=operating_margins,
        gross_margins=gross_margins,
        free_cashflow=free_cashflow,
        debt_to_equity=debt_to_equity,
        dividend_yield=dividend_yield,
        payout_ratio=payout_ratio,
        beta=beta,
        volatility=volatility,
        weekly_trend=weekly_trend,
        monthly_trend=monthly_trend,
        quarterly_trend=quarterly_trend,
        relative_position=relative_position,
        volume_ratio=volume_ratio,
        one_year_return=one_year_return,
        pe_ratio=pe_ratio,
        price_to_book=price_to_book,
        return_on_equity=return_on_equity,
        return_on_assets=return_on_assets,
        profit_margins=profit_margins,
    )
    best_strategy: StrategyKey = max(strategy_scores, key=strategy_scores.get)  # type: ignore[arg-type]
    score = strategy_scores[best_strategy]
    recommendation = recommendation_from_best_strategy(best_strategy, score)
    story = story_from_strategy(
        best_strategy=best_strategy,
        score=score,
        revenue_growth=revenue_growth,
        dividend_yield=dividend_yield,
        volatility=volatility,
        weekly_trend=weekly_trend,
    )
    name = info.get("shortName") or info.get("longName") or entry.name
    sector = info.get("sector") or entry.sector

    return {
        "symbol": entry.symbol,
        "name": name,
        "sector": sector,
        "industry": info.get("industry") or sector,
        "sectorKey": info.get("sectorKey"),
        "industryKey": info.get("industryKey"),
        "exchange": info.get("exchange"),
        "market": info.get("market"),
        "currency": info.get("currency"),
        "marketCap": market_cap,
        "indexes": list(entry.indexes),
        "price": round(price, 2),
        "changePct": round(change_pct, 2),
        "weeklyTrend": round(weekly_trend, 2),
        "sparkline": [round(float(value), 4) for value in closes.tail(30).tolist()],
        "recommendation": recommendation,
        "story": story,
        "strategyScores": {key: int(round(value)) for key, value in strategy_scores.items()},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def fetch_record(entry: UniverseEntry) -> dict[str, Any]:
    return fetch_record_from_ticker(entry, ticker=make_ticker(entry.symbol))


def resolve_price(info: dict[str, Any], closes) -> float:
    for key in ("lastPrice", "regularMarketPrice", "currentPrice"):
        price = as_float(info.get(key))
        if price:
            return price
    if not closes.empty:
        return float(closes.iloc[-1])
    raise ValueError("No live price available")


def resolve_previous_close(info: dict[str, Any], closes) -> float | None:
    for key in ("previousClose", "regularMarketPreviousClose"):
        previous = as_float(info.get(key))
        if previous:
            return previous
    if len(closes) >= 2:
        return float(closes.iloc[-2])
    return None


def percent_change(current: float, previous: float | None) -> float:
    if not previous:
        return 0.0
    return ((current - previous) / previous) * 100.0
