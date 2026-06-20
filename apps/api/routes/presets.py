from __future__ import annotations

from fastapi import APIRouter, Query

from internal.store.presets import list_market_presets
from internal.market.catalog import ensure_market_catalog
from models import MarketCatalogStatus, TickerPreset

router = APIRouter()


@router.get("/api/presets")
def presets(kind: str | None = Query(default=None), region: str | None = Query(default=None)) -> list[TickerPreset]:
    return list_market_presets(kind=kind, region=region)


@router.get("/api/catalog", response_model=MarketCatalogStatus)
def catalog() -> MarketCatalogStatus:
    return ensure_market_catalog()
