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
    volatility = daily_volatility(closes)
    avg_volume = rolling_mean(volumes, 20)
    current_volume = float(volumes.iloc[-1]) if len(volumes) else None
    volume_ratio = safe_ratio(current_volume, avg_volume)
    support = float(low_series.tail(20).min()) if len(low_series) else None
    resistance = float(high_series.tail(20).max()) if len(high_series) else None

    return {
        "rsi14": round(rsi14, 2) if rsi14 is not None else None,
        "macd": round(macd, 4) if macd is not None else None,
        "macdSignal": round(macd_signal, 4) if macd_signal is not None else None,
        "macdHistogram": round(macd_hist, 4) if macd_hist is not None else None,
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
    }
