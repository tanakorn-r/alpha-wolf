from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.portfolio import list_dca_orders, list_holdings
from internal.store.utils import as_float, coerce_iso_date
from internal.yahoo.client import fetch_dividends, fetch_history, load_ticker_modules, ticker as make_ticker
from models import IncomeEvent, PortfolioDashboard, PortfolioMarker, PortfolioPoint, PortfolioSummary


def build_portfolio_dashboard() -> PortfolioDashboard:
    holdings = list_holdings()
    orders = list_dca_orders()
    if not holdings:
        return PortfolioDashboard(dcaOrders=orders, markers=[PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders])

    with ThreadPoolExecutor(max_workers=min(4, len(holdings))) as pool:
        live = list(pool.map(_load_holding_market_data, holdings))

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
        value = holding.shares * float(record["price"])
        cost = holding.shares * holding.averageCost
        invested += cost
        total_value += value
        dividends_ytd += holding.shares * paid_dividends
        annual_income += holding.shares * (as_float(info.get("dividendRate")) or 0.0)
        purchase_date = _iso_date(holding.createdAt)
        closes = _close_series(history, since=purchase_date, current_price=float(record["price"]) if record.get("price") else None)
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
    dividends = fetch_dividends(ticker, period="ytd")
    return record, history, info, float(dividends.sum()) if not dividends.empty else 0.0


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
