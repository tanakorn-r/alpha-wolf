from fastapi import APIRouter, HTTPException
import yfinance as yf

from internal.store.cache import cache_get, cache_set
from internal.store.utils import json_safe, safe_dict
from models import MarketSnapshot

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/{market}", response_model=MarketSnapshot)
def market_snapshot(market: str) -> MarketSnapshot:
    code = market.strip().upper()
    cached = cache_get("market", code)
    if cached is not None:
        return MarketSnapshot.model_validate(cached)
    try:
        feed = yf.Market(code)
        result = MarketSnapshot(market=code, status=json_safe(safe_dict(feed.status)), summary=json_safe(safe_dict(feed.summary)))
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Market {code} is unavailable") from error
    cache_set("market", code, result.model_dump(), 60)
    return result
