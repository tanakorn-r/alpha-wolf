from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from internal.fx import normalize_currency, to_usd
from internal.store.db import connect
from models import BuyHoldingInput, DcaOrder, DcaOrderInput, Holding, HoldingInput, PortfolioTransaction, SellHoldingInput, SellHoldingResult


def list_holdings(user_id: int = 0) -> list[Holding]:
    if user_id <= 0:
        return []
    with connect() as db:
        rows = db.execute("SELECT * FROM holdings WHERE user_id = ? ORDER BY symbol", (user_id,)).fetchall()
    return [_holding(row) for row in rows]


def upsert_holding(value: HoldingInput, user_id: int = 0) -> Holding:
    _require_account(user_id)
    symbol = value.symbol.strip().upper()
    with connect() as db:
        existing = db.execute("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol)).fetchone()
    if not existing:
        return record_buy(BuyHoldingInput(symbol=symbol, shares=value.shares, price=value.averageCost, strategy=value.strategy, monthlyDca=value.monthlyDca), user_id)

    current = _holding(existing)
    if value.shares + 1e-9 < current.shares:
        raise ValueError("Reducing shares requires a sell transaction with an execution price")
    if value.shares > current.shares + 1e-9:
        added_shares = value.shares - current.shares
        added_cost = value.shares * value.averageCost - current.shares * current.averageCost
        added_price = added_cost / added_shares if added_cost > 0 else value.averageCost
        return record_buy(BuyHoldingInput(symbol=symbol, shares=added_shares, price=added_price, strategy=value.strategy, monthlyDca=value.monthlyDca), user_id)

    with connect() as db:
        db.execute(
            "UPDATE holdings SET strategy = ?, monthly_dca = ? WHERE user_id = ? AND symbol = ?",
            (value.strategy, value.monthlyDca, user_id, symbol),
        )
        row = db.execute("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol)).fetchone()
        db.commit()
    return _holding(row)


def record_buy(value: BuyHoldingInput, user_id: int) -> Holding:
    _require_account(user_id)
    symbol = value.symbol.strip().upper()
    occurred_at = _occurred_at(value.occurredAt)
    transaction_date = datetime.fromisoformat(occurred_at).date()
    fx_date = transaction_date if transaction_date < datetime.now(timezone.utc).date() else None
    # A missing currency is the legacy API contract: price is already USD-base.
    # New browser clients always send the instrument's native ISO currency.
    native_currency = normalize_currency(value.currency, symbol if value.currency else None)
    price, fx = to_usd(value.price, native_currency, symbol=symbol, on_date=fx_date)
    fees, _ = to_usd(value.fees, native_currency, symbol=symbol, on_date=fx_date)
    created_at = datetime.now(timezone.utc).isoformat()
    gross_cost = value.shares * price + fees
    with connect() as db:
        db.execute(
            """INSERT INTO portfolio_transactions(
                   user_id, symbol, kind, shares, price, amount, fees, cost_basis,
                   realized_pnl, occurred_at, source, created_at,
                   native_currency, native_price, native_fees, fx_rate
               ) VALUES(?, ?, 'BUY', ?, ?, ?, ?, ?, NULL, ?, 'USER', ?, ?, ?, ?, ?)""",
            (user_id, symbol, value.shares, price, gross_cost, fees, gross_cost, occurred_at, created_at,
             native_currency, value.price, value.fees, fx.rate),
        )
        result = _sync_holding_from_ledger(db, user_id, symbol, value.strategy, value.monthlyDca)
        if not result:
            raise ValueError("This buy is fully offset by later sales; review the transaction dates")
        db.commit()
    return _holding(result)


def record_sale(symbol: str, value: SellHoldingInput, user_id: int) -> SellHoldingResult:
    _require_account(user_id)
    normalized = symbol.strip().upper()
    occurred_at = _occurred_at(value.occurredAt)
    transaction_date = datetime.fromisoformat(occurred_at).date()
    fx_date = transaction_date if transaction_date < datetime.now(timezone.utc).date() else None
    native_currency = normalize_currency(value.currency, normalized if value.currency else None)
    price, fx = to_usd(value.price, native_currency, symbol=normalized, on_date=fx_date)
    fees, _ = to_usd(value.fees, native_currency, symbol=normalized, on_date=fx_date)
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        holding_row = db.execute("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, normalized)).fetchone()
        if not holding_row:
            raise ValueError(f"{normalized} is not in this portfolio")
        holding = _holding(holding_row)
        if value.shares > holding.shares + 1e-9:
            raise ValueError(f"Cannot sell {value.shares:g}; only {holding.shares:g} shares are held")

        transaction_rows = db.execute(
            "SELECT * FROM portfolio_transactions WHERE user_id = ? AND symbol = ? AND occurred_at <= ? ORDER BY occurred_at, id",
            (user_id, normalized, occurred_at),
        ).fetchall()
        lots = _open_lots(transaction_rows)
        available_at_sale = sum(lot[0] for lot in lots)
        if value.shares > available_at_sale + 1e-9:
            raise ValueError(f"Only {available_at_sale:g} shares were held on {occurred_at[:10]}")
        cost_basis = _consume_lots(lots, value.shares, fallback_unit_cost=holding.averageCost)
        proceeds = value.shares * price - fees
        realized_pnl = proceeds - cost_basis
        cursor = db.execute(
            """INSERT INTO portfolio_transactions(
                   user_id, symbol, kind, shares, price, amount, fees, cost_basis,
                   realized_pnl, occurred_at, source, created_at,
                   native_currency, native_price, native_fees, fx_rate
               ) VALUES(?, ?, 'SELL', ?, ?, ?, ?, ?, ?, ?, 'USER', ?, ?, ?, ?, ?)""",
            (user_id, normalized, value.shares, price, proceeds, fees, cost_basis, realized_pnl, occurred_at, created_at,
             native_currency, value.price, value.fees, fx.rate),
        )
        updated = _sync_holding_from_ledger(db, user_id, normalized, holding.strategy, holding.monthlyDca)
        remaining_holding = _holding(updated) if updated else None
        transaction_row = db.execute("SELECT * FROM portfolio_transactions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        db.commit()
    return SellHoldingResult(transaction=_transaction(transaction_row), holding=remaining_holding)


def list_transactions(user_id: int, symbol: str | None = None) -> list[PortfolioTransaction]:
    if user_id <= 0:
        return []
    with connect() as db:
        if symbol:
            rows = db.execute(
                "SELECT * FROM portfolio_transactions WHERE user_id = ? AND symbol = ? ORDER BY occurred_at, id",
                (user_id, symbol.strip().upper()),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM portfolio_transactions WHERE user_id = ? ORDER BY occurred_at, id",
                (user_id,),
            ).fetchall()
    return [_transaction(row) for row in rows]


def delete_holding(symbol: str, user_id: int = 0) -> None:
    _require_account(user_id)
    raise ValueError("Record a sell transaction with shares and execution price instead of deleting a holding")


def list_dca_orders(user_id: int = 0) -> list[DcaOrder]:
    if user_id <= 0:
        return []
    with connect() as db:
        rows = db.execute("SELECT * FROM dca_orders WHERE user_id = ? ORDER BY scheduled_for, id", (user_id,)).fetchall()
    return [_order(row) for row in rows]


def create_dca_order(value: DcaOrderInput, user_id: int = 0) -> DcaOrder:
    _require_account(user_id)
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO dca_orders(user_id, symbol, amount, scheduled_for, strategy, status, shares, created_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, value.symbol.strip().upper(), value.amount, value.scheduledFor, value.strategy, value.status, value.shares, created_at),
        )
        row = db.execute("SELECT * FROM dca_orders WHERE user_id = ? AND id = ?", (user_id, cursor.lastrowid)).fetchone()
        db.commit()
    return _order(row)


def delete_dca_order(order_id: int, user_id: int = 0) -> None:
    _require_account(user_id)
    with connect() as db:
        db.execute("DELETE FROM dca_orders WHERE user_id = ? AND id = ?", (user_id, order_id))
        db.commit()


def update_dca_order_amount(order_id: int, amount: float, shares: float | None = None, user_id: int = 0) -> DcaOrder:
    _require_account(user_id)
    with connect() as db:
        db.execute("UPDATE dca_orders SET amount = ?, shares = ? WHERE user_id = ? AND id = ?", (max(amount, 0), shares, user_id, order_id))
        row = db.execute("SELECT * FROM dca_orders WHERE user_id = ? AND id = ?", (user_id, order_id)).fetchone()
        db.commit()
    return _order(row)


def list_watchlist(user_id: int = 0) -> list[str]:
    if user_id <= 0:
        return []
    with connect() as db:
        rows = db.execute("SELECT symbol FROM portfolio_watchlist WHERE user_id = ? ORDER BY created_at, id", (user_id,)).fetchall()
    # SQLite returns sqlite3.Row while the remote libSQL client returns a tuple for this
    # single-column projection.
    return [str(row["symbol"] if hasattr(row, "keys") else row[0]) for row in rows]


def add_watchlist_symbols(symbols: list[str], user_id: int = 0) -> list[str]:
    _require_account(user_id)
    created_at = datetime.now(timezone.utc).isoformat()
    normalized = [symbol.strip().upper() for symbol in symbols if symbol.strip()]
    with connect() as db:
        for symbol in dict.fromkeys(normalized):
            db.execute(
                "INSERT OR IGNORE INTO portfolio_watchlist(user_id, symbol, created_at) VALUES(?, ?, ?)",
                (user_id, symbol, created_at),
            )
        db.commit()
    return list_watchlist(user_id)


def delete_watchlist_symbol(symbol: str, user_id: int = 0) -> None:
    _require_account(user_id)
    with connect() as db:
        db.execute("DELETE FROM portfolio_watchlist WHERE user_id = ? AND symbol = ?", (user_id, symbol.strip().upper()))
        db.commit()


def _holding(row) -> Holding:
    return Holding(
        id=_row_value(row, "id", 0),
        symbol=_row_value(row, "symbol", 2),
        shares=_row_value(row, "shares", 3),
        averageCost=_row_value(row, "average_cost", 4),
        strategy=_row_value(row, "strategy", 5),
        monthlyDca=_row_value(row, "monthly_dca", 6),
        createdAt=_row_value(row, "created_at", 7),
    )


def _order(row) -> DcaOrder:
    return DcaOrder(
        id=_row_value(row, "id", 0),
        symbol=_row_value(row, "symbol", 2),
        amount=_row_value(row, "amount", 3),
        scheduledFor=_row_value(row, "scheduled_for", 4),
        strategy=_row_value(row, "strategy", 5),
        status=_row_value(row, "status", 6),
        executedPrice=_row_value(row, "executed_price", 7),
        shares=_row_value(row, "shares", 8),
        createdAt=_row_value(row, "created_at", 9),
    )


def _row_value(row, key: str, tuple_index: int):
    return row[key] if hasattr(row, "keys") else row[tuple_index]


def _transaction(row) -> PortfolioTransaction:
    return PortfolioTransaction(
        id=_row_value(row, "id", 0),
        symbol=_row_value(row, "symbol", 2),
        kind=_row_value(row, "kind", 3),
        shares=_row_value(row, "shares", 4),
        price=_row_value(row, "price", 5),
        amount=_row_value(row, "amount", 6),
        fees=_row_value(row, "fees", 7),
        nativeCurrency=_row_value(row, "native_currency", 13) or "USD",
        nativePrice=_row_value(row, "native_price", 14) or _row_value(row, "price", 5),
        nativeFees=_row_value(row, "native_fees", 15) or 0,
        fxRate=_row_value(row, "fx_rate", 16) or 1,
        costBasis=_row_value(row, "cost_basis", 8),
        realizedPnl=_row_value(row, "realized_pnl", 9),
        occurredAt=_row_value(row, "occurred_at", 10),
        source=_row_value(row, "source", 11),
        createdAt=_row_value(row, "created_at", 12),
    )


def _open_lots(rows) -> list[list[float]]:
    lots: list[list[float]] = []
    for row in rows:
        kind = str(_row_value(row, "kind", 3))
        shares = float(_row_value(row, "shares", 4) or 0)
        if kind == "BUY" and shares > 0:
            cost = float(_row_value(row, "cost_basis", 8) or _row_value(row, "amount", 6) or 0)
            lots.append([shares, cost / shares if shares else 0])
        elif kind == "SELL" and shares > 0:
            _consume_lots(lots, shares, fallback_unit_cost=0)
    return lots


def _consume_lots(lots: list[list[float]], shares: float, *, fallback_unit_cost: float) -> float:
    remaining = shares
    basis = 0.0
    while remaining > 1e-9 and lots:
        lot_shares, unit_cost = lots[0]
        consumed = min(remaining, lot_shares)
        basis += consumed * unit_cost
        lot_shares -= consumed
        remaining -= consumed
        if lot_shares <= 1e-9:
            lots.pop(0)
        else:
            lots[0][0] = lot_shares
    if remaining > 1e-9:
        basis += remaining * fallback_unit_cost
    return basis


def _occurred_at(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    now = datetime.now(timezone.utc)
    try:
        if len(value) == 10:
            # Date inputs intentionally have no timezone. Preserve entry order by
            # attaching the current UTC clock time; this lets a same-day sale
            # follow a same-day buy instead of sorting before it at midnight.
            requested_date = datetime.fromisoformat(value).date()
            parsed = datetime.combine(requested_date, time(now.hour, now.minute, now.second, now.microsecond), timezone.utc)
            # A local calendar can be one day ahead of UTC around midnight.
            if parsed > now and requested_date <= (now + timedelta(days=1)).date():
                parsed = now
        else:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Transaction date must be ISO-8601") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed > now:
        raise ValueError("Transaction date cannot be in the future")
    return parsed.astimezone(timezone.utc).isoformat()


def _sync_holding_from_ledger(db, user_id: int, symbol: str, strategy: str, monthly_dca: float):
    rows = db.execute(
        "SELECT * FROM portfolio_transactions WHERE user_id = ? AND symbol = ? ORDER BY occurred_at, id",
        (user_id, symbol),
    ).fetchall()
    lots = _open_lots(rows)
    shares = sum(lot[0] for lot in lots)
    if shares <= 1e-9:
        db.execute("DELETE FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol))
        return None
    total_cost = sum(lot_shares * unit_cost for lot_shares, unit_cost in lots)
    buy_dates = [str(_row_value(row, "occurred_at", 10)) for row in rows if str(_row_value(row, "kind", 3)) == "BUY"]
    created_at = min(buy_dates) if buy_dates else datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO holdings(user_id, symbol, shares, average_cost, strategy, monthly_dca, created_at)
           VALUES(?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, symbol) DO UPDATE SET shares=excluded.shares,
             average_cost=excluded.average_cost, strategy=excluded.strategy,
             monthly_dca=excluded.monthly_dca, created_at=excluded.created_at""",
        (user_id, symbol, shares, total_cost / shares, strategy, monthly_dca, created_at),
    )
    return db.execute("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol)).fetchone()


def _require_account(user_id: int) -> None:
    if user_id <= 0:
        raise PermissionError("Portfolio data requires an authenticated account")
