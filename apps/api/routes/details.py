from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.patterns import upward_moves
from internal.market.scoring import StrategyKey
from models import MarketComparison

router = APIRouter()


@router.get("/api/details/{symbol}")
def details(symbol: str, strategy: StrategyKey = Query("capitalized")) -> dict[str, Any]:
    normalized = symbol.upper()
    bundle = build_detail_bundle(normalized, strategy)
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


@router.get("/api/details/{symbol}/upward-moves")
def details_upward_moves(symbol: str, timeframe: str = Query("1D", pattern="^(1D|1W)$")) -> dict[str, Any]:
    normalized = symbol.upper()
    result = upward_moves(normalized, timeframe)  # type: ignore[arg-type]
    if not result:
        raise HTTPException(status_code=404, detail=f"Not enough history for {normalized}")
    return result
