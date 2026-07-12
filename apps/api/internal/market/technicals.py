from __future__ import annotations

import math
from datetime import datetime, timezone
from statistics import pstdev
from typing import Any

import pandas as pd

from internal.store.utils import as_float


def extract_closes(history: pd.DataFrame) -> pd.Series:
    if history.empty:
        return pd.Series(dtype="float64")
    column = "Adj Close" if "Adj Close" in history.columns else "Close"
    if column not in history.columns:
        return pd.Series(dtype="float64")
    return history[column].dropna().astype(float)


def rolling_mean(series: pd.Series, window: int) -> float | None:
    if series.empty or len(series) < window:
        return None
    return float(series.tail(window).mean())


def rolling_ema(series: pd.Series, window: int) -> float | None:
    if series.empty or len(series) < window:
        return None
    return float(series.ewm(span=window, adjust=False).mean().iloc[-1])


def compute_rsi(series: pd.Series, window: int = 14) -> float | None:
    if series.empty or len(series) <= window:
        return None
    delta = series.diff().dropna()
    gain = delta.clip(lower=0).rolling(window=window).mean()
    loss = (-delta.clip(upper=0)).rolling(window=window).mean()
    if gain.empty or loss.empty:
        return None
    rs = gain.iloc[-1] / loss.iloc[-1] if loss.iloc[-1] not in (0, None) else None
    if rs is None or math.isnan(rs) or math.isinf(rs):
        return 100.0 if (loss.iloc[-1] or 0) == 0 and (gain.iloc[-1] or 0) > 0 else None
    return 100 - (100 / (1 + rs))


def compute_macd(series: pd.Series) -> tuple[float | None, float | None, float | None]:
    if series.empty or len(series) < 35:
        return None, None, None
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    histogram = macd - signal
    return float(macd.iloc[-1]), float(signal.iloc[-1]), float(histogram.iloc[-1])


def compute_stochastic(
    closes: pd.Series,
    highs: pd.Series,
    lows: pd.Series,
    window: int = 14,
) -> tuple[float | None, float | None]:
    if len(closes) < window or len(highs) < window or len(lows) < window:
        return None, None
    frame = pd.concat(
        [closes.rename("close"), highs.rename("high"), lows.rename("low")],
        axis=1,
        join="inner",
    ).dropna()
    if len(frame) < window:
        return None, None
    rolling_low = frame["low"].rolling(window).min()
    rolling_high = frame["high"].rolling(window).max()
    spread = (rolling_high - rolling_low).replace(0, float("nan"))
    k_series = ((frame["close"] - rolling_low) / spread * 100).dropna()
    if k_series.empty:
        return None, None
    d_series = k_series.rolling(3).mean().dropna()
    return float(k_series.iloc[-1]), float(d_series.iloc[-1]) if not d_series.empty else None


def return_over_window(closes: pd.Series, window: int) -> float:
    if len(closes) <= window:
        return 0.0
    start = float(closes.iloc[-(window + 1)])
    end = float(closes.iloc[-1])
    if start == 0:
        return 0.0
    return ((end - start) / start) * 100.0


def year_to_date_return(series: pd.Series) -> float | None:
    if series.empty:
        return None
    start_of_year = None
    for index, value in series.items():
        when = index.to_pydatetime() if hasattr(index, "to_pydatetime") else index
        if getattr(when, "year", None) == datetime.now(timezone.utc).year:
            start_of_year = float(value)
            break
    if start_of_year is None:
        start_of_year = float(series.iloc[0])
    current = float(series.iloc[-1])
    if start_of_year == 0:
        return None
    return ((current - start_of_year) / start_of_year) * 100.0


def daily_volatility(closes: pd.Series) -> float:
    if len(closes) < 10:
        return 0.0
    returns = closes.pct_change().dropna().tail(20)
    if len(returns) < 2:
        return 0.0
    return float(pstdev([float(value) for value in returns])) * 100.0


def trend_summary(series: pd.Series) -> dict[str, float]:
    return {
        "week": round(return_over_window(series, 5), 2),
        "month": round(return_over_window(series, 21), 2),
        "quarter": round(return_over_window(series, 63), 2),
    }


def technical_signal(
    rsi14: float | None,
    macd: float | None,
    macd_signal: float | None,
    sma20: float | None,
    sma50: float | None,
) -> str:
    if rsi14 is not None and rsi14 > 70 and macd is not None and macd_signal is not None and macd < macd_signal:
        return "bearish"
    if rsi14 is not None and rsi14 < 35 and macd is not None and macd_signal is not None and macd > macd_signal:
        return "bullish"
    if sma20 is not None and sma50 is not None and sma20 > sma50:
        return "bullish"
    return "neutral"


def build_sparkline_points(series: pd.Series, samples: int = 24) -> list[float]:
    if series.empty:
        return []
    sample = series.tail(samples)
    min_value = float(sample.min())
    max_value = float(sample.max())
    range_value = max(max_value - min_value, 1.0)
    return [round(((float(value) - min_value) / range_value) * 100.0, 2) for value in sample.tolist()]


def relative_position_from_range(price: float, low: float | None, high: float | None) -> float | None:
    if low is None or high is None or high <= low:
        return None
    return clamp((price - low) / (high - low), 0.0, 1.0)


def safe_ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def build_technicals(history: pd.DataFrame) -> dict[str, Any]:
    closes = extract_closes(history)
    volumes = history["Volume"].dropna().astype(float) if not history.empty and "Volume" in history.columns else pd.Series(dtype="float64")
    high_series = history["High"].dropna().astype(float) if not history.empty and "High" in history.columns else pd.Series(dtype="float64")
    low_series = history["Low"].dropna().astype(float) if not history.empty and "Low" in history.columns else pd.Series(dtype="float64")

    sma20 = rolling_mean(closes, 20)
    sma50 = rolling_mean(closes, 50)
    sma200 = rolling_mean(closes, 200)
    ema20 = rolling_ema(closes, 20)
    rsi14 = compute_rsi(closes, 14)
    macd, macd_signal, macd_hist = compute_macd(closes)
    stochastic_k, stochastic_d = compute_stochastic(closes, high_series, low_series)
    volatility = daily_volatility(closes)
    avg_volume = rolling_mean(volumes, 20)
    current_volume = float(volumes.iloc[-1]) if len(volumes) else None
    volume_ratio = safe_ratio(current_volume, avg_volume)
    support = float(low_series.tail(20).min()) if len(low_series) else None
    resistance = float(high_series.tail(20).max()) if len(high_series) else None
    advanced = build_advanced_technicals(
        closes,
        high_series,
        low_series,
        price=float(closes.iloc[-1]) if len(closes) else None,
        sma20=sma20,
        sma50=sma50,
        sma200=sma200,
        rsi14=rsi14,
        macd_hist=macd_hist,
        volume_ratio=volume_ratio,
    )

    return {
        "rsi14": round(rsi14, 2) if rsi14 is not None else None,
        "macd": round(macd, 4) if macd is not None else None,
        "macdSignal": round(macd_signal, 4) if macd_signal is not None else None,
        "macdHistogram": round(macd_hist, 4) if macd_hist is not None else None,
        "stochasticK": round(stochastic_k, 2) if stochastic_k is not None else None,
        "stochasticD": round(stochastic_d, 2) if stochastic_d is not None else None,
        "sma20": round(sma20, 2) if sma20 is not None else None,
        "sma50": round(sma50, 2) if sma50 is not None else None,
        "sma200": round(sma200, 2) if sma200 is not None else None,
        "ema20": round(ema20, 2) if ema20 is not None else None,
        "volatility": round(volatility, 2),
        "avgVolume": round(avg_volume, 0) if avg_volume is not None else None,
        "currentVolume": round(current_volume, 0) if current_volume is not None else None,
        "volumeRatio": round(volume_ratio, 2) if volume_ratio is not None else None,
        "support": round(support, 2) if support is not None else None,
        "resistance": round(resistance, 2) if resistance is not None else None,
        "trend": trend_summary(closes),
        "signal": technical_signal(rsi14, macd, macd_signal, sma20, sma50),
        **advanced,
    }


def build_advanced_technicals(
    closes: pd.Series,
    highs: pd.Series,
    lows: pd.Series,
    *,
    price: float | None,
    sma20: float | None,
    sma50: float | None,
    sma200: float | None,
    rsi14: float | None,
    macd_hist: float | None,
    volume_ratio: float | None,
) -> dict[str, Any]:
    def window_return(window: int) -> float | None:
        return round(return_over_window(closes, window), 2) if len(closes) > window else None

    returns = {
        "1d": window_return(1),
        "1w": window_return(5),
        "1m": window_return(21),
        "3m": window_return(63),
        "1y": window_return(252),
    }
    directional = [value for value in (returns["1w"], returns["1m"], returns["3m"]) if value is not None]
    positive = sum(value > 0 for value in directional)
    negative = sum(value < 0 for value in directional)
    timeframe_alignment = "BULLISH" if directional and positive == len(directional) else "BEARISH" if directional and negative == len(directional) else "MIXED"

    recent_high = float(highs.tail(20).max()) if len(highs) >= 20 else None
    prior_high = float(highs.iloc[-40:-20].max()) if len(highs) >= 40 else None
    recent_low = float(lows.tail(20).min()) if len(lows) >= 20 else None
    prior_low = float(lows.iloc[-40:-20].min()) if len(lows) >= 40 else None
    higher_high = recent_high is not None and prior_high is not None and recent_high > prior_high
    higher_low = recent_low is not None and prior_low is not None and recent_low > prior_low
    lower_high = recent_high is not None and prior_high is not None and recent_high < prior_high
    lower_low = recent_low is not None and prior_low is not None and recent_low < prior_low
    dow_trend = (
        "PRIMARY_UPTREND" if price and sma50 and sma200 and price > sma50 > sma200 and higher_high and higher_low
        else "PRIMARY_DOWNTREND" if price and sma50 and sma200 and price < sma50 < sma200 and lower_high and lower_low
        else "UPTREND_UNCONFIRMED" if price and sma50 and sma200 and price > sma50 > sma200
        else "DOWNTREND_UNCONFIRMED" if price and sma50 and sma200 and price < sma50 < sma200
        else "RANGE_OR_TRANSITION"
    )

    range_high = float(highs.tail(60).max()) if len(highs) >= 20 else recent_high
    range_low = float(lows.tail(60).min()) if len(lows) >= 20 else recent_low
    range_position = ((price - range_low) / (range_high - range_low)) if price is not None and range_low is not None and range_high is not None and range_high > range_low else None
    wyckoff_phase = "UNCONFIRMED"
    if price and sma50 and sma200 and range_position is not None:
        if price > sma50 > sma200 and range_position >= 0.65:
            wyckoff_phase = "MARKUP"
        elif price < sma50 < sma200 and range_position <= 0.35:
            wyckoff_phase = "MARKDOWN"
        elif range_position <= 0.4 and (volume_ratio or 0) >= 1.0:
            wyckoff_phase = "POSSIBLE_ACCUMULATION"
        elif range_position >= 0.6 and (volume_ratio or 0) >= 1.0:
            wyckoff_phase = "POSSIBLE_DISTRIBUTION"
        else:
            wyckoff_phase = "RANGE"

    wave_bias = "NO_RELIABLE_COUNT"
    if price and sma20 and sma50 and macd_hist is not None:
        if price > sma20 > sma50 and macd_hist > 0 and (rsi14 or 50) >= 50:
            wave_bias = "IMPULSE_UP_CANDIDATE"
        elif price < sma20 < sma50 and macd_hist < 0 and (rsi14 or 50) <= 50:
            wave_bias = "IMPULSE_DOWN_CANDIDATE"
        elif price > sma50 and macd_hist < 0:
            wave_bias = "CORRECTIVE_PULLBACK_CANDIDATE"
        elif price < sma50 and macd_hist > 0:
            wave_bias = "RELIEF_BOUNCE_CANDIDATE"

    fibonacci = _fibonacci_map(closes, highs, lows)
    return {
        "multiTimeframe": {"returns": returns, "alignment": timeframe_alignment, "note": "Derived from daily closes; higher-timeframe confirmation is approximate."},
        "dowTheory": {
            "trend": dow_trend,
            "higherHigh": higher_high,
            "higherLow": higher_low,
            "lowerHigh": lower_high,
            "lowerLow": lower_low,
            "confirmation": timeframe_alignment,
        },
        "wyckoff": {
            "phase": wyckoff_phase,
            "rangePositionPct": round(range_position * 100, 1) if range_position is not None else None,
            "volumeRatio": round(volume_ratio, 2) if volume_ratio is not None else None,
            "note": "Heuristic phase proxy; volume/price structure does not prove operator intent.",
        },
        "elliottWave": {
            "bias": wave_bias,
            "confidence": "LOW" if wave_bias == "NO_RELIABLE_COUNT" else "MEDIUM",
            "note": "Heuristic context only; no exact wave count is claimed without validated pivots and multiple timeframes.",
        },
        "fibonacci": fibonacci,
    }


def _fibonacci_map(closes: pd.Series, highs: pd.Series, lows: pd.Series) -> dict[str, Any]:
    if len(closes) < 20 or len(highs) < 20 or len(lows) < 20:
        return {"direction": "UNAVAILABLE", "swingLow": None, "swingHigh": None, "retracements": {}, "extensions": {}, "note": "Insufficient history."}
    window_highs = highs.tail(60)
    window_lows = lows.tail(60)
    swing_high = float(window_highs.max())
    swing_low = float(window_lows.min())
    span = swing_high - swing_low
    if span <= 0:
        return {"direction": "UNAVAILABLE", "swingLow": swing_low, "swingHigh": swing_high, "retracements": {}, "extensions": {}, "note": "No usable swing range."}
    upswing = window_lows.idxmin() < window_highs.idxmax()
    if upswing:
        retracements = {"38.2": swing_high - span * 0.382, "50.0": swing_high - span * 0.5, "61.8": swing_high - span * 0.618}
        extensions = {"127.2": swing_high + span * 0.272, "161.8": swing_high + span * 0.618}
        direction = "UPSWING"
    else:
        retracements = {"38.2": swing_low + span * 0.382, "50.0": swing_low + span * 0.5, "61.8": swing_low + span * 0.618}
        extensions = {"127.2": swing_low - span * 0.272, "161.8": swing_low - span * 0.618}
        direction = "DOWNSWING"
    return {
        "direction": direction,
        "swingLow": round(swing_low, 2),
        "swingHigh": round(swing_high, 2),
        "retracements": {key: round(value, 2) for key, value in retracements.items()},
        "extensions": {key: round(value, 2) for key, value in extensions.items()},
        "note": "Mechanical 60-session swing map; levels are conditional zones, not forecasts.",
    }
