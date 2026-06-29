from __future__ import annotations

from typing import Any, Literal

import pandas as pd

from internal.yahoo.client import fetch_history, ticker as make_ticker

Timeframe = Literal["1D", "1W"]

MAX_MOVES = 100


def upward_moves(symbol: str, timeframe: Timeframe) -> dict[str, Any] | None:
    history = fetch_history(make_ticker(symbol), period="2y")
    if history.empty or "Close" not in history.columns:
        return None

    closes = history["Close"].dropna()
    if timeframe == "1W":
        closes = closes.resample("W").last().dropna()
    if len(closes) < 10:
        return None

    pct_change = closes.pct_change().dropna() * 100.0
    up_moves = pct_change[pct_change > 0]
    if up_moves.empty:
        return {"symbol": symbol, "timeframe": timeframe, "moves": [], "sampleSize": 0, "averageMovePct": 0.0}

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
        "moves": moves,
        "sampleSize": len(up_moves),
        "averageMovePct": round(float(up_moves.mean()), 2),
    }
