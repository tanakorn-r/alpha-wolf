from __future__ import annotations

import math
from typing import Any

from internal.store.cache import cache_get, cache_set
from internal.market.catalog import get_market_catalog
from models import UniverseEntry

LIVE_RECORDS_TTL_SECONDS = 60
EMPTY_TTL_SECONDS = 15


def get_live_universe_entries() -> list[UniverseEntry]:
    cached = cache_get("live_universe", "all")
    if cached is not None:
        return cached

    entries = [
        UniverseEntry(
            symbol=str(record.get("symbol") or "").upper(),
            name=str(record.get("name") or record.get("shortName") or record.get("longName") or record.get("symbol") or ""),
            sector=str(record.get("sector") or "Unknown"),
            indexes=tuple(sorted(str(index) for index in record.get("indexes", []) if str(index).strip())),
        )
        for record in get_market_catalog()
        if str(record.get("symbol") or "").strip()
    ]

    if entries:
        cache_set("live_universe", "all", entries, LIVE_RECORDS_TTL_SECONDS)
        return entries

    cache_set("live_universe", "all", [], EMPTY_TTL_SECONDS)
    return []


def get_live_records() -> list[dict[str, Any]]:
    cached = cache_get("live_records", "all")
    if cached is not None:
        return cached

    records = get_market_catalog()
    if records:
        cache_set("live_records", "all", records, LIVE_RECORDS_TTL_SECONDS)
        return records

    cache_set("live_records", "all", [], EMPTY_TTL_SECONDS)
    return []


def paginate_records(records: list[dict[str, Any]], page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
    total_pages = max(1, math.ceil(len(records) / max(limit, 1)))
    safe_page = min(max(page, 1), total_pages)
    start = (safe_page - 1) * limit
    end = start + limit
    return records[start:end], total_pages


def build_market_page(
    *,
    page: int,
    limit: int,
    strategy: str | None = None,
    mode: str | None = None,
    sort: str = "score",
    region: str = "all",
    query: str = "",
) -> tuple[list[dict[str, Any]], int, int]:
    records = get_market_catalog()
    if region in {"us", "th"}:
        records = [record for record in records if region in record.get("indexes", [])]
    term = query.strip().lower()
    if term:
        records = [record for record in records if term in str(record.get("symbol") or "").lower() or term in str(record.get("name") or "").lower()]
    records = _sort_market_records(records, strategy=strategy, mode=mode, sort=sort)
    page_items, total_pages = paginate_records(records, page, limit)
    return page_items, total_pages, len(records)


def _sort_market_records(records: list[dict[str, Any]], *, strategy: str | None, mode: str | None, sort: str) -> list[dict[str, Any]]:
    if sort == "yield":
        return sorted(records, key=lambda record: (_strategy_score(record, "yield"), record.get("marketCap") or 0), reverse=True)
    if sort == "change":
        return sorted(records, key=lambda record: (_num(record.get("changePct")), _mode_score(record, mode, strategy)), reverse=False)
    if sort == "name":
        return sorted(records, key=lambda record: str(record.get("symbol") or ""))
    return sorted(records, key=lambda record: (_mode_score(record, mode, strategy), record.get("marketCap") or 0), reverse=True)


def _mode_score(record: dict[str, Any], mode: str | None, strategy: str | None = None) -> int:
    selected = mode if mode in {"swing", "day", "long", "value", "fomo"} else None
    if not selected:
        return _strategy_score(record, strategy or "capitalized")

    momentum = _strategy_score(record, "momentum")
    value = _strategy_score(record, "capitalized")
    long_term = _strategy_score(record, "stable_dca")
    income = _strategy_score(record, "yield")
    change = _num(record.get("changePct"))
    weekly = _num(record.get("weeklyTrend"))
    monthly = _num(record.get("monthlyTrend")) if record.get("monthlyTrend") is not None else weekly
    quarterly = _num(record.get("quarterlyTrend")) if record.get("quarterlyTrend") is not None else _num(record.get("oneYearReturn"))
    one_year = _num(record.get("oneYearReturn")) if record.get("oneYearReturn") is not None else None
    relative_position = _num(record.get("relativePosition")) if record.get("relativePosition") is not None else None
    volume_ratio = _num(record.get("volumeRatio")) if record.get("volumeRatio") is not None else None

    today_impulse = _bounded_score(change, -2.5, 6.5)
    today_pullback = _bounded_score(-change, -2, 6)
    short_trend = _bounded_score(monthly, -12, 24)
    mid_trend = _bounded_score(quarterly, -25, 70)
    yearly_strength = 42 if one_year is None else _bounded_score(one_year, -40, 95)
    entry_value = 42 if relative_position is None else _bounded_score(1 - relative_position, 0, 1)
    swing_zone = _swing_turning_zone_score(record)
    turn_signal = _turn_signal_score(change)
    volume = 42 if volume_ratio is None else _bounded_score(volume_ratio, 0.55, 2.8)
    calm_tape = _bounded_score(-abs(change), -6, 0)
    price_heat_penalty = (
        (16 if relative_position is not None and relative_position > 0.78 else 0)
        + (8 if monthly > 18 else 0)
        + (8 if change > 6 else 0)
    )

    if selected == "swing":
        raw = 0.34 * swing_zone + 0.18 * turn_signal + 0.16 * value + 0.12 * volume + 0.10 * momentum + 0.06 * entry_value + 0.04 * mid_trend - price_heat_penalty
        return _distributed_mode_score(raw, 51, 1.58)
    if selected == "day":
        raw = 0.38 * today_impulse + 0.28 * momentum + 0.16 * volume + 0.10 * short_trend + 0.08 * calm_tape
        return _distributed_mode_score(raw, 50, 1.55)
    if selected == "long":
        raw = 0.36 * long_term + 0.24 * value + 0.18 * income + 0.12 * calm_tape + 0.10 * yearly_strength
        return _distributed_mode_score(raw, 52, 1.42)
    if selected == "value":
        raw = 0.48 * value + 0.22 * entry_value + 0.14 * long_term + 0.10 * today_pullback + 0.06 * income
        return _distributed_mode_score(raw, 45, 1.85)
    raw = 0.42 * momentum + 0.24 * today_impulse + 0.14 * yearly_strength + 0.12 * volume + 0.08 * short_trend
    return _distributed_mode_score(raw, 52, 1.58)


def _strategy_score(record: dict[str, Any], strategy: str | None) -> int:
    scores = record.get("strategyScores")
    if not isinstance(scores, dict):
        return 30
    value = scores.get(strategy or "")
    return int(value) if isinstance(value, (int, float)) else 30


def _swing_turning_zone_score(record: dict[str, Any]) -> int:
    relative_position = _num(record.get("relativePosition")) if record.get("relativePosition") is not None else None
    if relative_position is not None:
        if 0.16 <= relative_position <= 0.46:
            return 96
        if 0.06 <= relative_position < 0.16:
            return 82
        if 0.46 < relative_position <= 0.62:
            return 66
        if relative_position < 0.06:
            return 56
        if relative_position <= 0.74:
            return 42
        if relative_position <= 0.86:
            return 24
        return 10

    if record.get("monthlyTrend") is None:
        longer_trend = _num(record.get("oneYearReturn")) if record.get("oneYearReturn") is not None else None
        if longer_trend is not None and -12 <= longer_trend <= 5:
            return 52
        if longer_trend is not None and -25 <= longer_trend < -12:
            return 42
        if longer_trend is not None and 5 < longer_trend <= 12:
            return 36
        if longer_trend is not None and longer_trend > 12:
            return 24
        return 40
    trend = _num(record.get("monthlyTrend"))
    if -10 <= trend <= 4:
        return 78
    if 4 < trend <= 12:
        return 58
    if -22 <= trend < -10:
        return 52
    if trend > 12:
        return 30
    return 24


def _turn_signal_score(change_pct: float) -> int:
    if 0.15 <= change_pct <= 3.2:
        return 94
    if 3.2 < change_pct <= 5.5:
        return 66
    if change_pct > 5.5:
        return 30
    if change_pct > -1.5:
        return 70
    if change_pct > -3.5:
        return 42
    return 18


def _bounded_score(value: float, low: float, high: float) -> float:
    if high <= low:
        return 50.0
    return max(0.0, min(100.0, ((value - low) / (high - low)) * 100.0))


def _distributed_mode_score(value: float, center: float = 52.0, spread: float = 1.46) -> int:
    shaped = center + (value - center) * spread
    if value >= 78:
        shaped += 5
    elif value >= 68:
        shaped += 2
    elif value <= 34:
        shaped -= 7
    elif value <= 44:
        shaped -= 4
    return max(0, min(100, round(shaped)))


def _num(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if number == number else 0.0
