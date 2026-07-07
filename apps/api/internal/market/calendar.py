from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Any, Iterable

from internal.market.records import merge_ticker_info
from internal.market.universe import get_live_records
from internal.store.cache import cache_get, cache_set
from internal.store.portfolio import list_holdings
from internal.store.utils import as_float, coerce_iso_date
from internal.yahoo.client import load_ticker_modules, ticker as make_ticker
from models import MarketCalendarEvent, MarketCalendarResponse, MarketCalendarSummary

CALENDAR_TTL_SECONDS = 86_400
# Bulk screener quotes carry no dividendDate for Thai listings, so a small,
# hard-capped set of top payers gets a per-ticker lookup instead of the whole
# universe.
TOP_YIELD_ENRICH_LIMIT = 24
ENRICH_WORKERS = 6


def build_market_calendar(*, month: str | None, region: str) -> MarketCalendarResponse:
    resolved_month = _normalize_month(month)
    safe_region = region if region in {"all", "us", "th"} else "us"
    cache_key = f"v2:{resolved_month}:{safe_region}"
    cached = cache_get("market_calendar", cache_key)
    if cached is not None:
        return MarketCalendarResponse.model_validate(cached)

    holdings = {item.symbol.upper() for item in list_holdings()}
    events: list[MarketCalendarEvent] = []

    # Holdings get the accurate per-ticker read (ex-dividend + payment). This is
    # the only network fan-out and it is bounded by the user's holdings count.
    for symbol in sorted(holdings):
        if safe_region != "all" and _region_for_symbol(symbol) != safe_region:
            continue
        events.extend(_events_for_symbol(symbol, resolved_month, is_holding=True))

    # The rest of the market comes from the already-cached catalog records —
    # payment dates only, zero extra network calls.
    missing_date: list[dict[str, Any]] = []
    for record in _filter_records(get_live_records(), safe_region):
        symbol = str(record.get("symbol") or "").upper()
        if not symbol or symbol in holdings:
            continue
        if record.get("dividendDate") is None and (as_float(record.get("dividendYield")) or 0) > 0:
            missing_date.append(record)
            continue
        events.extend(_events_for_record(record, resolved_month))

    top_payers = sorted(missing_date, key=lambda r: as_float(r.get("dividendYield")) or 0, reverse=True)[:TOP_YIELD_ENRICH_LIMIT]
    if top_payers:
        with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as pool:
            for symbol_events in pool.map(
                lambda r: _events_for_symbol(str(r["symbol"]).upper(), resolved_month, is_holding=False),
                top_payers,
            ):
                events.extend(symbol_events)

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


def _events_for_symbol(symbol: str, month: str, *, is_holding: bool) -> list[MarketCalendarEvent]:
    info = merge_ticker_info(load_ticker_modules(make_ticker(symbol), symbol), symbol)
    name = str(info.get("shortName") or info.get("longName") or symbol)
    resolved_region = _region_for_symbol(symbol)
    amount = as_float(info.get("dividendRate"))
    event_specs = [
        ("ex-dividend", info.get("exDividendDate"), "Ex-dividend date"),
        ("payment", info.get("dividendDate"), "Dividend payment"),
    ]

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
                marketLabel="Thai SET" if resolved_region == "th" else "US",
                isHolding=is_holding,
                amount=amount if kind == "payment" else None,
                note=note,
            )
        )
    return events


def _events_for_record(record: dict[str, Any], month: str) -> list[MarketCalendarEvent]:
    symbol = str(record.get("symbol") or "").upper()
    event_date = _first_matching_month_date(record.get("dividendDate"), month)
    if not event_date:
        return []
    resolved_region = _region_for_record(record, symbol)
    return [
        MarketCalendarEvent(
            date=event_date,
            symbol=symbol,
            name=str(record.get("name") or symbol),
            kind="payment",
            region=resolved_region,  # type: ignore[arg-type]
            marketLabel="Thai SET" if resolved_region == "th" else "US",
            isHolding=False,
            amount=as_float(record.get("dividendRate")),
            note="Dividend payment",
        )
    ]


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


def _region_for_symbol(symbol: str) -> str:
    return "th" if symbol.endswith(".BK") else "us"


def _region_for_record(record: dict[str, Any], symbol: str) -> str:
    indexes = {str(value).lower() for value in record.get("indexes", [])}
    if "th" in indexes or symbol.endswith(".BK"):
        return "th"
    return "us"
