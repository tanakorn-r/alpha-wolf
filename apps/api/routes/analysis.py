from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_quant_with_openai, analyze_today_with_openai, analyze_with_openai
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.scoring import parse_strategy
from internal.store.cache import cache_get, cache_set
from models import QuantPerspectiveResponse, StockAnalysisResponse, TodayPerformanceResponse

router = APIRouter()

DETAIL_TTL_SECONDS = 180


@router.post("/api/analysis/{symbol}", response_model=StockAnalysisResponse)
def analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    cache_key = f"v3:{normalized}:{strategy}"
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
    cache_key = f"quant:v3:{normalized}:{strategy}"
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
