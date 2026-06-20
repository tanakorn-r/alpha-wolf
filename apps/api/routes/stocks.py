from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from internal.market.scoring import StrategyKey
from internal.market.universe import build_market_page

router = APIRouter()


@router.get("/api/stocks")
def stocks(
    strategy: StrategyKey = Query("capitalized"),
    region: str = Query("all", pattern="^(all|us|th)$"),
    q: str = Query(""),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
) -> dict[str, Any]:
    page_items, total_pages, total = build_market_page(page=page, limit=limit, strategy=strategy, region=region, query=q)
    return {
        "stocks": page_items,
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
    }
