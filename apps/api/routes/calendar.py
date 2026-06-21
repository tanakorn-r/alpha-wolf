from __future__ import annotations

from fastapi import APIRouter, Query

from internal.market.calendar import build_market_calendar
from models import MarketCalendarResponse

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("", response_model=MarketCalendarResponse)
def calendar_feed(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    region: str = Query(default="us"),
) -> MarketCalendarResponse:
    return build_market_calendar(month=month, region=region)
