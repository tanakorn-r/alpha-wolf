from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from internal.market.detail import build_detail_bundle
from internal.market.scoring import StrategyKey

router = APIRouter()


@router.get("/api/details/{symbol}")
def details(symbol: str, strategy: StrategyKey = Query("capitalized")) -> dict[str, Any]:
    normalized = symbol.upper()
    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return bundle
