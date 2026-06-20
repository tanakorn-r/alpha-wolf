from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from internal.market.scoring import StrategyKey, build_narrative, confidence_from_score
from internal.market.universe import build_market_page

router = APIRouter()


@router.get("/api/dashboard")
def dashboard(
    strategy: StrategyKey = Query("capitalized"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
) -> dict[str, Any]:
    page_items, total_pages, total = build_market_page(page=page, limit=limit, strategy=strategy)
    top = page_items[0] if page_items else None
    performance = {
        "score": int(round(top["strategyScores"][strategy])) if top else 0,
        "confidence": confidence_from_score(top["strategyScores"][strategy]) if top else "Balanced",
        "recommendation": (
            f"Best current match: {top['symbol']} - {top['recommendation']}" if top else "No live match yet"
        ),
    }
    return {
        "stocks": page_items,
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
        "performance": performance,
        "narrative": build_narrative(strategy, top),
    }
