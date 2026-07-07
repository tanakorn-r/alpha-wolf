from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_buy_timing_with_openai, predict_technical_moves_with_openai
from internal.market.deep import deep_analysis
from internal.market.buy_timing import apply_ai_narrative, build_buy_timing
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.patterns import signed_moves_from_points
from internal.market.scoring import StrategyKey
from internal.store.cache import cache_get, cache_set
from models import MarketComparison, TechnicalMovesPredictionResponse

router = APIRouter()

UPWARD_MOVES_TTL_SECONDS = 900


@router.get("/api/details/{symbol}")
def details(
    symbol: str,
    strategy: StrategyKey = Query("capitalized"),
    mode: str | None = Query(default=None, pattern="^(swing|day|long|value|fomo)$"),
) -> dict[str, Any]:
    normalized = symbol.upper()
    bundle = build_detail_bundle(normalized, strategy, mode=mode)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return bundle


@router.get("/api/details/{symbol}/financials")
def details_financials(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    financials = get_financials(normalized)
    if not financials:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return financials


@router.get("/api/details/{symbol}/insights")
def details_insights(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    insights = get_domain_insights(normalized)
    if not insights:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return insights


@router.get("/api/details/{symbol}/market-comparison", response_model=MarketComparison)
def details_market_comparison(symbol: str) -> MarketComparison:
    comparison = get_market_comparison(symbol)
    if not comparison:
        raise HTTPException(status_code=503, detail=f"Market comparison for {symbol.upper()} is unavailable")
    return MarketComparison.model_validate(comparison)


@router.get("/api/details/{symbol}/deep")
def details_deep(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    result = deep_analysis(normalized)
    if not result:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return result


@router.get("/api/details/{symbol}/buy-timing")
def details_buy_timing(
    symbol: str,
    strategy: StrategyKey = Query("stable_dca"),
) -> dict[str, Any]:
    normalized = symbol.upper()
    result = build_buy_timing(normalized, strategy)
    if not result:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    try:
        narrative = analyze_buy_timing_with_openai({"buyTiming": result})
    except OpenAIAnalysisError:
        return result
    return apply_ai_narrative(result, narrative)


@router.get("/api/details/{symbol}/upward-moves", response_model=TechnicalMovesPredictionResponse)
def details_upward_moves(
    symbol: str,
    timeframe: str = Query("1D", pattern="^(1D|1W)$"),
    strategy: StrategyKey = Query("capitalized"),
) -> dict[str, Any]:
    normalized = symbol.upper()
    cache_key = f"ai-next-10-technical:v6:{normalized}:{timeframe}:{strategy}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    historical = signed_moves_from_points(normalized, timeframe, bundle.get("history") or [])  # type: ignore[arg-type]
    if not historical:
        raise HTTPException(status_code=404, detail=f"Not enough history for {normalized}")

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
    context["forecastRequest"] = {
        "feature": "Next 10 Technical Moves",
        "timeframe": timeframe,
        "requiredMoves": 10,
        "allowNegativeMoves": True,
        "notEntryZones": True,
        "currentPrice": historical.get("currentPrice"),
    }
    context["historicalMoveDistribution"] = historical

    try:
        result = predict_technical_moves_with_openai(context)
    except OpenAIAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result["history"] = historical.get("history", [])
    result["historicalMoves"] = historical.get("moves", [])[:10]
    cache_set("analysis", cache_key, result, UPWARD_MOVES_TTL_SECONDS)
    return result
