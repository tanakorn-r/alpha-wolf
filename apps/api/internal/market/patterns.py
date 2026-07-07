from __future__ import annotations

from typing import Any, Literal

import pandas as pd

from internal.yahoo.client import fetch_history, ticker as make_ticker

Timeframe = Literal["1D", "1W"]

MAX_MOVES = 100
FLAT_MOVE_THRESHOLD = 0.08


def upward_moves(symbol: str, timeframe: Timeframe) -> dict[str, Any] | None:
    history = fetch_history(make_ticker(symbol), period="2y")
    if history.empty or "Close" not in history.columns:
        return None

    daily_closes = history["Close"].dropna()
    # Latest real traded price — anchors the compounded trajectory and entry/target table.
    current_price = round(float(daily_closes.iloc[-1]), 2) if len(daily_closes) else 0.0

    closes = daily_closes
    if timeframe == "1W":
        closes = closes.resample("W").last().dropna()
    if len(closes) < 10:
        return None

    history_points = [
        {"date": str(date.date()), "close": round(float(value), 2)}
        for date, value in closes.tail(100).items()
    ]

    pct_change = closes.pct_change().dropna() * 100.0
    up_moves = pct_change[pct_change > 0]
    if up_moves.empty:
        return {"symbol": symbol, "timeframe": timeframe, "currentPrice": current_price, "moves": [], "sampleSize": 0, "averageMovePct": 0.0}

    # Real statistic, not a fabricated score: each move's confidence is its
    # percentile rank within this stock's own historical up-move distribution.
    # rank() preserves up_moves' DatetimeIndex, so it can be looked up by date.
    ranks = up_moves.rank(pct=True) * 100.0

    recent = up_moves.tail(MAX_MOVES).sort_index(ascending=False)
    moves = [
        {
            "date": str(date.date()),
            "movePct": round(float(value), 2),
            "confidence": round(float(ranks.loc[date]), 0),
        }
        for date, value in recent.items()
    ]

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "currentPrice": current_price,
        "moves": moves,
        "sampleSize": len(up_moves),
        "averageMovePct": round(float(up_moves.mean()), 2),
    }


def signed_moves(symbol: str, timeframe: Timeframe) -> dict[str, Any] | None:
    history = fetch_history(make_ticker(symbol), period="2y")
    if history.empty or "Close" not in history.columns:
        return None

    return signed_moves_from_history(symbol, timeframe, history)


def signed_moves_from_points(symbol: str, timeframe: Timeframe, history: list[dict[str, Any]]) -> dict[str, Any] | None:
    rows: list[tuple[pd.Timestamp, float]] = []
    for point in history:
        close = point.get("close")
        date = point.get("date")
        if close is None or not date:
            continue
        try:
            rows.append((pd.Timestamp(str(date)), float(close)))
        except (TypeError, ValueError):
            continue
    if not rows:
        return None

    frame = pd.DataFrame({"Close": [close for _, close in rows]}, index=[date for date, _ in rows]).sort_index()
    return signed_moves_from_history(symbol, timeframe, frame)


def signed_moves_from_history(symbol: str, timeframe: Timeframe, history: pd.DataFrame) -> dict[str, Any] | None:
    if history.empty or "Close" not in history.columns:
        return None

    daily_closes = history["Close"].dropna().astype(float)
    current_price = round(float(daily_closes.iloc[-1]), 2) if len(daily_closes) else 0.0

    closes = daily_closes
    if timeframe == "1W":
        closes = closes.resample("W").last().dropna()
    if len(closes) < 10:
        return None

    history_points = [
        {"date": str(date.date()), "close": round(float(value), 2)}
        for date, value in closes.tail(100).items()
    ]

    pct_change = (closes.pct_change().dropna() * 100.0).dropna()
    if pct_change.empty:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "currentPrice": current_price,
            "history": history_points,
            "moves": [],
            "sampleSize": 0,
            "averageMovePct": 0.0,
            "averageAbsMovePct": 0.0,
            "upMoveRatePct": 0.0,
        }

    ranked = pd.DataFrame(
        {
            "movePct": pct_change.astype(float),
            "confidence": (pct_change.abs().rank(pct=True) * 100.0).astype(float),
        }
    )
    recent_window = pct_change.tail(10)
    recent_abs = recent_window.abs()
    recent_up_rate = float((recent_window > 0).mean() * 100) if len(recent_window) else 0.0
    recent_direction_changes = int((recent_window.apply(_direction_from_move) != recent_window.apply(_direction_from_move).shift()).sum() - 1) if len(recent_window) > 1 else 0
    volatility_ratio = float(recent_abs.mean() / pct_change.abs().mean()) if float(pct_change.abs().mean()) > 0 else 1.0
    volatility_regime = _volatility_regime(volatility_ratio, recent_abs.max() if len(recent_abs) else 0.0)
    recent = ranked.tail(MAX_MOVES).sort_index(ascending=False)
    moves = []
    for date, row in recent.iterrows():
        idx = closes.index.get_loc(date)
        if isinstance(idx, slice) or isinstance(idx, list) or hasattr(idx, "__len__"):
            continue
        previous_close = float(closes.iloc[max(0, int(idx) - 1)])
        close = float(closes.iloc[int(idx)])
        move_pct = float(row["movePct"])
        direction = _direction_from_move(move_pct)
        confidence = int(round(float(row["confidence"])))
        moves.append(
            {
                "date": str(date.date()),
                "fromPrice": round(previous_close, 2),
                "toPrice": round(close, 2),
                "movePct": round(move_pct, 2),
                "direction": direction,
                "confidence": confidence,
                "reason": _historical_move_reason(move_pct, confidence, direction),
            }
        )

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "currentPrice": current_price,
        "history": history_points,
        "moves": moves,
        "sampleSize": len(pct_change),
        "averageMovePct": round(float(pct_change.mean()), 2),
        "averageAbsMovePct": round(float(pct_change.abs().mean()), 2),
        "upMoveRatePct": round(float((pct_change > 0).mean() * 100), 2),
        "recentAverageMovePct": round(float(recent_window.mean()), 2),
        "recentAverageAbsMovePct": round(float(recent_abs.mean()), 2),
        "recentMaxAbsMovePct": round(float(recent_abs.max()), 2),
        "recentUpMoveRatePct": round(recent_up_rate, 2),
        "recentDirectionChanges": max(0, recent_direction_changes),
        "volatilityRatio": round(volatility_ratio, 2),
        "volatilityRegime": volatility_regime,
    }


def _direction_from_move(move_pct: float) -> Literal["UP", "DOWN", "FLAT"]:
    if move_pct > FLAT_MOVE_THRESHOLD:
        return "UP"
    if move_pct < -FLAT_MOVE_THRESHOLD:
        return "DOWN"
    return "FLAT"


def _historical_move_reason(move_pct: float, confidence: float, direction: str) -> str:
    magnitude = abs(move_pct)
    if direction == "FLAT":
        return "Low-volatility pause; useful as a base-rate check before the forecast path."
    if confidence >= 85:
        return f"Large {direction.lower()} impulse versus this ticker's own history; volatility regime mattered."
    if confidence >= 65:
        return f"Meaningful {direction.lower()} move; recent tape had enough force to affect confidence."
    if magnitude <= 0.35:
        return "Small move; treat it as context, not a strong directional signal."
    return f"Normal {direction.lower()} move; helps calibrate the next-path range."


def _volatility_regime(volatility_ratio: float, recent_max_abs_move: float) -> Literal["quiet", "normal", "active", "violent"]:
    if recent_max_abs_move >= 4.0 or volatility_ratio >= 1.8:
        return "violent"
    if recent_max_abs_move >= 2.0 or volatility_ratio >= 1.25:
        return "active"
    if volatility_ratio <= 0.65:
        return "quiet"
    return "normal"
