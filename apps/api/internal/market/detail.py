from __future__ import annotations

from typing import Any
import warnings
import pandas as pd

from internal.market.scoring import StrategyKey, clamp, confidence_from_score
from internal.market.symbol import fetch_symbol_record
from internal.market.technicals import (
    build_sparkline_points,
    build_technicals,
    extract_closes,
    return_over_window,
    year_to_date_return,
)
from internal.market.catalog import get_industry_peers
from internal.store.cache import cache_compute_lock, cache_get, cache_set
from internal.store.yahoo_cache import load_yahoo_data, save_yahoo_data
from internal.store.utils import as_float, normalize_statement_key, percent_value, recommendation_label, safe_dataframe_records, safe_dict
from internal.news.kaohoon import market_news as fetch_kaohoon_news
from internal.yahoo.client import fetch_dividends, fetch_history, fetch_news, fetch_sector, fetch_industry, load_ticker_modules, safe_call, ticker as make_ticker

DETAIL_CACHE_NAMESPACE = "stock_detail"
FINANCIALS_CACHE_NAMESPACE = "stock_financials"
INSIGHTS_CACHE_NAMESPACE = "stock_insights"
MARKET_COMPARISON_CACHE_NAMESPACE = "stock_market_comparison"
DOMAIN_CACHE_NAMESPACE = "domain"

DETAIL_TTL_SECONDS = 180
DOMAIN_TTL_SECONDS = 1800


def build_detail_bundle(symbol: str, strategy: StrategyKey, *, mode: str | None = None) -> dict[str, Any] | None:
    selected_mode = mode if mode in {"swing", "day", "long", "value", "fomo"} else None
    cache_key = f"{symbol.upper()}:{strategy}:{selected_mode or 'default'}"
    cached = cache_get(DETAIL_CACHE_NAMESPACE, cache_key)
    if cached is not None:
        return cached

    with cache_compute_lock(DETAIL_CACHE_NAMESPACE, cache_key):
        cached = cache_get(DETAIL_CACHE_NAMESPACE, cache_key)
        if cached is not None:
            return cached
        result = _build_detail_bundle_uncached(symbol, strategy, selected_mode=selected_mode)
        if result is not None:
            cache_set(DETAIL_CACHE_NAMESPACE, cache_key, result, DETAIL_TTL_SECONDS)
        return result


def _build_detail_bundle_uncached(
    symbol: str,
    strategy: StrategyKey,
    *,
    selected_mode: str | None,
) -> dict[str, Any] | None:

    stock = fetch_symbol_record(symbol)
    if not stock:
        return None

    ticker = make_ticker(symbol)

    # Fetch yfinance data in parallel — modules, history, news, dividends are
    # all independent network calls and used to take 4-6 s sequentially.
    from concurrent.futures import ThreadPoolExecutor, as_completed as _as_completed

    def _modules():
        return load_ticker_modules(ticker, symbol)

    def _history():
        return fetch_history(ticker, period="5y")

    def _news():
        return fetch_news(ticker)

    def _dividends():
        return fetch_dividends(ticker, period="5y")

    modules = {}
    history = pd.DataFrame()
    raw_news: list = []
    dividends = None

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {
            pool.submit(_modules): "modules",
            pool.submit(_history): "history",
            pool.submit(_news): "news",
            pool.submit(_dividends): "dividends",
        }
        for fut in _as_completed(futs):
            key = futs[fut]
            try:
                val = fut.result()
            except Exception as exc:
                print(f"Warning: {key} fetch failed for {symbol}: {exc}")
                val = {} if key == "modules" else pd.DataFrame() if key in ("history", "dividends") else []
            if key == "modules":
                modules = val
            elif key == "history":
                history = val
            elif key == "news":
                raw_news = val
            elif key == "dividends":
                dividends = val

    news = merge_thai_market_news(raw_news, symbol)

    technicals = build_technicals(history)
    business = build_business_profile(modules, history, stock)
    performance = build_performance_profile(history)
    peers = build_peer_profile(stock, business, strategy)
    verdict = build_verdict(stock, business, performance, peers, strategy, technicals, history=history, mode=selected_mode)
    outlook = build_outlook(business, performance, peers)
    dividend_pattern = build_dividend_dip_pattern(history, dividends)

    result = {
        "stock": stock,
        "history": serialize_history(history),
        "technicals": technicals,
        "news": news,
        "business": business,
        "performance": performance,
        "peerRank": peers,
        "verdict": verdict,
        "outlook": outlook,
        "strategy": strategy,
        "mode": selected_mode,
        "dividendPattern": dividend_pattern,
    }
    return result


def get_financials(symbol: str) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    if not normalized:
        return None

    cache_key = normalized
    cached = cache_get(FINANCIALS_CACHE_NAMESPACE, cache_key)
    if cached is not None:
        return cached
    persistent = load_yahoo_data(normalized, "financials", "full")
    if persistent and persistent.is_fresh and isinstance(persistent.payload, dict):
        cache_set(FINANCIALS_CACHE_NAMESPACE, cache_key, persistent.payload, DETAIL_TTL_SECONDS)
        return persistent.payload

    # 1. Mute the Deprecation warning completely
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=DeprecationWarning)
        
        ticker = make_ticker(normalized)
        try:
            # Try your standard snapshot construction first
            result = build_financial_snapshot(ticker)
        except Exception:
            # 2. Hard Root Cause Intercept: Yahoo API doesn't have BBL.BK snapshot modules.
            # Instead of crashing or passing dummy data, pull the raw Income Statement table.
            try:
                # Fallback to direct financial statements parsing if summary endpoint returns 404
                income_stmt = ticker.income_stmt
                balance_sheet = ticker.balance_sheet
                
                # Dynamically construct metrics directly out of the statement dataframes
                result = {
                    "peRatio": ticker.info.get("trailingPE") if hasattr(ticker, "info") else None,
                    "profitMargin": (income_stmt.loc["Net Income Loss"].iloc[0] / income_stmt.loc["Total Revenue"].iloc[0] * 100) if "Net Income Loss" in income_stmt.index else None,
                    "revenueGrowth": None, # Non-US tickers might miss structural growth estimates
                    "debtToEquity": (balance_sheet.loc["Total Debt"].iloc[0] / balance_sheet.loc["Stockholders Equity"].iloc[0] * 100) if "Total Debt" in balance_sheet.index else None,
                    "currentRatio": (balance_sheet.loc["Current Assets"].iloc[0] / balance_sheet.loc["Current Liabilities"].iloc[0]) if "Current Assets" in balance_sheet.index else None,
                    "source": "raw_statement_fallback"
                }
            except Exception:
                # If even the raw spreadsheets do not exist on Yahoo for this asset, 
                # we must return None cleanly so OpenAI knows there are no fundamentals.
                result = None

    if _has_research_data(result):
        save_yahoo_data(normalized, "financials", result, period="full", ttl_seconds=21_600)
        cache_set(FINANCIALS_CACHE_NAMESPACE, cache_key, result, DETAIL_TTL_SECONDS)
        return result
    return persistent.payload if persistent and isinstance(persistent.payload, dict) else result


def get_ai_financials(symbol: str) -> dict[str, Any] | None:
    """Small, parallel financial pack for model context.

    The full financial endpoint makes many Yahoo calls for UI drill-down tables. AI analysis
    needs the core statements, dividend history, calendar, and analyst targets—not every raw
    estimate/recommendation table—so keep that expensive path out of interactive AI requests.
    """
    normalized = symbol.upper().strip()
    if not normalized:
        return None

    cache_key = f"ai:v1:{normalized}"
    cached = cache_get(FINANCIALS_CACHE_NAMESPACE, cache_key)
    if cached is not None:
        return cached
    persistent = load_yahoo_data(normalized, "financials", "ai")
    if persistent and persistent.is_fresh and isinstance(persistent.payload, dict):
        cache_set(FINANCIALS_CACHE_NAMESPACE, cache_key, persistent.payload, DOMAIN_TTL_SECONDS)
        return persistent.payload

    ticker = make_ticker(normalized)
    result = build_ai_financial_snapshot(ticker)
    if _has_research_data(result):
        save_yahoo_data(normalized, "financials", result, period="ai", ttl_seconds=21_600)
        cache_set(FINANCIALS_CACHE_NAMESPACE, cache_key, result, DOMAIN_TTL_SECONDS)
        return result
    return persistent.payload if persistent and isinstance(persistent.payload, dict) else result

def get_domain_insights(symbol: str) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    if not normalized:
        return None

    cached = cache_get(INSIGHTS_CACHE_NAMESPACE, normalized)
    if cached is not None:
        return cached
    persistent = load_yahoo_data(normalized, "domain_insights")
    if persistent and persistent.is_fresh and isinstance(persistent.payload, dict):
        cache_set(INSIGHTS_CACHE_NAMESPACE, normalized, persistent.payload, DOMAIN_TTL_SECONDS)
        return persistent.payload

    from internal.market.symbol import fetch_symbol_record

    stock = fetch_symbol_record(normalized)
    if not stock:
        return persistent.payload if persistent and isinstance(persistent.payload, dict) else None
    sector_insight = fetch_sector_insight(stock.get("sectorKey") or stock.get("sector") or "")
    industry_insight = fetch_industry_insight(stock.get("industryKey") or stock.get("industry") or "")
    result = {"sectorInsight": sector_insight, "industryInsight": industry_insight}
    if _has_research_data(result):
        save_yahoo_data(normalized, "domain_insights", result, ttl_seconds=21_600)
    elif persistent and isinstance(persistent.payload, dict):
        return persistent.payload
    cache_set(INSIGHTS_CACHE_NAMESPACE, normalized, result, DOMAIN_TTL_SECONDS)
    return result


def get_market_comparison(symbol: str) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    cache_key = f"market_comparison:v5:{normalized}"
    cached = cache_get(MARKET_COMPARISON_CACHE_NAMESPACE, cache_key)
    if cached is not None:
        return cached
    stock = fetch_symbol_record(normalized)
    if not stock:
        return None
    from internal.market.records import merge_ticker_info
    info = merge_ticker_info(load_ticker_modules(make_ticker(normalized), normalized), normalized)
    region = "th" if normalized.endswith(".BK") else "us"
    industry = str(info.get("industry") or "")
    candidates = [
        item
        for item in get_industry_peers(region, industry)
        if not _same_symbol(str(item.get("symbol") or ""), normalized)
    ]
    candidates.sort(key=lambda item: str(item.get("symbol") or ""))
    candidates.sort(
        key=lambda item: item.get("oneYearReturn") if item.get("oneYearReturn") is not None else float("-inf"),
        reverse=True,
    )
    peer_candidates = candidates[:1]
    if not peer_candidates:
        return None
    stock_series = _monthly_rebased(fetch_history(make_ticker(normalized), period="1y"))
    benchmark_symbol, benchmark_name, benchmark_series = _best_benchmark_series(region)
    peer_series_values = [
        _monthly_rebased(fetch_history(make_ticker(str(item["symbol"])), period="1y"))
        for item in peer_candidates
    ]
    series = [stock_series, benchmark_series, *peer_series_values]
    peer_index = max(range(2, len(series)), key=lambda index: list(series[index].values())[-1] if series[index] else float("-inf"))
    peer = peer_candidates[peer_index - 2]
    peer_series = series[peer_index]
    common_dates = sorted(set(series[0]) & set(series[1]) & set(peer_series))
    if len(common_dates) < 2:
        return None
    points = [{"date": date, "stock": series[0][date], "benchmark": series[1][date], "peer": peer_series[date]} for date in common_dates]
    result = {
        "stock": {"symbol": normalized, "name": stock.get("name") or normalized, "returnPct": round(points[-1]["stock"] - 100, 2)},
        "benchmark": {"symbol": benchmark_symbol, "name": benchmark_name, "returnPct": round(points[-1]["benchmark"] - 100, 2)},
        "peer": {"symbol": peer["symbol"], "name": peer.get("name") or peer["symbol"], "returnPct": round(points[-1]["peer"] - 100, 2)},
        "points": points,
    }
    cache_set(MARKET_COMPARISON_CACHE_NAMESPACE, cache_key, result, DOMAIN_TTL_SECONDS)
    return result


def _monthly_rebased(history: pd.DataFrame) -> dict[str, float]:
    closes = extract_closes(history)
    if closes.empty:
        return {}
    monthly = closes.resample("ME").last().dropna()
    if monthly.empty or not float(monthly.iloc[0]):
        return {}
    base = float(monthly.iloc[0])
    return {index.strftime("%Y-%m"): round(float(value) / base * 100, 2) for index, value in monthly.items()}


def _same_symbol(left: str, right: str) -> bool:
    return left.upper().strip() == right.upper().strip()


def _best_benchmark_series(region: str) -> tuple[str, str, dict[str, float]]:
    options = (
        (("^SET.BK", "SET Index"), ("TDEX.BK", "SET market proxy"))
        if region == "th"
        else (("^GSPC", "S&P 500"), ("SPY", "S&P 500 ETF proxy"))
    )
    fallback: tuple[str, str, dict[str, float]] | None = None
    for symbol, name in options:
        series = _monthly_rebased(fetch_history(make_ticker(symbol), period="1y"))
        value = (symbol, name, series)
        if fallback is None:
            fallback = value
        if len(series) >= 2:
            return value
    return fallback or (options[0][0], options[0][1], {})


def build_business_profile(modules: dict[str, Any], history: pd.DataFrame, stock: dict[str, Any]) -> dict[str, Any]:
    from internal.market.records import merge_ticker_info

    info = merge_ticker_info(modules, stock["symbol"])
    closes = extract_closes(history)
    annual_return = return_over_window(closes, 252)
    two_year_return = return_over_window(closes, 504)
    three_year_return = return_over_window(closes, 756)
    four_year_return = return_over_window(closes, 1008)
    ytd_return = year_to_date_return(closes)

    return {
        "sector": info.get("sector") or stock.get("sector") or "Unknown",
        "industry": info.get("industry") or info.get("sector") or stock.get("sector") or "Unknown",
        "sectorKey": info.get("sectorKey"),
        "industryKey": info.get("industryKey"),
        "market": info.get("market"),
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
        "dividendYield": as_float(info.get("dividendYield")),
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


def build_dividend_dip_pattern(history: pd.DataFrame, dividends: pd.Series) -> dict[str, Any]:
    """Checks whether price tends to dip in the days after each ex-dividend date -
    the signal the user wants DCA timing to key off of ("buy the post-dividend dip")
    instead of just buying on a fixed schedule."""
    if history.empty or dividends is None or dividends.empty or "Close" not in history.columns:
        return {"hasPattern": False, "sampleSize": 0, "averageDipPct": None, "hitRate": None}

    closes = history["Close"].dropna()
    deltas: list[float] = []
    for ex_date in dividends.index:
        before = closes[closes.index <= ex_date]
        after = closes[(closes.index > ex_date) & (closes.index <= ex_date + pd.Timedelta(days=10))]
        if before.empty or after.empty:
            continue
        pre_price = float(before.iloc[-1])
        post_low = float(after.min())
        if pre_price:
            deltas.append((post_low - pre_price) / pre_price * 100.0)

    if not deltas:
        return {"hasPattern": False, "sampleSize": 0, "averageDipPct": None, "hitRate": None}

    average_dip = sum(deltas) / len(deltas)
    hit_rate = sum(1 for delta in deltas if delta < 0) / len(deltas) * 100.0
    return {
        "hasPattern": average_dip < -0.3 and hit_rate >= 55,
        "sampleSize": len(deltas),
        "averageDipPct": round(average_dip, 2),
        "hitRate": round(hit_rate, 1),
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


def build_peer_profile(stock: dict[str, Any], business: dict[str, Any], strategy: StrategyKey) -> dict[str, Any]:
    region = "th" if str(stock.get("symbol") or "").endswith(".BK") else "us"
    industry = str(business.get("industry") or "")
    try:
        live_records = get_industry_peers(region, industry) if industry and industry != "Unknown" else []
    except Exception:
        live_records = []
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
    rank = next((index + 1 for index, item in enumerate(scored) if item["symbol"] == stock["symbol"]), None)
    return {
        "sector": business.get("sector") or stock.get("sector") or "Unknown",
        "industry": industry or "Unknown",
        "count": len(live_records),
        "rank": rank,
        "isNo1": rank == 1 if rank is not None else False,
        "leader": scored[0]["symbol"] if scored else None,
        "leaderScore": scored[0]["score"] if scored else None,
    }


def build_verdict(
    stock: dict[str, Any],
    business: dict[str, Any],
    performance: dict[str, Any],
    peers: dict[str, Any],
    strategy: StrategyKey,
    technicals: dict[str, Any],
    *,
    history: pd.DataFrame | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    strategy_score = int(stock["strategyScores"].get(strategy, 0))
    analyst = business.get("analystRating") or "Hold"
    price = as_float(stock.get("price")) or as_float(business.get("currentPrice")) or 0
    rsi = as_float(technicals.get("rsi14"))
    macd = as_float(technicals.get("macd"))
    macd_signal = as_float(technicals.get("macdSignal"))
    macd_hist = as_float(technicals.get("macdHistogram"))
    sma20 = as_float(technicals.get("sma20"))
    sma50 = as_float(technicals.get("sma50"))
    sma200 = as_float(technicals.get("sma200"))
    support = as_float(technicals.get("support"))
    resistance = as_float(technicals.get("resistance"))
    volume_ratio = as_float(technicals.get("volumeRatio"))
    volatility = as_float(technicals.get("volatility")) or 0
    one_year_return = float(performance["returns"].get("1y") or 0)
    ytd_return = float(performance["returns"].get("ytd") or 0)
    rank = peers.get("rank")
    count = peers.get("count")
    top_quintile = bool(rank and count and (rank / max(count, 1)) <= 0.2)

    above_20 = bool(price and sma20 and price >= sma20)
    above_50 = bool(price and sma50 and price >= sma50)
    above_200 = bool(price and sma200 and price >= sma200)
    macd_crossing_up = bool(macd is not None and macd_signal is not None and macd >= macd_signal)
    macd_improving = bool(macd_hist is not None and macd_hist >= 0)
    volume_active = bool(volume_ratio is not None and volume_ratio >= 1.05)
    range_width = max((resistance or price) - (support or price), 0.01)
    range_position = clamp(((price - (support or price)) / range_width) * 100) if price and support and resistance else 50
    rebound = _recent_rebound_context(history, price)
    from_recent_low = rebound.get("fromRecentLowPct")
    recent_range_position = rebound.get("recentRangePosition")
    swing_mode = mode == "swing"
    extended_rebound = (
        (from_recent_low is not None and from_recent_low >= 12)
        or (recent_range_position is not None and recent_range_position >= 72)
    )
    very_extended_rebound = (
        (from_recent_low is not None and from_recent_low >= 18)
        or (recent_range_position is not None and recent_range_position >= 86)
    )
    fresh_turn_score = _fresh_turn_score(from_recent_low, recent_range_position)

    breakout_score = (
        (22 if above_20 else 0)
        + (18 if above_50 else 0)
        + (16 if above_200 else 0)
        + (14 if macd_crossing_up else 0)
        + (12 if volume_active else 0)
        + (10 if one_year_return > 0 else 0)
        + (8 if top_quintile or peers.get("isNo1") else 0)
    )
    if swing_mode:
        breakout_score = min(breakout_score, 38 if extended_rebound else 48)
    swing_score = (
        fresh_turn_score
        + (18 if range_position <= 35 else 8 if range_position <= 50 else -12 if range_position >= 70 else 0)
        + (16 if rsi is not None and 38 <= rsi <= 60 else 6 if rsi is not None and 60 < rsi <= 66 else -18 if rsi is not None and rsi > 72 else -8 if rsi is not None and rsi < 32 else 0)
        + (12 if macd_improving or macd_crossing_up else 0)
        + (8 if above_50 and not extended_rebound else 2 if above_50 else -8 if not above_50 else 0)
        + (8 if volume_ratio is None or volume_ratio >= 0.85 else -10)
        + (6 if ytd_return >= -8 else 0)
    )
    if swing_mode and extended_rebound:
        swing_score = min(swing_score, 46)
    if swing_mode and very_extended_rebound:
        swing_score = min(swing_score, 34)
    reversal_score = (
        (24 if rsi is not None and rsi <= 35 else 12 if rsi is not None and rsi <= 42 else 0)
        + (20 if macd_crossing_up or macd_improving else 0)
        + (16 if range_position <= 35 else 6 if range_position <= 50 else 0)
        + (12 if volume_active else 0)
        + (8 if above_200 else 0)
    )
    quality_score = (
        (14 if (as_float(business.get("roe")) or 0) >= 10 else 0)
        + (12 if (as_float(business.get("profitMargin")) or 0) >= 8 else 0)
        + (10 if (as_float(business.get("revenueGrowth")) or 0) > 0 else 0)
        + (8 if (as_float(business.get("dividendYield")) or 0) >= 3 else 0)
        + (8 if top_quintile else 0)
    )
    setup_scores = {
        "breakout": breakout_score,
        "swing": swing_score,
        "reversal": reversal_score,
    }
    setup = max(setup_scores, key=setup_scores.get)
    setup_score = setup_scores[setup]
    risk_penalty = (
        (10 if volatility >= 4 else 5 if volatility >= 2.5 else 0)
        + (8 if rsi is not None and rsi >= 75 and range_position >= 75 else 0)
        + (8 if price and support and price < support else 0)
        + (6 if one_year_return < -20 else 0)
        + (18 if swing_mode and very_extended_rebound else 10 if swing_mode and extended_rebound else 0)
    )
    buy_score = int(round(clamp(0.50 * setup_score + 0.28 * strategy_score + 0.22 * quality_score - risk_penalty)))

    if setup == "breakout":
        setup_label = "Breakout continuation"
        setup_reason = "trend, momentum, and volume are trying to confirm strength"
    elif setup == "swing":
        setup_label = "Swing buy zone"
        setup_reason = "price is still close enough to the recent low/support area to treat as a fresh turn"
    else:
        setup_label = "Reversal watch"
        setup_reason = "the stock is weaker or oversold, but early momentum is trying to turn"

    if buy_score >= 80 and setup_score >= 62 and risk_penalty <= 10:
        action = "BUY"
        headline = f"{stock['symbol']} has a {setup_label.lower()} with enough evidence to consider a buy."
    elif buy_score >= 72:
        action = "BUY SETUP"
        headline = f"{stock['symbol']} is close to actionable: {setup_reason}, but the entry still needs discipline."
    elif buy_score >= 60:
        action = "WATCH"
        headline = f"{stock['symbol']} has a visible {setup_label.lower()}, but the evidence is not strong enough yet."
    elif buy_score >= 48:
        action = "WAIT"
        headline = f"{stock['symbol']} needs a cleaner trigger, better price, or stronger confirmation first."
    else:
        action = "PASS"
        headline = f"{stock['symbol']} does not have enough technical and business alignment for a buy setup."
    return {
        "action": action,
        "headline": headline,
        "analyst": analyst,
        "confidence": confidence_from_score(buy_score),
        "score": buy_score,
        "setup": setup,
        "setupLabel": setup_label,
        "strategyScore": strategy_score,
        "setupScore": int(round(setup_score)),
        "swingContext": rebound,
    }


def _recent_rebound_context(history: pd.DataFrame | None, price: float) -> dict[str, Any]:
    if history is None or history.empty or not price:
        return {"fromRecentLowPct": None, "recentRangePosition": None, "recentLow": None, "recentHigh": None}
    closes = extract_closes(history).dropna().tail(63)
    if closes.empty:
        return {"fromRecentLowPct": None, "recentRangePosition": None, "recentLow": None, "recentHigh": None}
    recent_low = float(closes.min())
    recent_high = float(closes.max())
    from_low = ((price - recent_low) / recent_low * 100.0) if recent_low > 0 else None
    range_position = ((price - recent_low) / (recent_high - recent_low) * 100.0) if recent_high > recent_low else None
    return {
        "fromRecentLowPct": round(from_low, 2) if from_low is not None else None,
        "recentRangePosition": round(clamp(range_position), 1) if range_position is not None else None,
        "recentLow": round(recent_low, 2),
        "recentHigh": round(recent_high, 2),
    }


def _fresh_turn_score(from_recent_low: float | None, recent_range_position: float | None) -> int:
    if from_recent_low is None and recent_range_position is None:
        return 0
    score = 0
    if from_recent_low is not None:
        if 1 <= from_recent_low <= 7:
            score += 26
        elif 0 <= from_recent_low < 1:
            score += 12
        elif 7 < from_recent_low <= 10:
            score += 12
        elif 10 < from_recent_low <= 14:
            score -= 8
        else:
            score -= 22
    if recent_range_position is not None:
        if 12 <= recent_range_position <= 45:
            score += 18
        elif recent_range_position < 12:
            score += 6
        elif recent_range_position <= 60:
            score += 4
        elif recent_range_position <= 72:
            score -= 8
        else:
            score -= 20
    return score


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
        cached = cache_get(DOMAIN_CACHE_NAMESPACE, cache_key)
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
            cache_set(DOMAIN_CACHE_NAMESPACE, cache_key, result, DOMAIN_TTL_SECONDS)
            return result
        except Exception:
            continue
    return None


def fetch_industry_insight(key: str) -> dict[str, Any] | None:
    for candidate in domain_key_candidates(key):
        cache_key = f"industry:{candidate}"
        cached = cache_get(DOMAIN_CACHE_NAMESPACE, cache_key)
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
            cache_set(DOMAIN_CACHE_NAMESPACE, cache_key, result, DOMAIN_TTL_SECONDS)
            return result
        except Exception:
            continue
    return None


from typing import Any, Dict
import pandas as pd

import pandas as pd
from typing import Any, Dict

def build_financial_snapshot(ticker) -> dict[str, Any]:
    # 1. Fetch stable financial reports (These always work for BBL.BK)
    dividends = safe_call(ticker.get_dividends, period="5y")
    annual_income = safe_call(ticker.get_income_stmt, pretty=True, freq="yearly")
    
    # 2. Build explicit mocked earnings data out of the functional statements array
    mocked_earnings_records = []
    if isinstance(annual_income, pd.DataFrame) and not annual_income.empty:
        try:
            for date_col in annual_income.columns:
                year_str = str(date_col.year) if hasattr(date_col, 'year') else str(date_col)
                mocked_earnings_records.append({
                    "Year": year_str,
                    "Net Income": annual_income.loc["Net Income", date_col] if "Net Income" in annual_income.index else None,
                    "Diluted EPS": annual_income.loc["Diluted EPS", date_col] if "Diluted EPS" in annual_income.index else None
                })
        except Exception:
            pass

    # 3. Base layout dictionary map
    snapshot = {
        "incomeStatement": statement_bundle(annual_income),
        "quarterlyIncomeStatement": statement_bundle(safe_call(ticker.get_income_stmt, pretty=True, freq="quarterly")),
        "balanceSheet": statement_bundle(safe_call(ticker.get_balance_sheet, pretty=True, freq="yearly")),
        "quarterlyBalanceSheet": statement_bundle(safe_call(ticker.get_balance_sheet, pretty=True, freq="quarterly")),
        "cashFlow": statement_bundle(safe_call(ticker.get_cash_flow, pretty=True, freq="yearly")),
        "quarterlyCashFlow": statement_bundle(safe_call(ticker.get_cash_flow, pretty=True, freq="quarterly")),
        "earnings": mocked_earnings_records,
        "actions": safe_dataframe_records(safe_call(ticker.get_actions, period="5y")),
        "dividends": (
            dividends.rename("amount").reset_index().to_dict(orient="records")
            if isinstance(dividends, pd.Series) and not dividends.empty
            else []
        ),
    }

    # 4. Strict explicit Try/Except checks for highly volatile international sub-methods
    # If Yahoo returns a 404 for these, they resolve to an empty structure instead of breaking the flow
    try: snapshot["calendar"] = safe_dict(ticker.get_calendar())
    except Exception: snapshot["calendar"] = {}

    try: snapshot["secFilings"] = safe_dict(ticker.get_sec_filings())
    except Exception: snapshot["secFilings"] = {}

    try: snapshot["recommendations"] = safe_dataframe_records(ticker.get_recommendations())
    except Exception: snapshot["recommendations"] = []

    try: snapshot["recommendationsSummary"] = safe_dataframe_records(ticker.get_recommendations_summary())
    except Exception: snapshot["recommendationsSummary"] = []

    try: snapshot["analystPriceTargets"] = safe_dict(ticker.get_analyst_price_targets())
    except Exception: snapshot["analystPriceTargets"] = {}

    try: snapshot["earningsEstimate"] = safe_dataframe_records(ticker.get_earnings_estimate())
    except Exception: snapshot["earningsEstimate"] = []

    try: snapshot["revenueEstimate"] = safe_dataframe_records(ticker.get_revenue_estimate())
    except Exception: snapshot["revenueEstimate"] = []

    try: snapshot["earningsHistory"] = safe_dataframe_records(ticker.get_earnings_history())
    except Exception: snapshot["earningsHistory"] = []

    try: snapshot["epsTrend"] = safe_dataframe_records(ticker.get_eps_trend())
    except Exception: snapshot["epsTrend"] = []

    try: snapshot["epsRevisions"] = safe_dataframe_records(ticker.get_eps_revisions())
    except Exception: snapshot["epsRevisions"] = []

    try: snapshot["growthEstimates"] = safe_dataframe_records(ticker.get_growth_estimates())
    except Exception: snapshot["growthEstimates"] = []

    return snapshot


def build_ai_financial_snapshot(ticker) -> dict[str, Any]:
    from concurrent.futures import ThreadPoolExecutor

    jobs = {
        "incomeStatement": lambda: statement_bundle(safe_call(ticker.get_income_stmt, pretty=True, freq="yearly")),
        "balanceSheet": lambda: statement_bundle(safe_call(ticker.get_balance_sheet, pretty=True, freq="yearly")),
        "cashFlow": lambda: statement_bundle(safe_call(ticker.get_cash_flow, pretty=True, freq="yearly")),
        "dividends": lambda: _ai_dividend_records(safe_call(ticker.get_dividends, period="5y")),
        "calendar": lambda: safe_dict(safe_call(ticker.get_calendar)),
        "analystPriceTargets": lambda: safe_dict(safe_call(ticker.get_analyst_price_targets)),
    }
    result: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {key: pool.submit(job) for key, job in jobs.items()}
        for key, future in futures.items():
            try:
                result[key] = future.result()
            except Exception:
                result[key] = [] if key == "dividends" else {}
    return result


def _ai_dividend_records(dividends: Any) -> list[dict[str, Any]]:
    if not isinstance(dividends, pd.Series) or dividends.empty:
        return []
    return dividends.tail(20).rename("amount").reset_index().to_dict(orient="records")


def _has_research_data(value: Any) -> bool:
    if isinstance(value, dict):
        return any(_has_research_data(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_has_research_data(item) for item in value)
    return value is not None and value != ""


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


def merge_thai_market_news(company_news: list[dict[str, Any]], symbol: str) -> list[dict[str, Any]]:
    """Enrich Thai (.BK) tickers with the shared Kaohoon SET feed.

    Yahoo rarely returns company news for Thai listings, so the market feed both
    fills the drawer/Daily Brief and gives the AI Thai-market context. Kept
    company-specific news first; skipped entirely for non-Thai symbols where a
    Thai market roundup would just be noise.
    """
    if not symbol.upper().endswith(".BK"):
        return company_news

    market = fetch_kaohoon_news(5)
    seen = {item.get("title") for item in company_news}
    return company_news + [item for item in market if item.get("title") not in seen]


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
