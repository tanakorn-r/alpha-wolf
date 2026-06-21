from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Any, Iterable

from internal.market.records import merge_ticker_info
from internal.market.universe import get_live_records
from internal.store.cache import cache_get, cache_set
from internal.store.portfolio import list_dca_orders, list_holdings
from internal.store.utils import as_float, coerce_iso_date
from internal.yahoo.client import load_ticker_modules, ticker as make_ticker
from models import MarketCalendarEvent, MarketCalendarResponse, MarketCalendarSummary

CALENDAR_TTL_SECONDS = 86_400
CALENDAR_WORKERS = 12


def build_market_calendar(*, month: str | None, region: str) -> MarketCalendarResponse:
    resolved_month = _normalize_month(month)
    safe_region = region if region in {"all", "us", "th"} else "us"
    cache_key = f"v1:{resolved_month}:{safe_region}"
    cached = cache_get("market_calendar", cache_key)
    if cached is not None:
        return MarketCalendarResponse.model_validate(cached)

    holdings = {item.symbol.upper() for item in list_holdings()}
    records = _filter_records(get_live_records(), safe_region)
    with ThreadPoolExecutor(max_workers=min(CALENDAR_WORKERS, max(1, len(records)))) as pool:
        chunks = list(pool.map(lambda record: _events_for_record(record, resolved_month, holdings), records))

    events = [event for chunk in chunks for event in chunk]
    events.extend(_dca_events(resolved_month, holdings))
    events.sort(key=lambda item: (item.date, item.kind, item.symbol))

    response = MarketCalendarResponse(
        month=resolved_month,
        region=safe_region,  # type: ignore[arg-type]
        summary=MarketCalendarSummary(
            totalEvents=len(events),
            holdingEvents=sum(1 for item in events if item.isHolding),
            usEvents=sum(1 for item in events if item.region == "us"),
            thEvents=sum(1 for item in events if item.region == "th"),
            paymentsTotal=round(sum(item.amount or 0 for item in events if item.kind == "payment" and item.isHolding), 2),
        ),
        events=events,
    )
    cache_set("market_calendar", cache_key, response.model_dump(), CALENDAR_TTL_SECONDS)
    return response


def _filter_records(records: list[dict[str, Any]], region: str) -> list[dict[str, Any]]:
    if region == "all":
        return records
    return [record for record in records if region in record.get("indexes", [])]


def _events_for_record(record: dict[str, Any], month: str, holdings: set[str]) -> list[MarketCalendarEvent]:
    symbol = str(record.get("symbol") or "").upper()
    if not symbol:
        return []

    info = merge_ticker_info(load_ticker_modules(make_ticker(symbol), symbol), symbol)
    name = str(record.get("name") or info.get("shortName") or symbol)
    resolved_region = _region_for_record(record, symbol)
    market_label = "Thai SET" if resolved_region == "th" else "US"
    event_specs = [
        ("ex-dividend", info.get("exDividendDate"), "Ex-dividend date"),
        ("payment", info.get("dividendDate"), "Dividend payment"),
        ("earnings", _extract_earnings_date(info), "Earnings date"),
    ]
    amount = as_float(info.get("dividendRate"))
    is_holding = symbol in holdings

    events: list[MarketCalendarEvent] = []
    for kind, raw_date, note in event_specs:
        event_date = _first_matching_month_date(raw_date, month)
        if not event_date:
            continue
        events.append(
            MarketCalendarEvent(
                date=event_date,
                symbol=symbol,
                name=name,
                kind=kind,  # type: ignore[arg-type]
                region=resolved_region,  # type: ignore[arg-type]
                marketLabel=market_label,
                isHolding=is_holding,
                amount=amount if kind == "payment" else None,
                note=note,
            )
        )
    return events


def _dca_events(month: str, holdings: set[str]) -> list[MarketCalendarEvent]:
    events: list[MarketCalendarEvent] = []
    for order in list_dca_orders():
        if not order.scheduledFor.startswith(month):
            continue
        region = "th" if order.symbol.upper().endswith(".BK") else "us"
        events.append(
            MarketCalendarEvent(
                date=order.scheduledFor,
                symbol=order.symbol.upper(),
                name=order.symbol.upper(),
                kind="dca",
                region=region,  # type: ignore[arg-type]
                marketLabel="Thai SET" if region == "th" else "US",
                isHolding=order.symbol.upper() in holdings,
                amount=order.amount,
                note="Planned DCA order",
            )
        )
    return events


def _extract_earnings_date(info: dict[str, Any]) -> Any:
    for key, value in info.items():
        name = str(key).lower().replace("_", "").replace(" ", "")
        if "earnings" in name and "date" in name:
            return value
    calendar_events = info.get("calendarEvents")
    if isinstance(calendar_events, dict):
        for key, value in calendar_events.items():
            name = str(key).lower().replace("_", "").replace(" ", "")
            if "earnings" in name and "date" in name:
                return value
    return None


def _first_matching_month_date(value: Any, month: str) -> str | None:
    for candidate in _iter_date_candidates(value):
        normalized = coerce_iso_date(candidate)
        if normalized and normalized.startswith(month):
            return normalized
    return None


def _iter_date_candidates(value: Any) -> Iterable[Any]:
    if value is None:
        return []
    if isinstance(value, dict):
        candidates: list[Any] = []
        for nested in value.values():
            candidates.extend(list(_iter_date_candidates(nested)))
        return candidates
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def _normalize_month(month: str | None) -> str:
    if month:
        try:
            return datetime.strptime(month, "%Y-%m").strftime("%Y-%m")
        except ValueError:
            pass
    today = date.today()
    return f"{today.year:04d}-{today.month:02d}"


def _region_for_record(record: dict[str, Any], symbol: str) -> str:
    indexes = {str(value).lower() for value in record.get("indexes", [])}
    if "th" in indexes or symbol.endswith(".BK"):
        return "th"
    return "us"
