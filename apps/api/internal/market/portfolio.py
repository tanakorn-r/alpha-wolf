from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.store.portfolio import list_dca_orders, list_holdings, list_transactions
from internal.store.utils import as_float, coerce_iso_date
from internal.yahoo.client import fetch_dividends, fetch_history, load_ticker_modules, quote_snapshot_meta, ticker as make_ticker
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
    transactions = list_transactions(user_id)
    realized_gain_loss = sum(float(item.realizedPnl or 0) for item in transactions if item.kind == "SELL")
    gross_invested = sum(float(item.amount or 0) for item in transactions if item.kind == "BUY")
    ledger_cash, net_contributions = _cash_ledger(transactions)
    transactions_by_symbol: dict[str, list[Any]] = {}
    for transaction in transactions:
        transactions_by_symbol.setdefault(transaction.symbol, []).append(transaction)
    active_symbols = {holding.symbol for holding in holdings}
    closed_dividends_ytd = _closed_position_dividends(transactions_by_symbol, active_symbols)
    if not holdings:
        cash_balance = ledger_cash + closed_dividends_ytd
        total_return = cash_balance - net_contributions
        return PortfolioDashboard(
            summary=PortfolioSummary(
                totalValue=round(cash_balance, 2),
                gainLoss=round(total_return, 2),
                gainLossPct=round((total_return / net_contributions) * 100, 2) if net_contributions else 0,
                dividendsYtd=round(closed_dividends_ytd, 2),
                realizedGainLoss=round(realized_gain_loss, 2),
                totalReturn=round(total_return, 2),
                grossInvested=round(gross_invested, 2),
                netContributions=round(net_contributions, 2),
                cashBalance=round(cash_balance, 2),
            ),
            dcaOrders=orders,
            markers=[PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
            transactions=transactions,
        )

    # Each holding's market data is an independent set of cache/yfinance round trips — a
    # sequential loop pays for every holding back-to-back, which compounds badly on any cache
    # miss. ThreadPoolExecutor.map runs them concurrently while preserving input order, so the
    # zip() below still lines up holdings with their data correctly.
    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        live = list(pool.map(_load_holding_market_data, holdings))

    rows: list[dict[str, object]] = []
    invested = 0.0
    securities_value = 0.0
    dividends_ytd = closed_dividends_ytd
    annual_income = 0.0
    histories: list[tuple[list[Any], pd.Series]] = []
    income_events: list[IncomeEvent] = []
    buy_markers: list[PortfolioMarker] = []

    for holding, data in zip(holdings, live, strict=True):
        record, history, info, paid_dividends = data
        symbol_transactions = transactions_by_symbol.get(holding.symbol, [])
        currency = record.get("currency")
        # A brand-new holding may render before its first quote snapshot arrives. Cost basis is the
        # honest non-live placeholder; zero would fabricate a -100% loss until the quote overlay.
        price_base = _to_base(float(record["price"]), currency) if record.get("price") else holding.averageCost
        value = holding.shares * price_base
        cost = holding.shares * holding.averageCost
        invested += cost
        securities_value += value
        dividends_ytd += _to_base(_dividends_for_transactions(paid_dividends, symbol_transactions), currency)
        annual_income += holding.shares * _to_base(as_float(info.get("dividendRate")) or 0.0, currency)
        purchase_date = _first_buy_date(symbol_transactions) or _iso_date(holding.createdAt)
        closes = _to_base_series(
            _close_series(history, since=purchase_date, current_price=float(record["price"]) if record.get("price") else None),
            currency,
        )
        if not closes.empty:
            histories.append((symbol_transactions, closes))
        rows.append({**holding.model_dump(), **record, "value": round(value, 2), "cost": round(cost, 2), "gainLoss": round(value - cost, 2), "gainLossPct": round(((value - cost) / cost) * 100, 2) if cost else 0})
        income_events.extend(_income_events(holding.symbol, holding.shares, info))
        for transaction in symbol_transactions:
            if transaction.kind == "BUY":
                buy_markers.append(PortfolioMarker(date=transaction.occurredAt[:10], symbol=holding.symbol, amount=round(transaction.amount, 2)))

    cash_balance = ledger_cash + dividends_ytd
    total_value = securities_value + cash_balance
    unrealized_gain_loss = securities_value - invested
    total_return = unrealized_gain_loss + realized_gain_loss + dividends_ytd
    return PortfolioDashboard(
        summary=PortfolioSummary(
            totalValue=round(total_value, 2),
            invested=round(invested, 2),
            gainLoss=round(total_return, 2),
            gainLossPct=round((total_return / net_contributions) * 100, 2) if net_contributions else 0,
            dividendsYtd=round(dividends_ytd, 2),
            forwardYield=round((annual_income / securities_value) * 100, 2) if securities_value else 0,
            unrealizedGainLoss=round(unrealized_gain_loss, 2),
            realizedGainLoss=round(realized_gain_loss, 2),
            totalReturn=round(total_return, 2),
            grossInvested=round(gross_invested, 2),
            netContributions=round(net_contributions, 2),
            cashBalance=round(cash_balance, 2),
        ),
        holdings=rows,
        dcaOrders=orders,
        chart=_portfolio_chart(histories),
        markers=buy_markers + [PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
        incomeEvents=sorted(income_events, key=lambda item: item.date),
        transactions=transactions,
    )


def build_portfolio_quotes(user_id: int = 0) -> dict[str, Any]:
    """Latest quote overlay only; the browser merges this into the saved dashboard."""
    holdings = list_holdings(user_id)
    if not holdings:
        return {"quotes": [], "pending": False, "updatedAt": None}

    def load(holding) -> dict[str, Any]:
        modules = load_ticker_modules(make_ticker(holding.symbol), holding.symbol)
        info = merge_ticker_info(modules, holding.symbol)
        price = as_float(info.get("currentPrice")) or as_float(info.get("regularMarketPrice"))
        previous = as_float(info.get("regularMarketPreviousClose"))
        change_pct = ((price - previous) / previous * 100.0) if price and previous else 0.0
        meta = quote_snapshot_meta(holding.symbol)
        return {
            "symbol": holding.symbol,
            "price": price,
            "currency": info.get("currency") or ("THB" if holding.symbol.endswith(".BK") else "USD"),
            "changePct": round(change_pct, 2),
            "fresh": meta["fresh"],
            "fetchedAt": meta["fetchedAt"],
        }

    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        quotes = list(pool.map(load, holdings))
    fresh_dates = [str(item["fetchedAt"]) for item in quotes if item.get("fresh") and item.get("fetchedAt")]
    return {
        "quotes": quotes,
        "pending": any(not item.get("fresh") for item in quotes),
        "updatedAt": max(fresh_dates) if fresh_dates else None,
    }


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
    return record, history, info, dividends


def _first_buy_date(transactions: list[Any]) -> str | None:
    dates = [item.occurredAt[:10] for item in transactions if item.kind == "BUY"]
    return min(dates) if dates else None


def _dividends_for_transactions(dividends: pd.Series | None, transactions: list[Any]) -> float:
    if dividends is None or dividends.empty:
        return 0.0
    total = 0.0
    ordered = sorted(transactions, key=lambda item: (item.occurredAt, item.id))
    for timestamp, dividend_per_share in dividends.items():
        event_date = pd.Timestamp(timestamp).date()
        shares = 0.0
        for transaction in ordered:
            transaction_date = datetime.fromisoformat(transaction.occurredAt.replace("Z", "+00:00")).date()
            if transaction_date > event_date:
                break
            if transaction.kind == "BUY":
                shares += transaction.shares
            elif transaction.kind == "SELL":
                shares -= transaction.shares
        total += max(0.0, shares) * float(dividend_per_share)
    return total


def _closed_position_dividends(transactions_by_symbol: dict[str, list[Any]], active_symbols: set[str]) -> float:
    closed_symbols = [symbol for symbol in transactions_by_symbol if symbol not in active_symbols]
    if not closed_symbols:
        return 0.0

    def load(symbol: str) -> tuple[str, pd.Series]:
        return symbol, fetch_dividends(make_ticker(symbol), period="ytd")

    total = 0.0
    with ThreadPoolExecutor(max_workers=min(6, len(closed_symbols))) as pool:
        for symbol, dividends in pool.map(load, closed_symbols):
            native_total = _dividends_for_transactions(dividends, transactions_by_symbol[symbol])
            total += _to_base(native_total, "THB" if symbol.endswith(".BK") else "USD")
    return total


def _cash_ledger(transactions: list[Any]) -> tuple[float, float]:
    cash = 0.0
    contributions = 0.0
    for transaction in sorted(transactions, key=lambda item: (item.occurredAt, item.id)):
        amount = float(transaction.amount or 0)
        if transaction.kind == "BUY":
            used_cash = min(cash, amount)
            cash -= used_cash
            contributions += amount - used_cash
        elif transaction.kind in {"SELL", "DIVIDEND"}:
            cash += amount
        elif transaction.kind == "FEE":
            cash -= amount
    return cash, contributions


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


def _portfolio_chart(histories: list[tuple[list[Any], pd.Series]]) -> list[PortfolioPoint]:
    if not histories:
        return []
    all_index = pd.concat([series.rename(str(index)) for index, (_transactions, series) in enumerate(histories)], axis=1).sort_index().index
    if all_index.empty:
        return []
    value_series = pd.Series(0.0, index=all_index)
    cost_series = pd.Series(0.0, index=all_index)
    for transactions, closes in histories:
        aligned_closes = closes.reindex(all_index).ffill()
        shares_path = pd.Series(0.0, index=all_index)
        position_cost_path = pd.Series(0.0, index=all_index)
        for transaction in transactions:
            if transaction.kind not in {"BUY", "SELL"}:
                continue
            event_date = datetime.fromisoformat(transaction.occurredAt.replace("Z", "+00:00")).date()
            mask = [timestamp.date() >= event_date for timestamp in all_index]
            if transaction.kind == "BUY":
                shares_path[mask] += transaction.shares
                position_cost_path[mask] += float(transaction.costBasis or transaction.amount or 0)
            else:
                shares_path[mask] -= transaction.shares
                position_cost_path[mask] -= float(transaction.costBasis or 0)
        value_series += (aligned_closes * shares_path).fillna(0.0)
        cost_series += position_cost_path.clip(lower=0.0)

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
