from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.portfolio import list_dca_orders, list_holdings
from internal.store.utils import as_float, coerce_iso_date
from internal.yahoo.client import fetch_dividends, fetch_history, load_ticker_modules, ticker as make_ticker
from models import IncomeEvent, PortfolioDashboard, PortfolioMarker, PortfolioPoint, PortfolioSummary


# The app keeps all portfolio money in USD base; the web client stores holding cost basis
# already converted (THB price / 36.5). Live prices/dividends come back in the stock's native
# currency, so they must be converted the same way or a THB holding reads ~36.5x its real value.
_FX_TO_USD = {"THB": 36.5}


def _to_base(value: float, currency: str | None) -> float:
    rate = _FX_TO_USD.get((currency or "").upper())
    return value / rate if rate else value


def _to_base_series(series: pd.Series, currency: str | None) -> pd.Series:
    rate = _FX_TO_USD.get((currency or "").upper())
    return series / rate if rate else series


def build_portfolio_dashboard(user_id: int = 0) -> PortfolioDashboard:
    holdings = list_holdings(user_id)
    orders = list_dca_orders(user_id)
    if not holdings:
        return PortfolioDashboard(dcaOrders=orders, markers=[PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders])

    live = [_load_holding_market_data(holding) for holding in holdings]

    rows: list[dict[str, object]] = []
    invested = 0.0
    total_value = 0.0
    dividends_ytd = 0.0
    annual_income = 0.0
    histories: list[tuple[float, float, pd.Series]] = []
    income_events: list[IncomeEvent] = []
    buy_markers: list[PortfolioMarker] = []

    for holding, data in zip(holdings, live, strict=True):
        record, history, info, paid_dividends = data
        currency = record.get("currency")
        price_base = _to_base(float(record["price"]), currency) if record.get("price") else 0.0
        value = holding.shares * price_base
        cost = holding.shares * holding.averageCost
        invested += cost
        total_value += value
        dividends_ytd += holding.shares * _to_base(paid_dividends, currency)
        annual_income += holding.shares * _to_base(as_float(info.get("dividendRate")) or 0.0, currency)
        purchase_date = _iso_date(holding.createdAt)
        closes = _to_base_series(
            _close_series(history, since=purchase_date, current_price=float(record["price"]) if record.get("price") else None),
            currency,
        )
        if not closes.empty:
            histories.append((holding.shares, cost, closes))
        rows.append({**holding.model_dump(), **record, "value": round(value, 2), "cost": round(cost, 2), "gainLoss": round(value - cost, 2), "gainLossPct": round(((value - cost) / cost) * 100, 2) if cost else 0})
        income_events.extend(_income_events(holding.symbol, holding.shares, info))
        if purchase_date:
            buy_markers.append(PortfolioMarker(date=purchase_date, symbol=holding.symbol, amount=round(cost, 2)))

    gain_loss = total_value - invested
    return PortfolioDashboard(
        summary=PortfolioSummary(totalValue=round(total_value, 2), invested=round(invested, 2), gainLoss=round(gain_loss, 2), gainLossPct=round((gain_loss / invested) * 100, 2) if invested else 0, dividendsYtd=round(dividends_ytd, 2), forwardYield=round((annual_income / total_value) * 100, 2) if total_value else 0),
        holdings=rows,
        dcaOrders=orders,
        chart=_portfolio_chart(histories),
        markers=buy_markers + [PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
        incomeEvents=sorted(income_events, key=lambda item: item.date),
    )


def _load_holding_market_data(holding):
    ticker = make_ticker(holding.symbol)
    modules = load_ticker_modules(ticker, holding.symbol)
    info = merge_ticker_info(modules, holding.symbol)
    history = fetch_history(ticker, period="1y")
    entry = build_entry_from_info(holding.symbol, info)
    record = fetch_record_from_ticker(entry, ticker=ticker, info=info, history=history)
    # Only count dividends whose ex-date fell on/after purchase — a position bought today has
    # not earned any dividend yet; it accrues once an ex-date passes while the stock is held.
    dividends = fetch_dividends(ticker, period="ytd")
    accrued = _dividends_since(dividends, _iso_date(holding.createdAt))
    return record, history, info, accrued


def _dividends_since(dividends: pd.Series | None, since_iso: str | None) -> float:
    if dividends is None or dividends.empty:
        return 0.0
    if not since_iso:
        return float(dividends.sum())
    since = date.fromisoformat(since_iso)
    kept = dividends[pd.to_datetime(dividends.index).date >= since]
    return float(kept.sum()) if not kept.empty else 0.0


def _close_series(history: pd.DataFrame, since: str | None = None, current_price: float | None = None) -> pd.Series:
    """Daily close prices for a holding, clipped to its own purchase date - a position bought
    today must not plot a year of price history it was never actually exposed to. If the
    purchase date has no trading bar yet (bought same-day, before the feed's latest close),
    fall back to a single live point so a brand-new position still shows a starting dot."""
    if history.empty or "Close" not in history.columns:
        return pd.Series(dtype="float64")
    closes = history["Close"].dropna().astype(float)
    if since:
        cutoff = datetime.fromisoformat(since).date()
        filtered = closes[[ts.date() >= cutoff for ts in closes.index]]
        if filtered.empty and current_price:
            last_index = closes.index[-1]
            anchor = pd.Timestamp(cutoff, tz=last_index.tz) if last_index.tz is not None else pd.Timestamp(cutoff)
            filtered = pd.Series([float(current_price)], index=[anchor])
        closes = filtered
    return closes


def _portfolio_chart(histories: list[tuple[float, float, pd.Series]]) -> list[PortfolioPoint]:
    if not histories:
        return []
    value_frame = pd.concat([series.rename(str(index)) * shares for index, (shares, _cost, series) in enumerate(histories)], axis=1).sort_index().ffill().fillna(0.0)
    if value_frame.empty:
        return []
    value_series = value_frame.sum(axis=1)

    cost_series = pd.Series(0.0, index=value_series.index)
    for _shares, cost, series in histories:
        if series.empty:
            continue
        start_date = series.index.min().date()
        cost_series[[ts.date() >= start_date for ts in cost_series.index]] += cost

    sampled_index = value_series.index[:: max(1, len(value_series) // 80)]
    return [PortfolioPoint(date=index.date().isoformat(), value=round(float(value_series.loc[index]), 2), cost=round(float(cost_series.loc[index]), 2)) for index in sampled_index]


def _income_events(symbol: str, shares: float, info: dict[str, Any]) -> list[IncomeEvent]:
    events: list[IncomeEvent] = []
    dividend_rate = as_float(info.get("dividendRate"))
    for key, kind in (("exDividendDate", "ex-dividend"), ("dividendDate", "payment")):
        event_date = _iso_date(info.get(key))
        if event_date:
            amount = shares * dividend_rate / 4 if kind == "payment" and dividend_rate else None
            events.append(IncomeEvent(date=event_date, symbol=symbol, kind=kind, amount=round(amount, 2) if amount else None))
    return events


def _iso_date(value: Any) -> str | None:
    return coerce_iso_date(value)
