from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db
from internal.store.portfolio import list_holdings, list_transactions, record_buy, record_sale
from internal.market.portfolio import _cash_ledger, _dividends_for_transactions, _portfolio_chart
from models import BuyHoldingInput, PortfolioTransaction, SellHoldingInput


class PortfolioLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "portfolio.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_fifo_partial_sale_records_fees_basis_and_realized_pnl(self) -> None:
        record_buy(BuyHoldingInput(symbol="AAPL", shares=10, price=10, fees=10), user_id=1)
        record_buy(BuyHoldingInput(symbol="AAPL", shares=10, price=20), user_id=1)

        result = record_sale("AAPL", SellHoldingInput(shares=15, price=30, fees=5), user_id=1)

        self.assertAlmostEqual(result.transaction.costBasis or 0, 210)
        self.assertAlmostEqual(result.transaction.amount, 445)
        self.assertAlmostEqual(result.transaction.realizedPnl or 0, 235)
        self.assertIsNotNone(result.holding)
        self.assertAlmostEqual(result.holding.shares, 5)
        self.assertAlmostEqual(result.holding.averageCost, 20)
        self.assertEqual([item.kind for item in list_transactions(1)], ["BUY", "BUY", "SELL"])

    def test_full_sale_closes_materialized_holding_but_keeps_history(self) -> None:
        record_buy(BuyHoldingInput(symbol="SCB.BK", shares=5, price=3), user_id=2)
        result = record_sale("SCB.BK", SellHoldingInput(shares=5, price=4), user_id=2)

        self.assertIsNone(result.holding)
        self.assertEqual(list_holdings(2), [])
        self.assertEqual(len(list_transactions(2, "SCB.BK")), 2)
        self.assertAlmostEqual(result.transaction.realizedPnl or 0, 5)

    def test_same_calendar_day_buy_can_be_fully_sold(self) -> None:
        from datetime import datetime

        local_today = datetime.now().astimezone().date().isoformat()
        record_buy(BuyHoldingInput(symbol="META", shares=1.25, price=100, occurredAt=local_today), user_id=22)

        result = record_sale("META", SellHoldingInput(shares=1.25, price=110, occurredAt=local_today), user_id=22)

        self.assertIsNone(result.holding)
        self.assertEqual([item.kind for item in list_transactions(22, "META")], ["BUY", "SELL"])

    def test_sale_cannot_exceed_owned_shares(self) -> None:
        record_buy(BuyHoldingInput(symbol="AAPL", shares=2, price=100), user_id=3)
        with self.assertRaisesRegex(ValueError, "only 2 shares"):
            record_sale("AAPL", SellHoldingInput(shares=3, price=110), user_id=3)

    def test_existing_holding_is_backfilled_once_as_an_opening_lot(self) -> None:
        with store_db.connect() as db:
            db.execute(
                "INSERT INTO holdings(user_id, symbol, shares, average_cost, strategy, monthly_dca, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
                (8, "KTB.BK", 100, 0.75, "stable_dca", 0, "2025-01-10T00:00:00+00:00"),
            )
            db.commit()

        store_db.migrate()
        store_db.migrate()

        opening = list_transactions(8, "KTB.BK")
        self.assertEqual(len(opening), 1)
        self.assertEqual(opening[0].source, "OPENING_BALANCE")
        self.assertEqual(opening[0].occurredAt, "2025-01-10T00:00:00+00:00")

    def test_dividends_use_shares_held_on_each_ex_date(self) -> None:
        transactions = [
            transaction(1, "BUY", 10, 10, "2026-01-01T00:00:00+00:00", cost_basis=100),
            transaction(2, "BUY", 10, 12, "2026-02-01T00:00:00+00:00", cost_basis=120),
            transaction(3, "SELL", 5, 15, "2026-03-01T00:00:00+00:00", cost_basis=50),
        ]
        dividends = pd.Series(
            [1.0, 1.0, 1.0],
            index=pd.to_datetime(["2026-01-15", "2026-02-15", "2026-03-15"], utc=True),
        )

        self.assertAlmostEqual(_dividends_for_transactions(dividends, transactions), 45)

    def test_chart_applies_each_buy_only_from_its_transaction_date(self) -> None:
        transactions = [
            transaction(1, "BUY", 1, 10, "2026-01-01T00:00:00+00:00", cost_basis=10),
            transaction(2, "BUY", 1, 12, "2026-01-03T00:00:00+00:00", cost_basis=12),
        ]
        closes = pd.Series([10.0, 11.0, 12.0], index=pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"], utc=True))

        chart = _portfolio_chart([(transactions, closes)])

        self.assertEqual([point.value for point in chart], [10, 11, 24])
        self.assertEqual([point.cost for point in chart], [10, 10, 22])

    def test_sale_cash_is_reused_before_counting_new_contributions(self) -> None:
        transactions = [
            transaction(1, "BUY", 10, 10, "2026-01-01T00:00:00+00:00", cost_basis=100),
            PortfolioTransaction(id=2, symbol="AAPL", kind="SELL", shares=10, price=15, amount=150, costBasis=100, realizedPnl=50, occurredAt="2026-02-01T00:00:00+00:00", source="USER", createdAt="2026-02-01T00:00:00+00:00"),
            transaction(3, "BUY", 10, 12, "2026-03-01T00:00:00+00:00", cost_basis=120),
        ]

        cash, contributions = _cash_ledger(transactions)

        self.assertAlmostEqual(cash, 30)
        self.assertAlmostEqual(contributions, 100)


def transaction(transaction_id: int, kind: str, shares: float, price: float, occurred_at: str, *, cost_basis: float) -> PortfolioTransaction:
    amount = shares * price
    return PortfolioTransaction(
        id=transaction_id,
        symbol="AAPL",
        kind=kind,
        shares=shares,
        price=price,
        amount=amount,
        costBasis=cost_basis,
        occurredAt=occurred_at,
        source="USER",
        createdAt=occurred_at,
    )


if __name__ == "__main__":
    unittest.main()
