from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from internal.market.detail import fetch_industry_insight, fetch_sector_insight

router = APIRouter()


@router.get("/api/sectors/{sector_key}")
def sector_insight(sector_key: str) -> dict[str, Any]:
    payload = fetch_sector_insight(sector_key)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Sector {sector_key} not found")
    return payload


@router.get("/api/industries/{industry_key}")
def industry_insight(industry_key: str) -> dict[str, Any]:
    payload = fetch_industry_insight(industry_key)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Industry {industry_key} not found")
    return payload
