from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials
from internal.market.scoring import StrategyKey

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
