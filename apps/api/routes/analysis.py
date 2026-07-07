from __future__ import annotations

import hashlib
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_quant_with_openai, analyze_today_with_openai, analyze_with_openai, recommend_strategy_with_openai
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.scoring import StrategyKey, STRATEGY_LABELS, parse_strategy
from internal.market.universe import build_market_page
from internal.store.cache import cache_get, cache_set
from models import QuantPerspectiveResponse, StockAnalysisResponse, StrategyRecommendationRequest, StrategyPlaybookResponse, TodayPerformanceResponse

router = APIRouter()

DETAIL_TTL_SECONDS = 180


@router.post("/api/analysis/{symbol}", response_model=StockAnalysisResponse)
def analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    cache_key = f"v4:{normalized}:{strategy}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    try:
        financials_data = get_financials(normalized)
    except Exception as exc:
        print(f"Warning: Financials load failed for {normalized}: {exc}")
        financials_data = {}

    try:
        market_data = get_market_comparison(normalized)
    except Exception as exc:
        print(f"Warning: Market comparison load failed for {normalized}: {exc}")
        market_data = {}

    try:
        insights_data = get_domain_insights(normalized)
    except Exception as exc:
        print(f"Warning: Domain insights load failed for {normalized}: {exc}")
        insights_data = {}

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
    )

    # --- OPENAI EVALUATION ---
    try:
        result = analyze_with_openai(context)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
        
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/quant", response_model=QuantPerspectiveResponse)
def quant_analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    mode = str((payload or {}).get("mode") or "").strip().lower()
    mode = mode if mode in {"swing", "day", "long", "value", "fomo"} else None
    cache_key = f"quant:v8:{normalized}:{strategy}:{mode or 'default'}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy, mode=mode)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    try:
        financials_data = get_financials(normalized)
    except Exception as exc:
        print(f"Warning: Financials load failed for {normalized}: {exc}")
        financials_data = {}

    try:
        market_data = get_market_comparison(normalized)
    except Exception as exc:
        print(f"Warning: Market comparison load failed for {normalized}: {exc}")
        market_data = {}

    try:
        insights_data = get_domain_insights(normalized)
    except Exception as exc:
        print(f"Warning: Domain insights load failed for {normalized}: {exc}")
        insights_data = {}

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
    )

    try:
        result = analyze_quant_with_openai(context)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/today", response_model=TodayPerformanceResponse)
def today_analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    cache_key = f"today:v1:{normalized}:{strategy}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    try:
        financials_data = get_financials(normalized)
    except Exception as exc:
        print(f"Warning: Financials load failed for {normalized}: {exc}")
        financials_data = {}

    try:
        market_data = get_market_comparison(normalized)
    except Exception as exc:
        print(f"Warning: Market comparison load failed for {normalized}: {exc}")
        market_data = {}

    try:
        insights_data = get_domain_insights(normalized)
    except Exception as exc:
        print(f"Warning: Domain insights load failed for {normalized}: {exc}")
        insights_data = {}

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
    )

    try:
        result = analyze_today_with_openai(context)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/strategy/recommendations", response_model=StrategyPlaybookResponse)
def strategy_recommendations(payload: StrategyRecommendationRequest) -> dict[str, Any]:
    strategy_prompt = payload.strategy.strip()
    base_strategy = _infer_base_strategy(strategy_prompt)
    cache_digest = hashlib.sha256(
        f"{strategy_prompt.lower()}:{payload.region}:{payload.limit}:{payload.candidateLimit}:{base_strategy}".encode("utf-8")
    ).hexdigest()[:24]
    cache_key = f"strategy-playbook:v1:{cache_digest}"
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
        result = recommend_strategy_with_openai(context)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _filter_strategy_picks(result, candidates, payload.limit, strategy_prompt)
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
