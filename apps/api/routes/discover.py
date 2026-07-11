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

COMMODITY_SEARCH_ALIASES = {
    "gold": ["XAUUSD=X", "GC=F", "GLD"],
    "xau": ["XAUUSD=X", "GC=F", "GLD"],
    "xauusd": ["XAUUSD=X", "GC=F", "GLD"],
    "spot gold": ["XAUUSD=X", "GC=F", "GLD"],
    "gold futures": ["GC=F", "XAUUSD=X", "GLD"],
    "silver": ["XAGUSD=X", "SI=F", "SLV"],
    "xag": ["XAGUSD=X", "SI=F", "SLV"],
    "xagusd": ["XAGUSD=X", "SI=F", "SLV"],
    "spot silver": ["XAGUSD=X", "SI=F", "SLV"],
    "oil": ["CL=F", "BZ=F", "USO"],
    "crude": ["CL=F", "BZ=F", "USO"],
    "crude oil": ["CL=F", "BZ=F", "USO"],
    "wti": ["CL=F", "USO"],
    "brent": ["BZ=F", "BNO"],
    "natural gas": ["NG=F", "UNG"],
    "nat gas": ["NG=F", "UNG"],
    "copper": ["HG=F", "CPER"],
    "platinum": ["PL=F", "PPLT"],
    "palladium": ["PA=F", "PALL"],
}


@router.get("/api/discover")
def discover(
    q: str | None = Query(default=None),
    kind: DiscoveryKind = Query(default=DiscoveryKind.all),
    strategy: StrategyKey = Query(default="stable_dca"),
    mode: str | None = Query(default=None, pattern="^(swing|day|long|value|fomo)$"),
    sort: str = Query(default="score", pattern="^(score|yield|change|name)$"),
    region: str = Query(default="all", pattern="^(all|us|th)$"),
    sector: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
) -> DiscoverResponse:
    query = (q or "").strip()
    cache_key = f"v3:{query.lower()}:{kind.value}:{strategy}:{mode or ''}:{sort}:{region}:{sector or ''}:{page}:{limit}"
    cached = cache_get("discover_response", cache_key)
    if cached is not None:
        return DiscoverResponse.model_validate(cached)

    lookup = lookup_discovery(query, kind, limit, DISCOVERY_TTL_SECONDS, None if region == "all" else region) if query else LookupResponse(query=query, kind=kind)
    live, total_pages, total = build_market_page(page=page, limit=limit, strategy=strategy, mode=mode, sort=sort, region=region, query=query, sector=sector)
    normalized = query.upper()
    alias_live = _resolve_commodity_alias(query, limit) if query else []
    if alias_live:
        # Human commodity names and common FX-style shorthand must win over the
        # literal Yahoo lookup. For example, XAUUSD is not Yahoo's spot-gold
        # symbol; XAUUSD=X is. The literal lookup can otherwise produce a
        # plausible-looking record whose price is 0.00.
        live = alias_live
        total = len(live)
        total_pages = 1
    elif query and not live and re.fullmatch(r"[A-Z0-9.^=\-]{1,18}", normalized):
        resolved = fetch_symbol_record(normalized)
        live = [resolved] if resolved and _has_live_price(resolved) else []
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


def _resolve_commodity_alias(query: str, limit: int) -> list[dict[str, object]]:
    normalized = re.sub(r"[^a-z0-9]+", " ", query.lower()).strip()
    compact = normalized.replace(" ", "")
    symbols = COMMODITY_SEARCH_ALIASES.get(normalized) or COMMODITY_SEARCH_ALIASES.get(compact) or []
    records: list[dict[str, object]] = []
    seen: set[str] = set()
    for symbol in symbols:
        if symbol in seen:
            continue
        seen.add(symbol)
        record = fetch_symbol_record(symbol)
        if record and _has_live_price(record):
            records.append(record)
        if len(records) >= limit:
            break
    return records


def _has_live_price(record: dict[str, object]) -> bool:
    try:
        return float(record.get("price") or 0) > 0
    except (TypeError, ValueError):
        return False
