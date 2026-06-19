from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from internal.ai.heuristics import analyze_with_heuristics
from internal.ai.openai_client import analyze_with_openai
from internal.market.detail import build_detail_bundle
from internal.market.scoring import parse_strategy
from internal.store.cache import cache_get, cache_set

router = APIRouter()

DETAIL_TTL_SECONDS = 180


@router.post("/api/analysis/{symbol}")
def analysis(symbol: str, payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    normalized = symbol.upper()
    strategy = parse_strategy((payload or {}).get("strategy"))
    cache_key = f"{normalized}:{strategy}"
    cached = cache_get("analysis", cache_key)
    if cached is not None:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    result = analyze_with_openai(bundle, strategy) or analyze_with_heuristics(bundle, strategy)
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result
