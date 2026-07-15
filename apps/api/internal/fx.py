from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import pandas as pd
import yfinance as yf

from internal.store.yahoo_cache import load_yahoo_data, save_yahoo_data

FX_TTL_SECONDS = 86_400
_FX_REFRESH_LOCK = threading.Lock()
_FALLBACK_USD_QUOTES = {
    "USD": 1.0,
    "THB": float(os.getenv("FALLBACK_USD_THB", "36.5")),
    "EUR": float(os.getenv("FALLBACK_USD_EUR", "0.86")),
    "GBP": float(os.getenv("FALLBACK_USD_GBP", "0.74")),
    "JPY": float(os.getenv("FALLBACK_USD_JPY", "159")),
    "HKD": float(os.getenv("FALLBACK_USD_HKD", "7.85")),
    "CNY": float(os.getenv("FALLBACK_USD_CNY", "7.18")),
}


@dataclass(frozen=True)
class FxRate:
    base: str
    quote: str
    rate: float
    fetched_at: datetime
    expires_at: datetime
    source: str
    stale: bool = False


def normalize_currency(currency: str | None, symbol: str | None = None) -> str:
    token = str(currency or "").strip().upper()
    if token:
        return token
    return "THB" if str(symbol or "").upper().endswith(".BK") else "USD"


def usd_quote_rate(currency: str | None, *, symbol: str | None = None, on_date: date | None = None) -> FxRate:
    quote = normalize_currency(currency, symbol)
    now = datetime.now(timezone.utc)
    if quote == "USD":
        return FxRate("USD", "USD", 1.0, now, now + timedelta(seconds=FX_TTL_SECONDS), "identity")

    yahoo_symbol = _yahoo_symbol("USD", quote)
    period_key = on_date.isoformat() if on_date else "spot"
    cached = load_yahoo_data(yahoo_symbol, "fx", period_key)
    cached_rate = _cached_rate(cached)
    if cached and cached.is_fresh and cached_rate:
        return FxRate("USD", quote, cached_rate, cached.fetched_at, cached.expires_at, "yfinance")

    with _FX_REFRESH_LOCK:
        # A previous waiter may have refreshed the database while this caller was blocked.
        refreshed = load_yahoo_data(yahoo_symbol, "fx", period_key)
        refreshed_rate = _cached_rate(refreshed)
        if refreshed and refreshed.is_fresh and refreshed_rate:
            return FxRate("USD", quote, refreshed_rate, refreshed.fetched_at, refreshed.expires_at, "yfinance")
        try:
            live_rate = _fetch_rate(yahoo_symbol, on_date)
            save_yahoo_data(
                yahoo_symbol,
                "fx",
                {"base": "USD", "quote": quote, "rate": live_rate, "source": "yfinance"},
                period=period_key,
                ttl_seconds=FX_TTL_SECONDS,
            )
            saved = load_yahoo_data(yahoo_symbol, "fx", period_key)
            if saved:
                return FxRate("USD", quote, live_rate, saved.fetched_at, saved.expires_at, "yfinance")
            return FxRate("USD", quote, live_rate, now, now + timedelta(seconds=FX_TTL_SECONDS), "yfinance")
        except Exception:
            if cached and cached_rate:
                return FxRate("USD", quote, cached_rate, cached.fetched_at, cached.expires_at, "yfinance-cache", stale=True)

    fallback = _FALLBACK_USD_QUOTES.get(quote)
    if fallback and fallback > 0:
        return FxRate("USD", quote, fallback, now, now, "fallback", stale=True)
    raise ValueError(f"No USD/{quote} exchange rate is available")


def to_usd(value: float, currency: str | None, *, symbol: str | None = None, on_date: date | None = None) -> tuple[float, FxRate]:
    fx = usd_quote_rate(currency, symbol=symbol, on_date=on_date)
    return value / fx.rate, fx


def fx_payload(currencies: list[str] | tuple[str, ...] | set[str] | None = None) -> dict[str, object]:
    requested = {"THB", *(str(value).upper() for value in (currencies or []))}
    requested.discard("USD")
    quotes = [usd_quote_rate(currency) for currency in sorted(requested)]
    freshest = max(quotes, key=lambda item: item.fetched_at)
    return {
        "base": "USD",
        "rates": {"USD": 1.0, **{quote.quote: quote.rate for quote in quotes}},
        "fetchedAt": freshest.fetched_at.isoformat(),
        "expiresAt": min(quote.expires_at for quote in quotes).isoformat(),
        "source": ", ".join(sorted({quote.source for quote in quotes})),
        "stale": any(quote.stale for quote in quotes),
    }


def _yahoo_symbol(base: str, quote: str) -> str:
    # Yahoo's shorthand for USD quote pairs is e.g. THB=X (USD/THB).
    return f"{quote}=X" if base == "USD" else f"{base}{quote}=X"


def _fetch_rate(symbol: str, on_date: date | None) -> float:
    ticker = yf.Ticker(symbol)
    if on_date:
        start = on_date - timedelta(days=7)
        end = on_date + timedelta(days=1)
        frame = ticker.history(start=start.isoformat(), end=end.isoformat(), interval="1d", auto_adjust=False)
        if not frame.empty:
            eligible = frame[pd.to_datetime(frame.index).date <= on_date]
            frame = eligible if not eligible.empty else frame
    else:
        frame = ticker.history(period="5d", interval="1d", auto_adjust=False)
    if frame is None or frame.empty or "Close" not in frame:
        raise ValueError(f"Yahoo returned no FX data for {symbol}")
    closes = pd.to_numeric(frame["Close"], errors="coerce").dropna()
    if closes.empty or float(closes.iloc[-1]) <= 0:
        raise ValueError(f"Yahoo returned an invalid FX rate for {symbol}")
    return float(closes.iloc[-1])


def _cached_rate(entry) -> float | None:
    if not entry or not isinstance(entry.payload, dict):
        return None
    try:
        rate = float(entry.payload.get("rate") or 0)
    except (TypeError, ValueError):
        return None
    return rate if rate > 0 else None
