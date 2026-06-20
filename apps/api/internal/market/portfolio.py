from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.portfolio import list_dca_orders, list_holdings
from internal.store.utils import as_float
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
    histories: list[tuple[float, pd.Series]] = []
    income_events: list[IncomeEvent] = []

    for holding, data in zip(holdings, live, strict=True):
        record, history, info, paid_dividends = data
        value = holding.shares * float(record["price"])
        cost = holding.shares * holding.averageCost
        invested += cost
        total_value += value
        dividends_ytd += holding.shares * paid_dividends
        annual_income += holding.shares * (as_float(info.get("dividendRate")) or 0.0)
        closes = _close_series(history)
        if not closes.empty:
            histories.append((holding.shares, closes))
        rows.append({**holding.model_dump(), **record, "value": round(value, 2), "cost": round(cost, 2), "gainLoss": round(value - cost, 2), "gainLossPct": round(((value - cost) / cost) * 100, 2) if cost else 0})
        income_events.extend(_income_events(holding.symbol, holding.shares, info))

    gain_loss = total_value - invested
    return PortfolioDashboard(
        summary=PortfolioSummary(totalValue=round(total_value, 2), invested=round(invested, 2), gainLoss=round(gain_loss, 2), gainLossPct=round((gain_loss / invested) * 100, 2) if invested else 0, dividendsYtd=round(dividends_ytd, 2), forwardYield=round((annual_income / total_value) * 100, 2) if total_value else 0),
        holdings=rows,
        dcaOrders=orders,
        chart=_portfolio_chart(histories, invested),
        markers=[PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
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


def _close_series(history: pd.DataFrame) -> pd.Series:
    if history.empty or "Close" not in history.columns:
        return pd.Series(dtype="float64")
    return history["Close"].dropna().astype(float)


def _portfolio_chart(histories: list[tuple[float, pd.Series]], invested: float) -> list[PortfolioPoint]:
    if not histories:
        return []
    frame = pd.concat([series.rename(str(index)) * shares for index, (shares, series) in enumerate(histories)], axis=1).ffill().dropna()
    if frame.empty:
        return []
    sampled = frame.sum(axis=1).iloc[:: max(1, len(frame) // 80)]
    return [PortfolioPoint(date=index.date().isoformat(), value=round(float(value), 2), cost=round(invested, 2)) for index, value in sampled.items()]


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
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).date().isoformat()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            return None
    return None
