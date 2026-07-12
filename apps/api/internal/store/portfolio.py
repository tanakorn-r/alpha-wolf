from __future__ import annotations

from datetime import datetime, timezone

from internal.store.db import connect
from models import DcaOrder, DcaOrderInput, Holding, HoldingInput


def list_holdings(user_id: int = 0) -> list[Holding]:
    with connect() as db:
        rows = db.execute("SELECT * FROM holdings WHERE user_id = ? ORDER BY symbol", (user_id,)).fetchall()
    return [_holding(row) for row in rows]


def upsert_holding(value: HoldingInput, user_id: int = 0) -> Holding:
    symbol = value.symbol.strip().upper()
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """INSERT INTO holdings(user_id, symbol, shares, average_cost, strategy, monthly_dca, created_at)
               VALUES(?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, symbol) DO UPDATE SET shares=excluded.shares,
                 average_cost=excluded.average_cost, strategy=excluded.strategy,
                 monthly_dca=excluded.monthly_dca""",
            (user_id, symbol, value.shares, value.averageCost, value.strategy, value.monthlyDca, created_at),
        )
        row = db.execute("SELECT * FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol)).fetchone()
        db.commit()
    return _holding(row)


def delete_holding(symbol: str, user_id: int = 0) -> None:
    with connect() as db:
        db.execute("DELETE FROM holdings WHERE user_id = ? AND symbol = ?", (user_id, symbol.strip().upper()))
        db.commit()


def list_dca_orders(user_id: int = 0) -> list[DcaOrder]:
    with connect() as db:
        rows = db.execute("SELECT * FROM dca_orders WHERE user_id = ? ORDER BY scheduled_for, id", (user_id,)).fetchall()
    return [_order(row) for row in rows]


def create_dca_order(value: DcaOrderInput, user_id: int = 0) -> DcaOrder:
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
    with connect() as db:
        db.execute("DELETE FROM dca_orders WHERE user_id = ? AND id = ?", (user_id, order_id))
        db.commit()


def update_dca_order_amount(order_id: int, amount: float, shares: float | None = None, user_id: int = 0) -> DcaOrder:
    with connect() as db:
        db.execute("UPDATE dca_orders SET amount = ?, shares = ? WHERE user_id = ? AND id = ?", (max(amount, 0), shares, user_id, order_id))
        row = db.execute("SELECT * FROM dca_orders WHERE user_id = ? AND id = ?", (user_id, order_id)).fetchone()
        db.commit()
    return _order(row)


def list_watchlist(user_id: int = 0) -> list[str]:
    with connect() as db:
        rows = db.execute("SELECT symbol FROM portfolio_watchlist WHERE user_id = ? ORDER BY created_at, id", (user_id,)).fetchall()
    # SQLite returns sqlite3.Row while the remote libSQL client returns a tuple for this
    # single-column projection.
    return [str(row["symbol"] if hasattr(row, "keys") else row[0]) for row in rows]


def add_watchlist_symbols(symbols: list[str], user_id: int = 0) -> list[str]:
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
