from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pandas as pd

from internal.market.scoring import StrategyKey, confidence_from_score
from internal.market.symbol import fetch_symbol_record
from internal.market.technicals import (
    build_sparkline_points,
    build_technicals,
    extract_closes,
    return_over_window,
    year_to_date_return,
)
from internal.market.universe import get_live_records
from internal.store.cache import cache_get, cache_set
from internal.store.utils import as_float, normalize_statement_key, percent_value, recommendation_label, safe_dataframe_records, safe_dict
from internal.yahoo.client import fetch_history, fetch_news, fetch_sector, fetch_industry, load_ticker_modules, safe_call, ticker as make_ticker

DETAIL_TTL_SECONDS = 180
DOMAIN_TTL_SECONDS = 1800


def build_detail_bundle(symbol: str, strategy: StrategyKey) -> dict[str, Any] | None:
    cache_key = f"{symbol.upper()}:{strategy}"
    cached = cache_get("detail_bundle", cache_key)
    if cached is not None:
        return cached

    stock = fetch_symbol_record(symbol)
    if not stock:
        return None

    ticker = make_ticker(symbol)
    modules = load_ticker_modules(ticker, symbol)

    # yfinance.Ticker isn't thread-safe for concurrent attribute access - reusing
    # one instance across these futures made history()/financials silently come
    # back empty under load. Each concurrent call gets its own instance instead.
    with ThreadPoolExecutor(max_workers=4) as pool:
        history_future = pool.submit(lambda: fetch_history(make_ticker(symbol), period="5y"))
        news_future = pool.submit(lambda: fetch_news(make_ticker(symbol)))
        financials_future = pool.submit(lambda: build_financial_snapshot(make_ticker(symbol)))
        sector_future = pool.submit(lambda: fetch_sector_insight(stock.get("sectorKey") or stock.get("sector")))
        industry_future = pool.submit(lambda: fetch_industry_insight(stock.get("industryKey") or stock.get("industry") or ""))

        history = history_future.result()
        news = news_future.result()
        financials = financials_future.result()
        sector_insight = sector_future.result()
        industry_insight = industry_future.result()

    technicals = build_technicals(history)
    business = build_business_profile(modules, history, stock)
    performance = build_performance_profile(history)
    peers = build_peer_profile(stock, strategy, get_live_records())
    verdict = build_verdict(stock, business, performance, peers, strategy)
    outlook = build_outlook(business, performance, peers)
    sector_insight = sector_insight or fetch_sector_insight(stock.get("sectorKey") or stock.get("sector") or business.get("sector"))
    industry_insight = industry_insight or fetch_industry_insight(stock.get("industryKey") or stock.get("industry") or business.get("industry"))

    result = {
        "stock": stock,
        "history": serialize_history(history),
        "technicals": technicals,
        "news": news,
        "business": business,
        "financials": financials,
        "sectorInsight": sector_insight,
        "industryInsight": industry_insight,
        "performance": performance,
        "peerRank": peers,
        "verdict": verdict,
        "outlook": outlook,
        "strategy": strategy,
    }
    cache_set("detail_bundle", cache_key, result, DETAIL_TTL_SECONDS)
    return result


def build_business_profile(modules: dict[str, Any], history: pd.DataFrame, stock: dict[str, Any]) -> dict[str, Any]:
    from internal.market.records import merge_ticker_info

    if "summaryDetail" in modules or "price" in modules or "assetProfile" in modules:
        info = merge_ticker_info(modules, stock["symbol"])
    else:
        info = safe_dict(modules)
    closes = extract_closes(history)
    annual_return = return_over_window(closes, 252)
    two_year_return = return_over_window(closes, 504)
    three_year_return = return_over_window(closes, 756)
    four_year_return = return_over_window(closes, 1008)
    ytd_return = year_to_date_return(closes)

    return {
        "sector": info.get("sector") or stock.get("sector") or "Unknown",
        "industry": info.get("industry") or info.get("sector") or stock.get("sector") or "Unknown",
        "marketCap": as_float(info.get("marketCap")),
        "enterpriseValue": as_float(info.get("enterpriseValue")),
        "peRatio": as_float(info.get("trailingPE") or info.get("forwardPE")),
        "priceToBook": as_float(info.get("priceToBook")),
        "roe": percent_value(info.get("returnOnEquity")),
        "roa": percent_value(info.get("returnOnAssets")),
        "profitMargin": percent_value(info.get("profitMargins")),
        "operatingMargin": percent_value(info.get("operatingMargins")),
        "grossMargin": percent_value(info.get("grossMargins")),
        "revenueGrowth": percent_value(info.get("revenueGrowth")),
        "earningsGrowth": percent_value(info.get("earningsGrowth")),
        "dividendYield": percent_value(info.get("dividendYield")),
        "payoutRatio": percent_value(info.get("payoutRatio")),
        "debtToEquity": as_float(info.get("debtToEquity")),
        "beta": as_float(info.get("beta")) or as_float(info.get("beta3Year")),
        "ytdReturn": round(ytd_return, 2) if ytd_return is not None else None,
        "oneYearReturn": round(annual_return, 2) if annual_return is not None else None,
        "twoYearReturn": round(two_year_return, 2) if two_year_return is not None else None,
        "threeYearReturn": round(three_year_return, 2) if three_year_return is not None else None,
        "fourYearReturn": round(four_year_return, 2) if four_year_return is not None else None,
        "analystRating": recommendation_label(info.get("recommendationKey")),
        "analystScore": as_float(info.get("recommendationMean")),
        "targetMeanPrice": as_float(info.get("targetMeanPrice")),
        "currentPrice": stock.get("price"),
        "companySummary": info.get("longBusinessSummary") or info.get("longName") or stock.get("name"),
    }


def build_performance_profile(history: pd.DataFrame) -> dict[str, Any]:
    from internal.market.scoring import clamp

    closes = extract_closes(history)
    returns = {
        "ytd": round(year_to_date_return(closes) or 0.0, 2),
        "1y": round(return_over_window(closes, 252) or 0.0, 2),
        "2y": round(return_over_window(closes, 504) or 0.0, 2),
        "3y": round(return_over_window(closes, 756) or 0.0, 2),
        "4y": round(return_over_window(closes, 1008) or 0.0, 2),
    }
    trend = "positive" if returns["1y"] > 0 else "negative" if returns["1y"] < 0 else "flat"
    momentum_score = clamp(50 + returns["1y"] * 1.4 + returns["ytd"] * 1.1)
    return {
        "trend": trend,
        "momentumScore": int(round(momentum_score)),
        "returns": returns,
        "line": build_sparkline_points(closes, 24),
    }


def build_peer_profile(stock: dict[str, Any], strategy: StrategyKey, live_records: list[dict[str, Any]]) -> dict[str, Any]:
    sector = (stock.get("sector") or "Unknown").lower()
    live_records = [item for item in live_records if (item.get("sector") or "").lower() == sector]
    scored = sorted(
        (
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "score": float(item.get("strategyScores", {}).get(strategy, 0)),
            }
            for item in live_records
        ),
        key=lambda item: (item["score"], item["symbol"]),
        reverse=True,
    )
    rank = next((index + 1 for index, item in enumerate(scored) if item["symbol"] == stock["symbol"]), 1)
    return {
        "sector": stock.get("sector") or "Unknown",
        "count": len(live_records),
        "rank": rank,
        "isNo1": rank == 1,
        "leader": scored[0]["symbol"] if scored else stock["symbol"],
        "leaderScore": scored[0]["score"] if scored else float(stock["strategyScores"].get(strategy, 0)),
    }


def build_verdict(
    stock: dict[str, Any],
    business: dict[str, Any],
    performance: dict[str, Any],
    peers: dict[str, Any],
    strategy: StrategyKey,
) -> dict[str, Any]:
    score = int(stock["strategyScores"].get(strategy, 0))
    analyst = business.get("analystRating") or "Hold"
    if score >= 80 and performance["returns"]["1y"] > 0 and peers["isNo1"]:
        action = "BUY"
        headline = f"{stock['symbol']} looks like a primary leader in {peers['sector']}."
    elif score >= 62:
        action = "WAIT"
        headline = f"{stock['symbol']} is decent, but the setup still needs confirmation."
    else:
        action = "PASS"
        headline = f"{stock['symbol']} still lacks enough conviction for a clean entry."
    return {
        "action": action,
        "headline": headline,
        "analyst": analyst,
        "confidence": confidence_from_score(score),
        "score": score,
    }


def build_outlook(business: dict[str, Any], performance: dict[str, Any], peers: dict[str, Any]) -> dict[str, Any]:
    revenue_growth = business.get("revenueGrowth")
    earnings_growth = business.get("earningsGrowth")
    one_year = performance["returns"]["1y"]
    ytd = performance["returns"]["ytd"]
    summary = (
        f"Revenue growth is {format_optional(revenue_growth)} and earnings growth is {format_optional(earnings_growth)}. "
        f"YTD return is {ytd:.2f}% while the 1Y return sits at {one_year:.2f}%."
    )
    bull = "The business still has room if margins stay steady and the market keeps rewarding quality."
    bear = "If growth slows or the valuation contracts, the setup can lose momentum quickly."
    if peers["isNo1"]:
        bull = "It is currently the top-ranked name in this sector watchlist, which gives it real leadership weight."
    return {
        "summary": summary,
        "bull": bull,
        "bear": bear,
        "industryLeader": peers["isNo1"],
    }


def format_optional(value: Any) -> str:
    number = as_float(value)
    if number is None:
        return "n/a"
    if abs(number) >= 100:
        return f"{number:,.0f}"
    return f"{number:.2f}"


def domain_key_candidates(value: str) -> list[str]:
    from internal.store.utils import slugify_index

    raw = str(value or "").strip().lower()
    if not raw:
        return []
    candidates = [raw, slugify_index(raw), slugify_index(raw).replace("_", "-"), raw.replace(" ", "-")]
    seen: set[str] = set()
    ordered: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
    return ordered


def fetch_sector_insight(key: str) -> dict[str, Any] | None:
    for candidate in domain_key_candidates(key):
        cache_key = f"sector:{candidate}"
        cached = cache_get("domain", cache_key)
        if cached is not None:
            return cached
        try:
            sector = fetch_sector(candidate)
            industries = safe_dataframe_records(getattr(sector, "industries", None))
            top_etfs = safe_dict(getattr(sector, "top_etfs", {}))
            top_mutual_funds = safe_dict(getattr(sector, "top_mutual_funds", {}))
            if not industries and not top_etfs and not top_mutual_funds:
                continue
            result = {
                "key": candidate,
                "industries": industries,
                "topEtfs": [{"symbol": symbol, "name": name} for symbol, name in top_etfs.items()],
                "topMutualFunds": [{"symbol": symbol, "name": name} for symbol, name in top_mutual_funds.items()],
            }
            cache_set("domain", cache_key, result, DOMAIN_TTL_SECONDS)
            return result
        except Exception:
            continue
    return None


def fetch_industry_insight(key: str) -> dict[str, Any] | None:
    for candidate in domain_key_candidates(key):
        cache_key = f"industry:{candidate}"
        cached = cache_get("domain", cache_key)
        if cached is not None:
            return cached
        try:
            industry = fetch_industry(candidate)
            top_performing = safe_dataframe_records(getattr(industry, "top_performing_companies", None))
            top_growth = safe_dataframe_records(getattr(industry, "top_growth_companies", None))
            if not top_performing and not top_growth:
                continue
            result = {
                "key": candidate,
                "sectorKey": getattr(industry, "sector_key", None),
                "sectorName": getattr(industry, "sector_name", None),
                "topPerformingCompanies": top_performing,
                "topGrowthCompanies": top_growth,
            }
            cache_set("domain", cache_key, result, DOMAIN_TTL_SECONDS)
            return result
        except Exception:
            continue
    return None


def build_financial_snapshot(ticker) -> dict[str, Any]:
    return {
        "incomeStatement": statement_bundle(safe_call(ticker.get_income_stmt, pretty=True, freq="yearly")),
        "quarterlyIncomeStatement": statement_bundle(safe_call(ticker.get_income_stmt, pretty=True, freq="quarterly")),
        "balanceSheet": statement_bundle(safe_call(ticker.get_balance_sheet, pretty=True, freq="yearly")),
        "quarterlyBalanceSheet": statement_bundle(safe_call(ticker.get_balance_sheet, pretty=True, freq="quarterly")),
        "cashFlow": statement_bundle(safe_call(ticker.get_cash_flow, pretty=True, freq="yearly")),
        "quarterlyCashFlow": statement_bundle(safe_call(ticker.get_cash_flow, pretty=True, freq="quarterly")),
        "earnings": safe_dataframe_records(safe_call(ticker.get_earnings)),
        "calendar": safe_dict(safe_call(ticker.get_calendar)),
        "secFilings": safe_dict(safe_call(ticker.get_sec_filings)),
    }


def statement_bundle(frame: Any) -> dict[str, Any]:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return {"latest": {}, "history": []}

    latest_column = frame.columns[0]
    latest_series = frame[latest_column]
    wanted = {
        "Revenue": ("total revenue", "revenue"),
        "Gross Profit": ("gross profit",),
        "Operating Income": ("operating income",),
        "Net Income": ("net income",),
        "Total Assets": ("total assets",),
        "Total Liabilities": ("total liabilities", "total liabilities net minority interest"),
        "Total Debt": ("total debt",),
        "Operating Cash Flow": ("operating cash flow",),
        "Free Cash Flow": ("free cash flow",),
        "Capital Expenditure": ("capital expenditure",),
    }
    latest: dict[str, Any] = {}
    for label, aliases in wanted.items():
        value = statement_value(latest_series, *aliases)
        if value is not None:
            latest[label] = value

    history: list[dict[str, Any]] = []
    for column in list(frame.columns)[:4]:
        series = frame[column]
        history.append(
            {
                "period": normalize_statement_period(column),
                "revenue": statement_value(series, "total revenue", "revenue"),
                "netIncome": statement_value(series, "net income"),
                "operatingIncome": statement_value(series, "operating income"),
                "freeCashFlow": statement_value(series, "free cash flow"),
            }
        )
    return {"latest": latest, "history": history}


def statement_value(series: pd.Series, *aliases: str) -> float | None:
    if series is None or series.empty:
        return None
    normalized_aliases = {normalize_statement_key(alias) for alias in aliases}
    for label, value in series.items():
        if normalize_statement_key(str(label)) in normalized_aliases:
            return as_float(value)
    return None


def normalize_statement_period(value: Any) -> str:
    if hasattr(value, "to_pydatetime"):
        return value.to_pydatetime().date().isoformat()
    return str(value)


def serialize_history(history: pd.DataFrame) -> list[dict[str, Any]]:
    if history.empty:
        return []

    frame = history.tail(120).copy()
    rows: list[dict[str, Any]] = []
    for index, row in frame.iterrows():
        rows.append(
            {
                "date": index.to_pydatetime().date().isoformat() if hasattr(index, "to_pydatetime") else str(index),
                "open": round(float(row["Open"]), 2) if pd.notna(row.get("Open")) else None,
                "high": round(float(row["High"]), 2) if pd.notna(row.get("High")) else None,
                "low": round(float(row["Low"]), 2) if pd.notna(row.get("Low")) else None,
                "close": round(float(row["Close"]), 2) if pd.notna(row.get("Close")) else None,
                "volume": round(float(row["Volume"]), 0) if "Volume" in row and pd.notna(row.get("Volume")) else None,
            }
        )
    return rows
