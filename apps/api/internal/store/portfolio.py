from __future__ import annotations

from datetime import datetime, timezone

from internal.store.db import connect
from models import DcaOrder, DcaOrderInput, Holding, HoldingInput


def list_holdings() -> list[Holding]:
    with connect() as db:
        rows = db.execute("SELECT * FROM holdings ORDER BY symbol").fetchall()
    return [_holding(row) for row in rows]


def upsert_holding(value: HoldingInput) -> Holding:
    symbol = value.symbol.strip().upper()
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """INSERT INTO holdings(symbol, shares, average_cost, strategy, monthly_dca, created_at)
               VALUES(?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol) DO UPDATE SET shares=excluded.shares,
                 average_cost=excluded.average_cost, strategy=excluded.strategy,
                 monthly_dca=excluded.monthly_dca""",
            (symbol, value.shares, value.averageCost, value.strategy, value.monthlyDca, created_at),
        )
        row = db.execute("SELECT * FROM holdings WHERE symbol = ?", (symbol,)).fetchone()
        db.commit()
    return _holding(row)


def delete_holding(symbol: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM holdings WHERE symbol = ?", (symbol.strip().upper(),))
        db.commit()


def list_dca_orders() -> list[DcaOrder]:
    with connect() as db:
        rows = db.execute("SELECT * FROM dca_orders ORDER BY scheduled_for, id").fetchall()
    return [_order(row) for row in rows]


def create_dca_order(value: DcaOrderInput) -> DcaOrder:
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO dca_orders(symbol, amount, scheduled_for, strategy, status, created_at)
               VALUES(?, ?, ?, ?, ?, ?)""",
            (value.symbol.strip().upper(), value.amount, value.scheduledFor, value.strategy, value.status, created_at),
        )
        row = db.execute("SELECT * FROM dca_orders WHERE id = ?", (cursor.lastrowid,)).fetchone()
        db.commit()
    return _order(row)


def delete_dca_order(order_id: int) -> None:
    with connect() as db:
        db.execute("DELETE FROM dca_orders WHERE id = ?", (order_id,))
        db.commit()


def _holding(row) -> Holding:
    return Holding(id=row["id"], symbol=row["symbol"], shares=row["shares"], averageCost=row["average_cost"], strategy=row["strategy"], monthlyDca=row["monthly_dca"], createdAt=row["created_at"])


def _order(row) -> DcaOrder:
    return DcaOrder(id=row["id"], symbol=row["symbol"], amount=row["amount"], scheduledFor=row["scheduled_for"], strategy=row["strategy"], status=row["status"], executedPrice=row["executed_price"], shares=row["shares"], createdAt=row["created_at"])
