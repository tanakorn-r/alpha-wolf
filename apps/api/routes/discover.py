from __future__ import annotations

from fastapi import APIRouter, Query
import re

from internal.market.discovery import lookup_discovery
from internal.market.symbol import fetch_symbol_record
from internal.market.universe import build_market_page
from internal.market.scoring import StrategyKey
from internal.store.cache import cache_get, cache_set
from models import DiscoverResponse, DiscoveryKind, LookupResponse

router = APIRouter()

DISCOVERY_TTL_SECONDS = 180
DISCOVERY_RESPONSE_TTL_SECONDS = 30


@router.get("/api/discover")
def discover(
    q: str | None = Query(default=None),
    kind: DiscoveryKind = Query(default=DiscoveryKind.all),
    strategy: StrategyKey = Query(default="stable_dca"),
    mode: str | None = Query(default=None, pattern="^(swing|day|long|value|fomo)$"),
    sort: str = Query(default="score", pattern="^(score|yield|change|name)$"),
    region: str = Query(default="all", pattern="^(all|us|th)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
) -> DiscoverResponse:
    query = (q or "").strip()
    cache_key = f"v1:{query.lower()}:{kind.value}:{strategy}:{mode or ''}:{sort}:{region}:{page}:{limit}"
    cached = cache_get("discover_response", cache_key)
    if cached is not None:
        return DiscoverResponse.model_validate(cached)

    lookup = lookup_discovery(query, kind, limit, DISCOVERY_TTL_SECONDS, None if region == "all" else region) if query else LookupResponse(query=query, kind=kind)
    live, total_pages, total = build_market_page(page=page, limit=limit, strategy=strategy, mode=mode, sort=sort, region=region, query=query)
    normalized = query.upper()
    if query and not live and re.fullmatch(r"[A-Z0-9.\-]{1,15}", normalized):
        resolved = fetch_symbol_record(normalized)
        live = [resolved] if resolved else []
        total = len(live)
        total_pages = 1
    response = DiscoverResponse(
        query=query,
        kind=kind,
        limit=limit,
        page=page,
        total=total,
        totalPages=total_pages,
        count=total,
        sections=lookup.sections,
        items=lookup.items,
        live=live,
    )
    cache_set("discover_response", cache_key, response.model_dump(), DISCOVERY_RESPONSE_TTL_SECONDS)
    return response
