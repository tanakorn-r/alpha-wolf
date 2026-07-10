from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import median
from typing import Any

import pandas as pd

from internal.market.deep import deep_analysis
from internal.market.detail import build_detail_bundle
from internal.market.scoring import StrategyKey
from internal.market.symbol import fetch_symbol_record
from internal.store.cache import cache_get, cache_set
from internal.store.utils import as_float
from internal.yahoo.client import fetch_dividends, fetch_history, ticker as make_ticker

BUY_TIMING_CACHE_NAMESPACE = "buy_timing"
BUY_TIMING_TTL_SECONDS = 900
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def build_buy_timing(symbol: str, strategy: StrategyKey = "stable_dca") -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    cache_key = f"v2:{normalized}:{strategy}"
    cached = cache_get(BUY_TIMING_CACHE_NAMESPACE, cache_key)
    if cached is not None:
        return cached

    stock = fetch_symbol_record(normalized)
    if not stock:
        return None

    ticker = make_ticker(normalized)

    # Fetch all four data sources in parallel — each is an independent network call.
    from concurrent.futures import ThreadPoolExecutor, as_completed as _as_completed

    history = pd.DataFrame()
    dividends = None
    detail: dict[str, Any] = {}
    deep: dict[str, Any] = {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {
            pool.submit(fetch_history, ticker, "5y"): "history",
            pool.submit(fetch_dividends, ticker, "5y"): "dividends",
            pool.submit(build_detail_bundle, normalized, strategy): "detail",
            pool.submit(deep_analysis, normalized): "deep",
        }
        for fut in _as_completed(futs):
            key = futs[fut]
            try:
                val = fut.result()
            except Exception as exc:
                print(f"Warning: buy_timing {key} fetch failed for {normalized}: {exc}")
                val = None
            if key == "history":
                history = val if val is not None else pd.DataFrame()
            elif key == "dividends":
                dividends = val
            elif key == "detail":
                detail = val or {}
            elif key == "deep":
                deep = val or {}

    closes = _close_series(history)
    current_price = _latest_close(closes) or as_float(stock.get("price")) or as_float(deep.get("price"))
    events = _dividend_events(closes, dividends)
    intervals = _event_intervals(events)
    cycle_days = int(round(median(intervals))) if intervals else (365 if events else None)
    cycle_confidence = "measured" if intervals else ("estimated_annual" if events else "none")
    next_ex = _infer_next_ex_date(events, cycle_days)
    today = date.today()
    days_to_ex = (next_ex - today).days if next_ex else None
    buy_start = next_ex + timedelta(days=1) if next_ex else None
    buy_end = next_ex + timedelta(days=10) if next_ex else None
    trim_start = next_ex - timedelta(days=10) if next_ex else None
    trim_end = next_ex - timedelta(days=1) if next_ex else None
    last_ex = events[-1]["date"] if events else None
    current_buy_start = last_ex + timedelta(days=1) if last_ex else None
    current_buy_end = last_ex + timedelta(days=10) if last_ex else None
    position_pct = _cycle_position(events, cycle_days, today)
    avg_dip = _average([event["dipPct"] for event in events])
    hit_rate = _hit_rate(events)
    recoveries = [event["recoverySessions"] for event in events if event["recoverySessions"] is not None]
    recovery_days = round(_average(recoveries)) if recoveries else None
    random_dip = _average_random_dip(closes)
    edge = (abs(avg_dip) - abs(random_dip)) if avg_dip is not None and random_dip is not None else None
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    entry_gap_pct = ((entry - current_price) / current_price * 100.0) if current_price and entry is not None else None
    upside_left_pct = ((target - current_price) / current_price * 100.0) if current_price and target is not None else None
    seasonality = _monthly_returns(closes)
    cheapest = min(seasonality, key=lambda item: item["returnPct"])["month"] if seasonality else None
    peak = max(seasonality, key=lambda item: item["returnPct"])["month"] if seasonality else None
    monthly_map = _monthly_map(seasonality, events, cycle_days, next_ex, today)
    price_context = _price_context(closes, current_price)
    timeline = _build_timeline(today, last_ex, next_ex, current_buy_start, current_buy_end, buy_start, buy_end, trim_start, trim_end)
    pattern_good = bool(avg_dip is not None and avg_dip < -0.3 and (hit_rate or 0) >= 55)
    action = _action(pattern_good, today, current_buy_start, current_buy_end, trim_start, trim_end, current_price, deep, price_context)
    headline, summary = _fallback_narrative(normalized, action, pattern_good, current_price, deep, avg_dip, hit_rate, buy_start, buy_end)

    result = {
        "symbol": normalized,
        "name": stock.get("name") or normalized,
        "currency": stock.get("currency") or deep.get("currency") or "USD",
        "price": current_price,
        "headline": headline,
        "summary": summary,
        "action": action,
        "narrativeSource": "calculated",
        "nextBuy": {"start": _iso(buy_start), "end": _iso(buy_end), "opensInDays": _days_until(buy_start, today), "label": _window_label(buy_start, buy_end)},
        "nextTrim": {"start": _iso(trim_start), "end": _iso(trim_end), "opensInDays": _days_until(trim_start, today), "label": _window_label(trim_start, trim_end)},
        "currentBuyWindow": {"start": _iso(current_buy_start), "end": _iso(current_buy_end), "isOpen": bool(current_buy_start and current_buy_end and current_buy_start <= today <= current_buy_end)},
        "entryBand": {
            "low": as_float(deep.get("buyZoneLow")) or entry,
            "high": as_float(deep.get("buyZoneHigh")) or entry,
            "entry": entry,
            "gapPct": round(entry_gap_pct, 2) if entry_gap_pct is not None else None,
            "upsideLeftPct": round(upside_left_pct, 2) if upside_left_pct is not None else None,
            "isAtOrBelowEntry": bool(current_price is not None and entry is not None and current_price <= entry * 1.005),
        },
        "cycle": {
            "nextExDate": _iso(next_ex),
            "lastExDate": _iso(events[-1]["date"]) if events else None,
            "cycleDays": cycle_days,
            "positionPct": position_pct,
            "daysToEx": days_to_ex,
            "isInferred": bool(next_ex and cycle_days),
            "confidence": cycle_confidence,
        },
        "postExDipPattern": {
            "hasPattern": pattern_good,
            "sampleSize": len(events),
            "hitRate": round(hit_rate, 1) if hit_rate is not None else None,
            "averageDipPct": round(avg_dip, 2) if avg_dip is not None else None,
            "averageRandomDipPct": round(random_dip, 2) if random_dip is not None else None,
        },
        "stats": {
            "cyclesTested": len(events),
            "cyclesHit": sum(1 for event in events if event["dipPct"] < 0),
            "avgPostExDipPct": round(avg_dip, 2) if avg_dip is not None else None,
            "fullRecoverySessions": recovery_days,
            "edgeVsRandomBuyPct": round(edge, 2) if edge is not None else None,
        },
        "priceContext": price_context,
        "timeline": timeline,
        "seasonality": seasonality,
        "cheapestMonth": cheapest,
        "peakMonth": peak,
        "monthlyMap": monthly_map,
        "events": [
            {
                "exDate": _iso(event["date"]),
                "amount": event["amount"],
                "dipPct": round(event["dipPct"], 2),
                "recoverySessions": event["recoverySessions"],
            }
            for event in events[-8:]
        ],
        "technicalContext": {
            "signal": deep.get("signal"),
            "entry": as_float(deep.get("entry")),
            "target": as_float(deep.get("target")),
            "stop": as_float(deep.get("stop")),
            "support": as_float(deep.get("support")),
            "resistance": as_float(deep.get("resistance")),
            "dividendPattern": detail.get("dividendPattern"),
        },
    }
    cache_set(BUY_TIMING_CACHE_NAMESPACE, cache_key, result, BUY_TIMING_TTL_SECONDS)
    return result


def apply_ai_narrative(result: dict[str, Any], narrative: dict[str, Any]) -> dict[str, Any]:
    return {
        **result,
        "headline": narrative.get("headline") or result["headline"],
        "summary": narrative.get("summary") or result["summary"],
        "action": narrative.get("action") or result["action"],
        "narrativeSource": narrative.get("source") or "openai",
        "model": narrative.get("model"),
        "recap": narrative.get("recap"),
        "agentFit": narrative.get("agentFit"),
        "agentFitReason": narrative.get("agentFitReason"),
        "generatedAt": narrative.get("generatedAt"),
    }


def _dividend_events(closes: pd.Series, dividends: pd.Series) -> list[dict[str, Any]]:
    if closes.empty or dividends is None or dividends.empty:
        return []
    events: list[dict[str, Any]] = []
    for ex_index, amount in dividends.dropna().items():
        ex_date = _date(ex_index)
        before = closes[closes.index.date <= ex_date]
        after = closes[(closes.index.date > ex_date) & (closes.index.date <= ex_date + timedelta(days=10))]
        after_30 = closes[(closes.index.date > ex_date) & (closes.index.date <= ex_date + timedelta(days=45))]
        if before.empty or after.empty:
            continue
        pre_price = float(before.iloc[-1])
        if not pre_price:
            continue
        post_low = float(after.min())
        recovery_sessions = None
        recovered = after_30[after_30 >= pre_price]
        if not recovered.empty:
            recovery_sessions = int(after_30.index.get_loc(recovered.index[0]) + 1)
        events.append({"date": ex_date, "amount": as_float(amount), "dipPct": (post_low - pre_price) / pre_price * 100.0, "recoverySessions": recovery_sessions})
    return sorted(events, key=lambda event: event["date"])


def _monthly_returns(closes: pd.Series) -> list[dict[str, Any]]:
    if closes.empty:
        return [{"month": month, "returnPct": 0.0} for month in MONTHS]
    monthly = closes.resample("ME").last().pct_change().dropna() * 100.0
    return [{"month": month, "returnPct": round(float(monthly[monthly.index.month == index + 1].mean()) if not monthly[monthly.index.month == index + 1].empty else 0.0, 2)} for index, month in enumerate(MONTHS)]


def _monthly_map(seasonality: list[dict[str, Any]], events: list[dict[str, Any]], cycle_days: int | None, next_ex: date | None, today: date) -> list[dict[str, Any]]:
    # Turn the two timing signals into one actionable per-calendar-month call: green = buy, red =
    # trim. Seasonality says which months are historically weak (accumulate) vs strong (lighten);
    # the dividend cycle says which months hold the post-ex dip (buy) vs the pre-ex run-up (trim).
    # We blend them 50/50 when a cycle exists, else fall back to seasonality alone.
    returns = [float(item.get("returnPct") or 0.0) for item in seasonality] if seasonality else [0.0] * 12
    max_abs = max((abs(value) for value in returns), default=0.0) or 1.0

    buy_months: set[int] = set()
    trim_months: set[int] = set()
    ex_months: set[int] = set()
    anchor = next_ex or (events[-1]["date"] if events else None)
    if anchor and cycle_days and cycle_days > 0:
        # Project ex-dates across a wide window so every calendar month is covered regardless of
        # cycle length (quarterly fills ~4 buy/4 trim months, semi-annual ~2 each).
        step = timedelta(days=cycle_days)
        event = anchor
        while event > today - timedelta(days=400):
            event -= step
        limit = today + timedelta(days=400)
        while event <= limit:
            # At month granularity: the ex month is the pre-dividend run-up (trim into strength),
            # the following month carries the post-ex dip + recovery (buy). A ±few-day split would
            # collapse both into the ex month and cancel out, so separate them by a month.
            ex_months.add(event.month - 1)
            trim_months.add(event.month - 1)
            buy_months.add((event + timedelta(days=20)).month - 1)
            event += step

    has_cycle = bool(buy_months or trim_months)
    w_season = 0.5 if has_cycle else 1.0
    w_cycle = 0.5 if has_cycle else 0.0

    result: list[dict[str, Any]] = []
    for index, month in enumerate(MONTHS):
        seasonal_unit = max(-1.0, min(1.0, -returns[index] / max_abs))  # weak month (drop) -> buy
        cycle_unit = 0.0
        in_buy = index in buy_months
        in_trim = index in trim_months
        if in_buy and not in_trim:
            cycle_unit = 1.0
        elif in_trim and not in_buy:
            cycle_unit = -1.0
        score = round((w_season * seasonal_unit + w_cycle * cycle_unit) * 100)
        action = "BUY" if score >= 20 else "TRIM" if score <= -20 else "HOLD"
        notes: list[str] = []
        if in_buy and not in_trim:
            notes.append("post-ex dip window")
        if in_trim and not in_buy:
            notes.append("pre-ex run-up")
        if seasonal_unit >= 0.35:
            notes.append("seasonally weak")
        elif seasonal_unit <= -0.35:
            notes.append("seasonally strong")
        result.append({
            "month": month,
            "score": score,
            "action": action,
            "returnPct": round(returns[index], 2),
            "isExMonth": index in ex_months,
            "isCurrent": index == today.month - 1,
            "note": ", ".join(notes) or "neutral",
        })
    return result


def _price_context(closes: pd.Series, current_price: float | None) -> dict[str, Any] | None:
    if closes.empty or len(closes) < 30 or not current_price:
        return None
    low = float(closes.min())
    high = float(closes.max())
    avg = float(closes.mean())
    span = high - low
    current_pct = round((current_price - low) / span * 100.0, 1) if span > 0 else 50.0
    vs_avg = round((current_price - avg) / avg * 100.0, 1) if avg else None
    years = round((closes.index[-1] - closes.index[0]).days / 365.0, 1)
    return {
        "years": years,
        "samples": len(closes),
        "avgPrice": round(avg, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "currentPct": current_pct,
        "vsAvgPct": vs_avg,
    }


def _build_timeline(
    today: date,
    last_ex: date | None,
    next_ex: date | None,
    current_buy_start: date | None,
    current_buy_end: date | None,
    buy_start: date | None,
    buy_end: date | None,
    trim_start: date | None,
    trim_end: date | None,
) -> dict[str, Any] | None:
    # Frame one full cycle: the last ex-div (left) through the next post-ex reversal dip (right).
    # Trim zone lands just before the next ex-div (pre-dividend run-up); buy zone lands just after
    # it (the reversal dip) — that is where the actionable buy actually is, not the stale left edge.
    if not last_ex or not next_ex or not buy_end:
        return None
    start = last_ex
    end = buy_end
    total = (end - start).days
    if total <= 0:
        return None

    def pct(value: date | None) -> float | None:
        if value is None:
            return None
        return round(max(0.0, min(100.0, (value - start).days / total * 100.0)), 1)

    return {
        "start": _iso(start),
        "end": _iso(end),
        "todayPct": pct(today),
        "nextExPct": pct(next_ex),
        "buyZone": {
            "startPct": pct(buy_start),
            "endPct": pct(buy_end),
            "start": _iso(buy_start),
            "end": _iso(buy_end),
            "label": _window_label(buy_start, buy_end),
        },
        "trimZone": {
            "startPct": pct(trim_start),
            "endPct": pct(trim_end),
            "start": _iso(trim_start),
            "end": _iso(trim_end),
            "label": _window_label(trim_start, trim_end),
        },
    }


def _action(
    pattern_good: bool,
    today: date,
    current_buy_start: date | None,
    current_buy_end: date | None,
    trim_start: date | None,
    trim_end: date | None,
    current_price: float | None,
    deep: dict[str, Any],
    price_context: dict[str, Any] | None,
) -> str:
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    price_is_low_enough = current_price is not None and entry is not None and current_price <= entry * 1.005
    has_upside = current_price is not None and target is not None and target > current_price * 1.02
    in_buy_window = bool(current_buy_start and current_buy_end and current_buy_start <= today <= current_buy_end)
    in_trim_window = bool(trim_start and trim_end and trim_start <= today <= trim_end)
    # A 3-month "entry" can flag BUY even when price sits near a 5-year high; block that so we
    # only buy the reversal/cheap side of the multi-year range, not a local pullback at the top.
    overextended = bool(price_context and (price_context.get("currentPct") or 0) >= 85)
    if price_is_low_enough and has_upside and not overextended:
        return "BUY"
    if pattern_good and in_buy_window and (entry is None or price_is_low_enough) and (target is None or has_upside) and not overextended:
        return "BUY"
    if (in_trim_window or overextended) and not price_is_low_enough:
        return "TRIM"
    return "WAIT"


def _fallback_narrative(symbol: str, action: str, pattern_good: bool, current_price: float | None, deep: dict[str, Any], avg_dip: float | None, hit_rate: float | None, buy_start: date | None, buy_end: date | None) -> tuple[str, str]:
    dip = f"{abs(avg_dip):.1f}%" if avg_dip is not None else "no measured"
    hit = f"{hit_rate:.0f}%" if hit_rate is not None else "not enough"
    window = _window_label(buy_start, buy_end) or "the next confirmed ex-dividend window"
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    price_note = _price_note(current_price, entry, target)
    if action == "BUY":
        return f"Buy the weakness, not the green candle.", f"{symbol} is at or below the entry zone with upside still left. {price_note}"
    if action == "TRIM":
        return f"Do not add while price is strong.", f"Wait for weakness instead. The next cleaner buy window is {window}, after the expected ex-dividend reset."
    if not pattern_good:
        return f"Wait for the price to come down.", f"The dividend dip pattern is not consistent enough yet ({hit} hit rate). Buy only if price reaches the entry zone with upside left."
    return f"Wait for the next dip, not the green move.", f"The next buy window is {window}. The usual post-ex dip is about {dip} and happened {hit} of the time."


def _price_note(current_price: float | None, entry: float | None, target: float | None) -> str:
    if current_price is None or entry is None:
        return "Use the entry band before adding."
    entry_gap = (entry - current_price) / current_price * 100.0 if current_price else 0.0
    if target is None:
        return f"Entry is {entry_gap:+.1f}% from the current price."
    upside = (target - current_price) / current_price * 100.0 if current_price else 0.0
    return f"Entry is {entry_gap:+.1f}% from now and target upside is {upside:+.1f}%."


def _close_series(history: pd.DataFrame) -> pd.Series:
    if history.empty or "Close" not in history.columns:
        return pd.Series(dtype="float64")
    closes = history["Close"].dropna().copy()
    closes.index = pd.to_datetime(closes.index)
    return closes


def _latest_close(closes: pd.Series) -> float | None:
    return float(closes.iloc[-1]) if not closes.empty else None


def _event_intervals(events: list[dict[str, Any]]) -> list[int]:
    return [(events[index]["date"] - events[index - 1]["date"]).days for index in range(1, len(events)) if 20 <= (events[index]["date"] - events[index - 1]["date"]).days <= 370]


def _infer_next_ex_date(events: list[dict[str, Any]], cycle_days: int | None) -> date | None:
    if not events or cycle_days is None:
        return None
    next_date = events[-1]["date"] + timedelta(days=cycle_days)
    today = date.today()
    while next_date <= today:
        next_date += timedelta(days=cycle_days)
    return next_date


def _cycle_position(events: list[dict[str, Any]], cycle_days: int | None, today: date) -> float | None:
    if not events or not cycle_days:
        return None
    last = events[-1]["date"]
    while last + timedelta(days=cycle_days) <= today:
        last += timedelta(days=cycle_days)
    return round(max(0.0, min(100.0, ((today - last).days / cycle_days) * 100.0)), 1)


def _average(values: list[float | int | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return sum(clean) / len(clean) if clean else None


def _hit_rate(events: list[dict[str, Any]]) -> float | None:
    return sum(1 for event in events if event["dipPct"] < 0) / len(events) * 100.0 if events else None


def _average_random_dip(closes: pd.Series) -> float | None:
    if len(closes) < 60:
        return None
    dips: list[float] = []
    for index in range(0, len(closes) - 10, 21):
        price = float(closes.iloc[index])
        low = float(closes.iloc[index + 1 : index + 11].min())
        if price:
            dips.append((low - price) / price * 100.0)
    return _average(dips)


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.to_datetime(value).date()


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _days_until(value: date | None, today: date) -> int | None:
    return (value - today).days if value else None


def _window_label(start: date | None, end: date | None) -> str | None:
    if not start or not end:
        return None
    if start.month == end.month:
        return f"{start.strftime('%b')} {start.day} - {end.day}"
    return f"{start.strftime('%b')} {start.day} - {end.strftime('%b')} {end.day}"
