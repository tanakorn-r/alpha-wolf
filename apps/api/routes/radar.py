from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from internal.market.scoring import STRATEGY_LABELS, StrategyKey, build_narrative
from internal.market.universe import build_market_page

router = APIRouter()


@router.get("/api/radar")
def radar(
    strategy: StrategyKey = Query("capitalized"),
    region: str = Query("all", pattern="^(all|us|th)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
) -> dict[str, Any]:
    page_items, total_pages, total = build_market_page(page=page, limit=limit, strategy=strategy, region=region)
    top = page_items[0] if page_items else None
    return {
        "strategy": strategy,
        "label": STRATEGY_LABELS[strategy],
        "narrative": build_narrative(strategy, top),
        "matches": page_items,
        "stocks": page_items,
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
    }
