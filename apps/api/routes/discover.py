from __future__ import annotations

from fastapi import APIRouter, Query

from internal.market.discovery import lookup_discovery
from internal.market.universe import get_live_records
from models import DiscoverResponse, DiscoveryKind

router = APIRouter()

DISCOVERY_TTL_SECONDS = 180


@router.get("/api/discover")
def discover(
    q: str | None = Query(default=None),
    kind: DiscoveryKind = Query(default=DiscoveryKind.all),
    limit: int = Query(default=12, ge=1, le=50),
) -> DiscoverResponse:
    query = (q or "").strip()
    lookup = lookup_discovery(query, kind, limit, DISCOVERY_TTL_SECONDS)
    try:
        live = get_live_records()
    except Exception:
        live = []
    return DiscoverResponse(
        query=query,
        kind=kind,
        limit=limit,
        count=lookup.count,
        sections=lookup.sections,
        items=lookup.items,
        live=live[:limit],
    )
