from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from internal.market.symbol import get_single_record

router = APIRouter()


@router.get("/api/quote/{symbol}")
def quote(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    record = get_single_record(normalized)
    if not record:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return record
