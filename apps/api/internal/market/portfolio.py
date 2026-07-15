from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from internal.market.records import build_entry_from_info, fetch_record_from_ticker, merge_ticker_info
from internal.market.data_trust import aggregate_data_trust, build_yahoo_data_trust
from internal.fx import fx_payload
from internal.store.portfolio import list_dca_orders, list_holdings, list_transactions
from internal.store.settings import load_user_settings
from internal.store.utils import as_float, coerce_iso_date
from internal.store.yahoo_cache import YahooCacheEntry, load_yahoo_data_batch
from internal.yahoo.client import fetch_dividends, fetch_history, load_ticker_modules, quote_snapshot_meta, ticker as make_ticker
from models import IncomeEvent, PortfolioDashboard, PortfolioMarker, PortfolioPoint, PortfolioSummary


def _to_base(value: float, currency: str | None, rates: dict[str, float]) -> float:
    rate = rates.get((currency or "USD").upper())
    return value / rate if rate else value


def _to_base_series(series: pd.Series, currency: str | None, rates: dict[str, float]) -> pd.Series:
    rate = rates.get((currency or "USD").upper())
    return series / rate if rate else series


def build_portfolio_dashboard(user_id: int = 0, *, refresh_stale: bool = True) -> PortfolioDashboard:
    settings = load_user_settings(user_id) if user_id else None
    reporting_currency = str((settings or {}).get("baseCurrency") or "THB")
    fx = fx_payload([reporting_currency])
    rates = dict(fx["rates"])
    thb_per_usd = float(rates["THB"])
    holdings = list_holdings(user_id)
    orders = list_dca_orders(user_id)
    transactions = list_transactions(user_id)
    transactions_by_symbol: dict[str, list[Any]] = {}
    for transaction in transactions:
        transactions_by_symbol.setdefault(transaction.symbol, []).append(transaction)
    cash_by_currency, contributions_by_currency, gross_by_currency = _native_cash_ledger(transactions)
    ledger_cash_thb = _buckets_to_thb(cash_by_currency, thb_per_usd)
    net_contributions_thb = _buckets_to_thb(contributions_by_currency, thb_per_usd)
    gross_invested_thb = _buckets_to_thb(gross_by_currency, thb_per_usd)
    realized_gain_loss_thb = sum(
        _native_to_thb(_native_fifo_metrics(items)[1], _transaction_currency(items[0]), thb_per_usd)
        for items in transactions_by_symbol.values()
        if items
    )
    active_symbols = {holding.symbol for holding in holdings}
    market_symbols = active_symbols | set(transactions_by_symbol)
    yahoo_cache = _portfolio_yahoo_cache(market_symbols)
    closed_dividends_ytd_thb = _closed_position_dividends(
        transactions_by_symbol,
        active_symbols,
        thb_per_usd,
        yahoo_cache,
        refresh_stale=refresh_stale,
    )
    if not holdings:
        cash_balance_thb = ledger_cash_thb + closed_dividends_ytd_thb
        total_return_thb = cash_balance_thb - net_contributions_thb
        return PortfolioDashboard(
            summary=PortfolioSummary(
                totalValue=_transport_money(cash_balance_thb, thb_per_usd),
                gainLoss=_transport_money(total_return_thb, thb_per_usd),
                gainLossPct=round((total_return_thb / net_contributions_thb) * 100, 2) if net_contributions_thb else 0,
                dividendsYtd=_transport_money(closed_dividends_ytd_thb, thb_per_usd),
                realizedGainLoss=_transport_money(realized_gain_loss_thb, thb_per_usd),
                totalReturn=_transport_money(total_return_thb, thb_per_usd),
                grossInvested=_transport_money(gross_invested_thb, thb_per_usd),
                netContributions=_transport_money(net_contributions_thb, thb_per_usd),
                cashBalance=_transport_money(cash_balance_thb, thb_per_usd),
            ),
            dcaOrders=orders,
            markers=[PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
            transactions=transactions,
            **_dashboard_fx(fx, reporting_currency),
        )

    # Each holding's market data is an independent set of cache/yfinance round trips — a
    # sequential loop pays for every holding back-to-back, which compounds badly on any cache
    # miss. ThreadPoolExecutor.map runs them concurrently while preserving input order, so the
    # zip() below still lines up holdings with their data correctly.
    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        live = list(pool.map(lambda holding: _load_holding_market_data(holding, yahoo_cache, refresh_stale=refresh_stale), holdings))

    rows: list[dict[str, object]] = []
    holding_trust: list[dict[str, Any]] = []
    invested_thb = 0.0
    securities_value_thb = 0.0
    dividends_ytd_thb = closed_dividends_ytd_thb
    annual_income_thb = 0.0
    histories: list[tuple[list[Any], pd.Series, str]] = []
    income_events: list[IncomeEvent] = []
    buy_markers: list[PortfolioMarker] = []

    for holding, data in zip(holdings, live, strict=True):
        record, history, info, paid_dividends, data_trust = data
        holding_trust.append(data_trust)
        symbol_transactions = transactions_by_symbol.get(holding.symbol, [])
        currency = str(record.get("currency") or (_transaction_currency(symbol_transactions[0]) if symbol_transactions else ("THB" if holding.symbol.endswith(".BK") else "USD"))).upper()
        native_cost, _realized = _native_fifo_metrics(symbol_transactions)
        # A brand-new holding may render before its first quote snapshot arrives. Cost basis is the
        # honest non-live placeholder; zero would fabricate a -100% loss until the quote overlay.
        native_price = float(record["price"]) if record.get("price") else (native_cost / holding.shares if holding.shares else 0.0)
        value_thb = _native_to_thb(holding.shares * native_price, currency, thb_per_usd)
        cost_thb = _native_to_thb(native_cost, currency, thb_per_usd)
        invested_thb += cost_thb
        securities_value_thb += value_thb
        dividends_ytd_thb += _native_to_thb(_dividends_for_transactions(paid_dividends, symbol_transactions), currency, thb_per_usd)
        annual_income_thb += _native_to_thb(holding.shares * (as_float(info.get("dividendRate")) or 0.0), currency, thb_per_usd)
        purchase_date = _first_buy_date(symbol_transactions) or _iso_date(holding.createdAt)
        closes = _close_series(history, since=purchase_date, current_price=float(record["price"]) if record.get("price") else None)
        if not closes.empty:
            histories.append((symbol_transactions, closes, currency))
        rows.append({**holding.model_dump(), **record, "dataTrust": data_trust, "value": _transport_money(value_thb, thb_per_usd), "cost": _transport_money(cost_thb, thb_per_usd), "gainLoss": _transport_money(value_thb - cost_thb, thb_per_usd), "gainLossPct": round(((value_thb - cost_thb) / cost_thb) * 100, 2) if cost_thb else 0})
        income_events.extend(_income_events(holding.symbol, holding.shares, info))
        for transaction in symbol_transactions:
            if transaction.kind == "BUY":
                marker_thb = _native_to_thb(_transaction_native_amount(transaction), _transaction_currency(transaction), thb_per_usd)
                buy_markers.append(PortfolioMarker(date=transaction.occurredAt[:10], symbol=holding.symbol, amount=_transport_money(marker_thb, thb_per_usd)))

    cash_balance_thb = ledger_cash_thb + dividends_ytd_thb
    total_value_thb = securities_value_thb + cash_balance_thb
    unrealized_gain_loss_thb = securities_value_thb - invested_thb
    total_return_thb = unrealized_gain_loss_thb + realized_gain_loss_thb + dividends_ytd_thb
    return PortfolioDashboard(
        summary=PortfolioSummary(
            totalValue=_transport_money(total_value_thb, thb_per_usd),
            invested=_transport_money(invested_thb, thb_per_usd),
            gainLoss=_transport_money(total_return_thb, thb_per_usd),
            gainLossPct=round((total_return_thb / net_contributions_thb) * 100, 2) if net_contributions_thb else 0,
            dividendsYtd=_transport_money(dividends_ytd_thb, thb_per_usd),
            forwardYield=round((annual_income_thb / securities_value_thb) * 100, 2) if securities_value_thb else 0,
            unrealizedGainLoss=_transport_money(unrealized_gain_loss_thb, thb_per_usd),
            realizedGainLoss=_transport_money(realized_gain_loss_thb, thb_per_usd),
            totalReturn=_transport_money(total_return_thb, thb_per_usd),
            grossInvested=_transport_money(gross_invested_thb, thb_per_usd),
            netContributions=_transport_money(net_contributions_thb, thb_per_usd),
            cashBalance=_transport_money(cash_balance_thb, thb_per_usd),
        ),
        holdings=rows,
        dcaOrders=orders,
        chart=_portfolio_chart(histories, thb_per_usd),
        markers=buy_markers + [PortfolioMarker(date=item.scheduledFor, symbol=item.symbol, amount=item.amount) for item in orders],
        incomeEvents=sorted(income_events, key=lambda item: item.date),
        transactions=transactions,
        dataTrust=aggregate_data_trust(holding_trust),
        **_dashboard_fx(fx, reporting_currency),
    )


def build_portfolio_quotes(user_id: int = 0) -> dict[str, Any]:
    """Latest quote overlay only; the browser merges this into the saved dashboard."""
    settings = load_user_settings(user_id) if user_id else None
    fx = fx_payload([str((settings or {}).get("baseCurrency") or "THB")])
    holdings = list_holdings(user_id)
    if not holdings:
        return {"quotes": [], "pending": False, "updatedAt": None, **_quote_fx(fx)}

    yahoo_cache = _portfolio_yahoo_cache({holding.symbol for holding in holdings}, include_dividends=False)

    def load(holding) -> dict[str, Any]:
        symbol = holding.symbol.upper()
        modules = load_ticker_modules(
            make_ticker(symbol),
            symbol,
            company_cached=yahoo_cache.get((symbol, "modules", "")),
            quote_cached=yahoo_cache.get((symbol, "quote", "")),
            cache_supplied=True,
        )
        info = merge_ticker_info(modules, holding.symbol)
        price = as_float(info.get("currentPrice")) or as_float(info.get("regularMarketPrice"))
        previous = as_float(info.get("regularMarketPreviousClose"))
        change_pct = ((price - previous) / previous * 100.0) if price and previous else 0.0
        meta = quote_snapshot_meta(
            symbol,
            cached_entry=yahoo_cache.get((symbol, "quote", "")),
            cache_supplied=True,
        )
        record = {
            "symbol": holding.symbol,
            "price": price,
            "currency": info.get("currency") or ("THB" if holding.symbol.endswith(".BK") else "USD"),
            "regularMarketTime": info.get("regularMarketTime"),
        }
        trust = build_yahoo_data_trust(
            holding.symbol,
            stock=record,
            business={},
            history_period="1y",
            include_news=False,
            include_dividends=False,
            check_fundamentals=False,
            cache_entries=yahoo_cache,
        )
        return {
            "symbol": holding.symbol,
            "price": price,
            "currency": info.get("currency") or ("THB" if holding.symbol.endswith(".BK") else "USD"),
            "changePct": round(change_pct, 2),
            "fresh": meta["fresh"],
            "fetchedAt": meta["fetchedAt"],
            "dataTrust": trust,
        }

    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        quotes = list(pool.map(load, holdings))
    fresh_dates = [str(item["fetchedAt"]) for item in quotes if item.get("fresh") and item.get("fetchedAt")]
    return {
        "quotes": quotes,
        "pending": any(not item.get("fresh") for item in quotes),
        "updatedAt": max(fresh_dates) if fresh_dates else None,
        "dataTrust": aggregate_data_trust([item.get("dataTrust") for item in quotes]),
        **_quote_fx(fx),
    }


def _load_holding_market_data(
    holding,
    yahoo_cache: dict[tuple[str, str, str], YahooCacheEntry] | None = None,
    *,
    refresh_stale: bool = True,
):
    symbol = holding.symbol.upper()
    supplied = yahoo_cache is not None
    entries = yahoo_cache or {}
    ticker = make_ticker(symbol)
    modules = load_ticker_modules(
        ticker,
        symbol,
        company_cached=entries.get((symbol, "modules", "")),
        quote_cached=entries.get((symbol, "quote", "")),
        cache_supplied=supplied,
        refresh_stale=refresh_stale,
    )
    info = merge_ticker_info(modules, holding.symbol)
    history = fetch_history(
        ticker,
        period="1y",
        cached_entry=entries.get((symbol, "history", "1y")),
        cache_supplied=supplied,
        refresh_stale=refresh_stale,
    )
    entry = build_entry_from_info(holding.symbol, info)
    record = fetch_record_from_ticker(entry, ticker=ticker, info=info, history=history)
    # Only count dividends whose ex-date fell on/after purchase — a position bought today has
    # not earned any dividend yet; it accrues once an ex-date passes while the stock is held.
    dividends = fetch_dividends(
        ticker,
        period="ytd",
        cached_entry=entries.get((symbol, "dividends", "ytd")),
        cache_supplied=supplied,
        refresh_stale=refresh_stale,
    )
    trust = build_yahoo_data_trust(
        holding.symbol,
        stock={**record, "regularMarketTime": info.get("regularMarketTime")},
        business={
            "marketCap": info.get("marketCap"),
            "peRatio": info.get("trailingPE") or info.get("forwardPE"),
            "priceToBook": info.get("priceToBook"),
            "roe": info.get("returnOnEquity"),
            "profitMargin": info.get("profitMargins"),
            "revenueGrowth": info.get("revenueGrowth"),
            "dividendYield": info.get("dividendYield"),
            "debtToEquity": info.get("debtToEquity"),
        },
        history=history,
        history_period="1y",
        include_news=False,
        dividends_period="ytd",
        cache_entries=yahoo_cache,
    )
    return record, history, info, dividends, trust


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


def _closed_position_dividends(
    transactions_by_symbol: dict[str, list[Any]],
    active_symbols: set[str],
    thb_per_usd: float,
    yahoo_cache: dict[tuple[str, str, str], YahooCacheEntry] | None = None,
    *,
    refresh_stale: bool = True,
) -> float:
    closed_symbols = [symbol for symbol in transactions_by_symbol if symbol not in active_symbols]
    if not closed_symbols:
        return 0.0

    def load(symbol: str) -> tuple[str, pd.Series]:
        normalized = symbol.upper()
        return symbol, fetch_dividends(
            make_ticker(normalized),
            period="ytd",
            cached_entry=(yahoo_cache or {}).get((normalized, "dividends", "ytd")),
            cache_supplied=yahoo_cache is not None,
            refresh_stale=refresh_stale,
        )

    total = 0.0
    with ThreadPoolExecutor(max_workers=min(6, len(closed_symbols))) as pool:
        for symbol, dividends in pool.map(load, closed_symbols):
            native_total = _dividends_for_transactions(dividends, transactions_by_symbol[symbol])
            total += _native_to_thb(native_total, "THB" if symbol.endswith(".BK") else "USD", thb_per_usd)
    return total


def _portfolio_yahoo_cache(
    symbols: set[str],
    *,
    include_dividends: bool = True,
) -> dict[tuple[str, str, str], YahooCacheEntry]:
    requests: list[tuple[str, str, str]] = []
    for symbol in symbols:
        normalized = symbol.upper().strip()
        requests.extend([
            (normalized, "modules", ""),
            (normalized, "quote", ""),
            (normalized, "history", "1y"),
        ])
        if include_dividends:
            requests.append((normalized, "dividends", "ytd"))
    return load_yahoo_data_batch(requests)


def _dashboard_fx(fx: dict[str, object], reporting_currency: str) -> dict[str, object]:
    return {
        "fxRates": fx["rates"],
        "fxFetchedAt": fx["fetchedAt"],
        "fxSource": fx["source"],
        "fxStale": fx["stale"],
        "reportingCurrency": reporting_currency,
    }


def _quote_fx(fx: dict[str, object]) -> dict[str, object]:
    return {
        "fxRates": fx["rates"],
        "fxFetchedAt": fx["fetchedAt"],
        "fxSource": fx["source"],
        "fxStale": fx["stale"],
    }


def _transaction_currency(transaction: Any) -> str:
    currency = str(getattr(transaction, "nativeCurrency", "") or "").upper()
    if currency:
        return currency
    return "THB" if str(getattr(transaction, "symbol", "")).upper().endswith(".BK") else "USD"


def _transaction_native_amount(transaction: Any) -> float:
    currency = _transaction_currency(transaction)
    native_price = float(getattr(transaction, "nativePrice", 0) or 0)
    native_fees = float(getattr(transaction, "nativeFees", 0) or 0)
    if native_price <= 0:
        fx_rate = float(getattr(transaction, "fxRate", 1) or 1)
        native_price = float(getattr(transaction, "price", 0) or 0) * (fx_rate if currency != "USD" else 1)
        native_fees = float(getattr(transaction, "fees", 0) or 0) * (fx_rate if currency != "USD" else 1)
    gross = float(getattr(transaction, "shares", 0) or 0) * native_price
    return gross - native_fees if transaction.kind == "SELL" else gross + native_fees


def _native_fifo_details(transactions: list[Any]) -> tuple[float, float, dict[int, float]]:
    lots: list[list[float]] = []
    realized = 0.0
    event_basis: dict[int, float] = {}
    for transaction in sorted(transactions, key=lambda item: (item.occurredAt, item.id)):
        shares = float(transaction.shares or 0)
        if transaction.kind == "BUY" and shares > 0:
            cost = _transaction_native_amount(transaction)
            lots.append([shares, cost / shares])
            event_basis[transaction.id] = cost
        elif transaction.kind == "SELL" and shares > 0:
            basis = _consume_lots(lots, shares)
            event_basis[transaction.id] = basis
            realized += _transaction_native_amount(transaction) - basis
    remaining_cost = sum(shares * unit_cost for shares, unit_cost in lots)
    return remaining_cost, realized, event_basis


def _native_fifo_metrics(transactions: list[Any]) -> tuple[float, float]:
    remaining, realized, _events = _native_fifo_details(transactions)
    return remaining, realized


def _consume_lots(lots: list[list[float]], requested_shares: float) -> float:
    remaining = requested_shares
    basis = 0.0
    while remaining > 1e-9 and lots:
        lot_shares, unit_cost = lots[0]
        used = min(remaining, lot_shares)
        basis += used * unit_cost
        remaining -= used
        lot_shares -= used
        if lot_shares <= 1e-9:
            lots.pop(0)
        else:
            lots[0][0] = lot_shares
    return basis


def _native_cash_ledger(transactions: list[Any]) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    cash: dict[str, float] = {}
    contributions: dict[str, float] = {}
    gross_invested: dict[str, float] = {}
    for transaction in sorted(transactions, key=lambda item: (item.occurredAt, item.id)):
        currency = _transaction_currency(transaction)
        amount = _transaction_native_amount(transaction)
        cash.setdefault(currency, 0.0)
        contributions.setdefault(currency, 0.0)
        gross_invested.setdefault(currency, 0.0)
        if transaction.kind == "BUY":
            gross_invested[currency] += amount
            used_cash = min(cash[currency], amount)
            cash[currency] -= used_cash
            contributions[currency] += amount - used_cash
        elif transaction.kind in {"SELL", "DIVIDEND"}:
            cash[currency] += amount
        elif transaction.kind == "FEE":
            cash[currency] -= amount
    return cash, contributions, gross_invested


def _native_to_thb(value: float, currency: str, thb_per_usd: float) -> float:
    return value if currency.upper() == "THB" else value * thb_per_usd


def _buckets_to_thb(values: dict[str, float], thb_per_usd: float) -> float:
    return sum(_native_to_thb(value, currency, thb_per_usd) for currency, value in values.items())


def _transport_money(thb_value: float, thb_per_usd: float) -> float:
    # API money remains USD-equivalent for compatibility. The web layer immediately renders
    # the primary THB figure by applying this same live rate, so native THB totals round-trip.
    return round(thb_value / thb_per_usd, 2) if thb_per_usd else 0.0


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


def _portfolio_chart(histories: list[tuple], thb_per_usd: float = 1.0) -> list[PortfolioPoint]:
    if not histories:
        return []
    all_index = pd.concat([entry[1].rename(str(index)) for index, entry in enumerate(histories)], axis=1).sort_index().index
    if all_index.empty:
        return []
    value_series = pd.Series(0.0, index=all_index)
    cost_series = pd.Series(0.0, index=all_index)
    for entry in histories:
        transactions, closes = entry[0], entry[1]
        currency = str(entry[2] if len(entry) > 2 else "USD").upper()
        transport_factor = (1 / thb_per_usd) if currency == "THB" and thb_per_usd else 1.0
        aligned_closes = closes.reindex(all_index).ffill() * transport_factor
        shares_path = pd.Series(0.0, index=all_index)
        position_cost_path = pd.Series(0.0, index=all_index)
        _remaining, _realized, event_basis = _native_fifo_details(transactions)
        for transaction in transactions:
            if transaction.kind not in {"BUY", "SELL"}:
                continue
            event_date = datetime.fromisoformat(transaction.occurredAt.replace("Z", "+00:00")).date()
            mask = [timestamp.date() >= event_date for timestamp in all_index]
            if transaction.kind == "BUY":
                shares_path[mask] += transaction.shares
                position_cost_path[mask] += event_basis.get(transaction.id, 0.0) * transport_factor
            else:
                shares_path[mask] -= transaction.shares
                position_cost_path[mask] -= event_basis.get(transaction.id, 0.0) * transport_factor
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
