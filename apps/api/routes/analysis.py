from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

from internal.ai.agents import normalize_agent_id
from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_quant_with_openai, analyze_today_with_openai, analyze_valuation_with_openai, analyze_with_openai, recommend_strategy_with_openai, review_portfolio_with_openai
from internal.market.detail import build_detail_bundle, get_ai_financials, get_domain_insights, get_market_comparison
from internal.market.portfolio import build_portfolio_dashboard
from internal.market.scoring import StrategyKey, STRATEGY_LABELS, parse_strategy
from internal.market.universe import build_market_page
from internal.store.cache import cache_get, cache_set
from internal.store.portfolio import list_holdings
from models import PortfolioReviewResponse, QuantPerspectiveResponse, StockAnalysisResponse, StrategyRecommendationRequest, StrategyPlaybookResponse, TodayPerformanceResponse, ValuationVerdictResponse

router = APIRouter()

DETAIL_TTL_SECONDS = 180


def _fetch_analysis_data(
    symbol: str,
    strategy: StrategyKey,
    *,
    mode: str | None = None,
    include_financials: bool = True,
    include_market: bool = True,
    include_insights: bool = True,
) -> tuple[dict[str, Any] | None, dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Fetch bundle + financials + market comparison + domain insights in parallel.

    Returns (bundle, financials, market_data, insights). Any secondary fetch that
    fails returns an empty dict so the OpenAI call still proceeds with partial data.
    """
    bundle: dict[str, Any] | None = None
    financials: dict[str, Any] = {}
    market: dict[str, Any] = {}
    insights: dict[str, Any] = {}

    def _bundle() -> dict[str, Any] | None:
        return build_detail_bundle(symbol, strategy, mode=mode)

    def _financials() -> dict[str, Any]:
        try:
            return get_ai_financials(symbol) or {}
        except Exception as exc:
            print(f"Warning: Financials load failed for {symbol}: {exc}")
            return {}

    def _market() -> dict[str, Any]:
        try:
            return get_market_comparison(symbol) or {}
        except Exception as exc:
            print(f"Warning: Market comparison load failed for {symbol}: {exc}")
            return {}

    def _insights() -> dict[str, Any]:
        try:
            return get_domain_insights(symbol) or {}
        except Exception as exc:
            print(f"Warning: Domain insights load failed for {symbol}: {exc}")
            return {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_bundle): "bundle"}
        if include_financials:
            futures[pool.submit(_financials)] = "financials"
        if include_market:
            futures[pool.submit(_market)] = "market"
        if include_insights:
            futures[pool.submit(_insights)] = "insights"
        for future in as_completed(futures):
            key = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                print(f"Warning: {key} fetch failed for {symbol}: {exc}")
                result = None if key == "bundle" else {}
            if key == "bundle":
                bundle = result
            elif key == "financials":
                financials = result or {}
            elif key == "market":
                market = result or {}
            elif key == "insights":
                insights = result or {}

    return bundle, financials, market, insights


@router.post("/api/analysis/{symbol}", response_model=StockAnalysisResponse)
def analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera")) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    position_context = _position_context(normalized)
    position_cache_key = _position_cache_key(position_context)
    cache_key = f"v14:{normalized}:{strategy}:{agent_id}:{position_cache_key}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        position_context=position_context,
        agent_id=agent_id,
    )

    try:
        result = analyze_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/quant", response_model=QuantPerspectiveResponse)
def quant_analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera")) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    mode = str((payload or {}).get("mode") or "").strip().lower()
    mode = mode if mode in {"swing", "day", "long", "value", "fomo"} else None
    cache_key = f"quant:v14:{normalized}:{strategy}:{mode or 'default'}:{agent_id}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        mode=mode,
        include_financials=False,
        include_insights=False,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )

    try:
        result = analyze_quant_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/valuation", response_model=ValuationVerdictResponse)
def valuation_analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera")) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    cache_key = f"valuation:v9:{normalized}:{strategy}:{agent_id}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_market=False,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )

    try:
        result = analyze_valuation_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/today", response_model=TodayPerformanceResponse)
def today_analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera")) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    cache_key = f"today:v6:{normalized}:{strategy}:{agent_id}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_financials=False,
        include_market=False,
        include_insights=False,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )

    try:
        result = analyze_today_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


def _position_context(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    try:
        portfolio = build_portfolio_dashboard()
        data = portfolio.model_dump() if hasattr(portfolio, "model_dump") else dict(portfolio or {})
        for holding in data.get("holdings") or []:
            if str(holding.get("symbol") or "").upper() != normalized:
                continue
            return {
                "isHolding": True,
                "mode": "holding",
                "question": "The user already owns this stock. Analyze whether they should stay with it, buy more, trim, or sell. Focus on whether today's price is a reason to worry or whether they can keep holding.",
                "symbol": normalized,
                "shares": holding.get("shares"),
                "averageCost": holding.get("averageCost"),
                "currentValue": holding.get("value"),
                "costBasis": holding.get("cost"),
                "gainLoss": holding.get("gainLoss"),
                "gainLossPct": holding.get("gainLossPct"),
                "monthlyDca": holding.get("monthlyDca"),
                "strategy": holding.get("strategy"),
                "createdAt": holding.get("createdAt"),
            }
    except Exception as exc:
        print(f"Warning: Portfolio context load failed for {normalized}: {exc}")

    try:
        for holding in list_holdings():
            if holding.symbol.upper() != normalized:
                continue
            return {
                "isHolding": True,
                "mode": "holding",
                "question": "The user already owns this stock. Analyze whether they should stay with it, buy more, trim, or sell. Focus on whether today's price is a reason to worry or whether they can keep holding.",
                "symbol": normalized,
                "shares": holding.shares,
                "averageCost": holding.averageCost,
                "monthlyDca": holding.monthlyDca,
                "strategy": holding.strategy,
                "createdAt": holding.createdAt,
            }
    except Exception as exc:
        print(f"Warning: Stored holding context load failed for {normalized}: {exc}")

    return {
        "isHolding": False,
        "mode": "candidate",
        "question": "The user does not own this stock. Analyze whether they should buy it now, wait for a better entry, or avoid it.",
        "symbol": normalized,
    }


def _position_cache_key(context: dict[str, Any]) -> str:
    if not context.get("isHolding"):
        return "candidate"
    parts = [
        "holding",
        str(context.get("shares") or ""),
        str(context.get("averageCost") or ""),
        str(context.get("monthlyDca") or ""),
        str(context.get("gainLossPct") or ""),
    ]
    return ":".join(parts)


@router.post("/api/strategy/recommendations", response_model=StrategyPlaybookResponse)
def strategy_recommendations(payload: StrategyRecommendationRequest, agent: str = Query("vera")) -> dict[str, Any]:
    strategy_prompt = payload.strategy.strip()
    base_strategy = _infer_base_strategy(strategy_prompt)
    agent_id = normalize_agent_id(agent)
    cache_digest = hashlib.sha256(
        f"{strategy_prompt.lower()}:{payload.region}:{payload.limit}:{payload.candidateLimit}:{base_strategy}:{agent_id}".encode("utf-8")
    ).hexdigest()[:24]
    cache_key = f"strategy-playbook:v6:{cache_digest}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    candidates, _, total = build_market_page(
        page=1,
        limit=payload.candidateLimit,
        strategy=base_strategy,
        region=payload.region,
    )
    if not candidates:
        raise HTTPException(status_code=404, detail="No stock candidates are available for this strategy")

    context = {
        "strategyPrompt": strategy_prompt,
        "requestedLimit": payload.limit,
        "region": payload.region,
        "baseStrategy": base_strategy,
        "baseStrategyLabel": STRATEGY_LABELS[base_strategy],
        "candidateCount": len(candidates),
        "totalUniverseMatches": total,
        "candidates": [_strategy_candidate_context(candidate, base_strategy) for candidate in candidates],
    }

    try:
        result = recommend_strategy_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _filter_strategy_picks(result, candidates, payload.limit, strategy_prompt)
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/portfolio/review", response_model=PortfolioReviewResponse)
def portfolio_review(agent: str = Query("vera")) -> dict[str, Any]:
    agent_id = normalize_agent_id(agent)
    portfolio = build_portfolio_dashboard()
    context = _portfolio_review_context(portfolio)
    cache_digest = hashlib.sha256(
        f"{agent_id}:{context.get('totalValue')}:{context.get('gainLossPct')}:{context.get('forwardYield')}:{','.join(item.get('symbol', '') for item in context.get('holdings', []))}".encode("utf-8")
    ).hexdigest()[:24]
    cache_key = f"portfolio-review:v4:{cache_digest}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    try:
        result = review_portfolio_with_openai({"portfolioContext": context}, agent_id)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


def _infer_base_strategy(strategy_prompt: str) -> StrategyKey:
    direct = parse_strategy(strategy_prompt)
    if strategy_prompt in STRATEGY_LABELS:
        return direct

    prompt = strategy_prompt.lower()
    if any(term in prompt for term in ("day", "swing", "momentum", "fomo", "breakout", "trend", "short-term", "short term")):
        return "momentum"
    if any(term in prompt for term in ("yield", "income", "dividend", "cash flow", "cashflow")):
        return "yield"
    if any(term in prompt for term in ("dca", "stable", "long", "compound", "retirement", "recurring")):
        return "stable_dca"
    if any(term in prompt for term in ("value", "capital", "undervalued", "quality", "fundamental")):
        return "capitalized"
    return direct


def _strategy_candidate_context(candidate: dict[str, Any], base_strategy: StrategyKey) -> dict[str, Any]:
    scores = candidate.get("strategyScores") if isinstance(candidate.get("strategyScores"), dict) else {}
    return {
        "symbol": candidate.get("symbol"),
        "name": candidate.get("name"),
        "sector": candidate.get("sector"),
        "industry": candidate.get("industry"),
        "exchange": candidate.get("exchange"),
        "currency": candidate.get("currency"),
        "price": candidate.get("price"),
        "changePct": candidate.get("changePct"),
        "weeklyTrend": candidate.get("weeklyTrend"),
        "marketCap": candidate.get("marketCap"),
        "dividendYield": candidate.get("dividendYield"),
        "recommendation": candidate.get("recommendation"),
        "story": candidate.get("story"),
        "baseStrategyScore": scores.get(base_strategy),
        "strategyScores": scores,
    }


def _portfolio_review_context(portfolio: Any) -> dict[str, Any]:
    data = portfolio.model_dump() if hasattr(portfolio, "model_dump") else dict(portfolio or {})
    summary = data.get("summary") or {}
    holdings = data.get("holdings") or []
    total_value = float(summary.get("totalValue") or 0)
    rows: list[dict[str, Any]] = []
    for holding in holdings:
        value = float(holding.get("value") or 0)
        cost = float(holding.get("cost") or 0)
        gain_loss_pct = float(holding.get("gainLossPct") or 0)
        rows.append(
            {
                "symbol": holding.get("symbol"),
                "name": holding.get("name"),
                "strategy": holding.get("strategy"),
                "shares": holding.get("shares"),
                "averageCost": holding.get("averageCost"),
                "price": holding.get("price"),
                "currency": holding.get("currency"),
                "value": value,
                "cost": cost,
                "gainLoss": holding.get("gainLoss"),
                "gainLossPct": gain_loss_pct,
                "weightPct": (value / total_value * 100) if total_value > 0 else 0,
                "dividendYield": holding.get("dividendYield"),
                "monthlyDca": holding.get("monthlyDca"),
            }
        )

    sorted_by_value = sorted(rows, key=lambda item: float(item.get("value") or 0), reverse=True)
    sorted_by_return = sorted(rows, key=lambda item: float(item.get("gainLossPct") or 0), reverse=True)
    top = sorted_by_value[0] if sorted_by_value else None
    best = sorted_by_return[0] if sorted_by_return else None
    worst = sorted_by_return[-1] if sorted_by_return else None

    return {
        "empty": len(rows) == 0,
        "holdingCount": len(rows),
        "totalValue": total_value,
        "invested": summary.get("invested"),
        "gainLoss": summary.get("gainLoss"),
        "gainLossPct": summary.get("gainLossPct"),
        "dividendsYtd": summary.get("dividendsYtd"),
        "forwardYield": summary.get("forwardYield"),
        "winners": len([row for row in rows if float(row.get("gainLossPct") or 0) >= 0]),
        "losers": len([row for row in rows if float(row.get("gainLossPct") or 0) < 0]),
        "top": top,
        "topWeightPct": top.get("weightPct") if top else 0,
        "best": best,
        "worst": worst,
        "holdings": rows,
    }


def _filter_strategy_picks(result: dict[str, Any], candidates: list[dict[str, Any]], limit: int, strategy_prompt: str) -> dict[str, Any]:
    candidate_by_symbol = {str(candidate.get("symbol") or "").upper(): candidate for candidate in candidates}
    picks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pick in result.get("picks", []):
        symbol = str(pick.get("ticker") or "").upper().strip()
        if not symbol or symbol not in candidate_by_symbol or symbol in seen:
            continue
        candidate = candidate_by_symbol[symbol]
        picks.append(
            {
                **pick,
                "ticker": symbol,
                "name": str(candidate.get("name") or pick.get("name") or symbol),
            }
        )
        seen.add(symbol)
        if len(picks) >= limit:
            break

    if not picks:
        raise HTTPException(status_code=503, detail="Strategy AI did not return any valid universe picks")

    return {
        **result,
        "strategy": strategy_prompt,
        "picks": picks,
    }
