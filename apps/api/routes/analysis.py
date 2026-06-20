from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_with_openai
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.scoring import parse_strategy
from internal.store.cache import cache_get, cache_set
from models import StockAnalysisResponse

router = APIRouter()

DETAIL_TTL_SECONDS = 180


@router.post("/api/analysis/{symbol}", response_model=StockAnalysisResponse)
def analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    cache_key = f"v2:{normalized}:{strategy}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    # --- DEFENSIVE THREAD EXECUTION SETUP ---
    with ThreadPoolExecutor(max_workers=3) as pool:
        financials_future = pool.submit(get_financials, normalized)
        market_future = pool.submit(get_market_comparison, normalized)
        insights_future = pool.submit(get_domain_insights, normalized)
        
        # Safely resolve financials (Intercepts yfinance 404/400 errors for regional tickers)
        try:
            financials_data = financials_future.result()
        except Exception as exc:
            # Logs the error to standard output but prevents a 503 crash
            print(f"Warning: Financials thread failed for {normalized}: {exc}")
            financials_data = {}

        # Safely resolve market comparison (Where ticker.info often crashes on Thai tickers)
        try:
            market_data = market_future.result()
        except Exception as exc:
            print(f"Warning: Market comparison thread failed for {normalized}: {exc}")
            market_data = {}

        # Safely resolve domain insights
        try:
            insights_data = insights_future.result()
        except Exception as exc:
            print(f"Warning: Domain insights thread failed for {normalized}: {exc}")
            insights_data = {}

        # Re-construct the missing analysis context dictionary cleanly
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