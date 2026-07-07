from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/live-trade", tags=["live-trade"])


@router.get("/screener")
def live_trade_screener(
    preset: str = Query("overbought", pattern="^(overbought|oversold|active|turning)$"),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    source = "tradingview-screener"
    warning = ""

    try:
        from tradingview_screener import Query as TvQuery, col

        query = TvQuery().select("close", "change", "volume", "RSI", "RSI|5", "relative_volume_10d_calc")
        if preset == "overbought":
            query = query.where(col("RSI") > 70).order_by("volume", ascending=False)
        elif preset == "oversold":
            query = query.where(col("RSI") < 35).order_by("volume", ascending=False)
        elif preset == "turning":
            query = query.where(col("RSI") > 45, col("RSI") < 62, col("change") > 0).order_by("relative_volume_10d_calc", ascending=False)
        else:
            query = query.where(col("relative_volume_10d_calc") > 1.5).order_by("relative_volume_10d_calc", ascending=False)

        _, data = query.limit(limit).get_scanner_data()
        rows = [_normalize_row(row) for row in data.to_dict("records")]
    except Exception as exc:  # package is optional in local/dev until installed
        source = "unavailable"
        warning = f"TradingView screener is unavailable: {exc}"
        rows = []

    return {"preset": preset, "source": source, "warning": warning, "rows": rows[:limit]}


@router.get("/quote")
def live_trade_quote(symbol: str = Query(..., min_length=1, max_length=24)) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    try:
        from tradingview_screener import Query as TvQuery, col

        rows = []
        for field, value in _symbol_matchers(normalized):
            _, data = (
                TvQuery()
                .select("close", "change", "volume", "RSI", "RSI|5", "relative_volume_10d_calc")
                .where(col(field) == value)
                .limit(1)
                .get_scanner_data()
            )
            rows = data.to_dict("records")
            if rows:
                break
        if not rows:
            return {"symbol": normalized, "source": "tradingview-screener", "warning": "No live TradingView quote matched this symbol.", "row": None}
        return {"symbol": normalized, "source": "tradingview-screener", "warning": "", "row": _normalize_row(rows[0])}
    except Exception as exc:
        return {"symbol": normalized, "source": "unavailable", "warning": f"TradingView quote is unavailable: {exc}", "row": None}


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    symbol = str(row.get("ticker") or row.get("name") or "")
    symbol = symbol.replace("NASDAQ:", "").replace("NYSE:", "").replace("AMEX:", "").replace("CBOE:", "")
    close = _number(row.get("close"))
    change = _number(row.get("change"))
    rsi = _number(row.get("RSI"))
    rsi5 = _number(row.get("RSI|5"))
    rel_volume = _number(row.get("relative_volume_10d_calc"))
    return {
        "symbol": symbol,
        "name": symbol,
        "price": close,
        "changePct": change,
        "volume": _number(row.get("volume")),
        "relativeVolume": rel_volume,
        "rsi": rsi,
        "rsi5": rsi5,
        "signal": _signal(change, rsi, rsi5, rel_volume),
    }


def _symbol_matchers(symbol: str) -> list[tuple[str, str]]:
    if ":" in symbol:
        raw = symbol.split(":", 1)[1]
        return [("ticker", symbol), ("name", raw)]
    return [
        ("name", symbol),
        ("ticker", f"NASDAQ:{symbol}"),
        ("ticker", f"NYSE:{symbol}"),
        ("ticker", f"AMEX:{symbol}"),
        ("ticker", f"CBOE:{symbol}"),
    ]


def _signal(change: float | None, rsi: float | None, rsi5: float | None, rel_volume: float | None) -> str:
    if rsi is not None and rsi >= 75:
        return "Hot tape"
    if rsi is not None and rsi <= 35 and change is not None and change > 0:
        return "Possible turn"
    if rel_volume is not None and rel_volume >= 2:
        return "Volume spike"
    if rsi5 is not None and rsi is not None and rsi5 > rsi:
        return "Intraday improving"
    return "Watch"


def _number(value: Any) -> float | None:
    try:
        if value is None:
            return None
        parsed = float(value)
        if parsed != parsed:
            return None
        return parsed
    except (TypeError, ValueError):
        return None
