"""Deep AI swing read — entry/stop/target/risk-reward off a trailing window.

Ported from the Go proof-of-concept (`apps/go-api/internal/analysis/deep.go`)
so the Deep AI "Daily Signals" panel runs on the live yfinance backend instead
of FinFeed (whose domain returns a Cloudflare 403 to automated clients). The
read is deliberately rule-based off 30-day support/resistance — not ML/LLM —
exactly as the Go version was.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from internal.market.symbol import fetch_symbol_record
from internal.yahoo.client import fetch_history, ticker as make_ticker

WINDOW = 30

COLOR_BUY = "#3ecf8e"
COLOR_WAIT = "#f5c451"
COLOR_TRIM = "#f2575c"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def deep_analysis(symbol: str) -> dict[str, Any] | None:
    record = fetch_symbol_record(symbol)
    if not record:
        return None

    name = record.get("name") or symbol.upper()
    currency = record.get("currency") or "USD"
    price = float(record.get("price") or 0.0)
    change_percent = float(record.get("changePct") or 0.0)
    generated_at = datetime.now(timezone.utc).isoformat()

    history = fetch_history(make_ticker(symbol), period="3mo")
    candles: list[dict[str, float]] = []
    if not history.empty and {"High", "Low", "Close"}.issubset(history.columns):
        tail = history.tail(WINDOW)
        for index, row in tail.iterrows():
            close = float(row["Close"])
            if close <= 0:
                continue
            candles.append(
                {
                    "date": index.date().isoformat(),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": round(close, 2),
                }
            )

    chart = [{"date": candle["date"], "close": candle["close"]} for candle in candles]

    if len(candles) < 2 or price <= 0:
        return {
            "symbol": symbol.upper(),
            "name": name,
            "currency": currency,
            "price": price,
            "changePercent": change_percent,
            "signal": "LIMITED DATA",
            "color": COLOR_WAIT,
            "chart": chart,
            "entry": 0.0,
            "stop": 0.0,
            "target": 0.0,
            "riskReward": 0.0,
            "buyZoneLow": 0.0,
            "buyZoneHigh": 0.0,
            "action": (
                f"Not enough trading history came back for {symbol.upper()} yet to size an "
                "entry, stop, and target — try again once more bars are available."
            ),
            "bullets": ["yfinance returned too few historical bars for a reliable read."],
            "when": "right now",
            "generatedAt": generated_at,
        }

    support = min(candle["low"] for candle in candles if candle["low"] > 0)
    resistance = max(candle["high"] for candle in candles)
    range_size = resistance - support
    if range_size <= 0:
        range_size = support * 0.05 or 1.0

    position = _clamp01((price - support) / range_size)

    if position <= 0.35:
        entry = price
        signal, color, when = "BUY ZONE", COLOR_BUY, "this session"
    elif position >= 0.75:
        entry = support + range_size * 0.35
        signal, color, when = "WAIT / TRIM", COLOR_TRIM, "on a pullback"
    else:
        entry = support + range_size * 0.35
        signal, color, when = "WATCH", COLOR_WAIT, "on a dip toward support"

    stop = support - range_size * 0.08
    target = resistance + range_size * 0.15
    risk_reward = 0.0
    risk = entry - stop
    if risk > 0:
        risk_reward = (target - entry) / risk

    return {
        "symbol": symbol.upper(),
        "name": name,
        "currency": currency,
        "price": round(price, 2),
        "changePercent": round(change_percent, 2),
        "signal": signal,
        "color": color,
        "chart": chart,
        "entry": round(entry, 2),
        "stop": round(stop, 2),
        "target": round(target, 2),
        "riskReward": round(risk_reward, 2),
        "buyZoneLow": round(support, 2),
        "buyZoneHigh": round(support + range_size * 0.4, 2),
        "action": _action(symbol.upper(), signal, entry, stop, target),
        "bullets": _bullets(support, resistance, entry, stop, target, risk_reward),
        "when": when,
        "generatedAt": generated_at,
    }


def _action(symbol: str, signal: str, entry: float, stop: float, target: float) -> str:
    if signal == "BUY ZONE":
        return (
            f"{symbol} is trading inside its own buy zone right now. A limit near "
            f"{entry:.2f} with a stop at {stop:.2f} targets {target:.2f}."
        )
    if signal == "WAIT / TRIM":
        return (
            f"{symbol} is stretched toward the top of its 30-day range — better to wait "
            f"for a pullback near {entry:.2f} than chase it here."
        )
    return (
        f"{symbol} is mid-range. Set a limit near {entry:.2f} and let the stop at "
        f"{stop:.2f} and target {target:.2f} do the rest."
    )


def _bullets(support: float, resistance: float, entry: float, stop: float, target: float, risk_reward: float) -> list[str]:
    drop = (entry - stop) / entry * 100 if entry > 0 else 0.0
    gain = (target - entry) / entry * 100 if entry > 0 else 0.0
    return [
        f"30-day range: support {support:.2f}, resistance {resistance:.2f}.",
        f"Stop at {stop:.2f} caps downside to roughly {drop:.1f}% from the entry.",
        f"Target {target:.2f} implies {gain:.1f}% upside, a risk/reward of {risk_reward:.1f}.",
    ]
