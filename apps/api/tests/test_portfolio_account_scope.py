from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db
from internal.store.portfolio import (
    _holding,
    _order,
    add_watchlist_symbols,
    delete_research_shortlist,
    delete_watchlist_symbol,
    list_dca_orders,
    list_holdings,
    list_watchlist,
    load_research_shortlist,
    save_research_shortlist,
    upsert_holding,
)
from models import HoldingInput


class PortfolioAccountScopeTests(unittest.TestCase):
    def test_turso_tuple_rows_decode_for_holding_and_order(self) -> None:
        holding = _holding((7, 2, "AAPL", 3.0, 190.0, "capitalized", 0.0, "2026-07-13T00:00:00+00:00"))
        order = _order((8, 2, "AAPL", 500.0, "2026-08-01", "stable_dca", "planned", None, 2.5, "2026-07-13T00:00:00+00:00"))

        self.assertEqual(holding.symbol, "AAPL")
        self.assertEqual(holding.averageCost, 190.0)
        self.assertEqual(order.scheduledFor, "2026-08-01")
        self.assertEqual(order.shares, 2.5)

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

    def test_same_symbol_is_isolated_by_user_id(self) -> None:
        upsert_holding(HoldingInput(symbol="AAPL", shares=1, averageCost=100), user_id=1)
        upsert_holding(HoldingInput(symbol="AAPL", shares=2, averageCost=200), user_id=2)

        user_one = list_holdings(user_id=1)
        user_two = list_holdings(user_id=2)
        guest = list_holdings(user_id=0)

        self.assertEqual(len(user_one), 1)
        self.assertEqual(user_one[0].shares, 1)
        self.assertEqual(len(user_two), 1)
        self.assertEqual(user_two[0].shares, 2)
        self.assertEqual(guest, [])

    def test_watchlist_is_isolated_by_user_id(self) -> None:
        add_watchlist_symbols(["GC=F", "GLD"], user_id=1)
        add_watchlist_symbols(["GLD", "CL=F"], user_id=2)

        self.assertEqual(list_watchlist(user_id=1), ["GC=F", "GLD"])
        self.assertEqual(list_watchlist(user_id=2), ["GLD", "CL=F"])

        delete_watchlist_symbol("GLD", user_id=1)

        self.assertEqual(list_watchlist(user_id=1), ["GC=F"])
        self.assertEqual(list_watchlist(user_id=2), ["GLD", "CL=F"])

    def test_research_shortlist_preserves_rank_and_adds_missing_watchlist_symbols(self) -> None:
        add_watchlist_symbols(["TSLA", "GLD"], user_id=1)

        result = save_research_shortlist(["aapl", "MSFT", "NVDA", "AMZN", "META"], user_id=1)

        self.assertEqual(result["symbols"], ["AAPL", "MSFT", "NVDA", "AMZN", "META"])
        self.assertIsNotNone(result["updatedAt"])
        self.assertEqual(load_research_shortlist(1), result)
        self.assertEqual(list_watchlist(1), ["TSLA", "GLD", "AAPL", "MSFT", "NVDA", "AMZN", "META"])

        reordered = save_research_shortlist(["META", "AAPL", "NVDA", "MSFT", "AMZN"], user_id=1)
        self.assertEqual(reordered["symbols"], ["META", "AAPL", "NVDA", "MSFT", "AMZN"])
        self.assertEqual(list_watchlist(1), ["TSLA", "GLD", "AAPL", "MSFT", "NVDA", "AMZN", "META"])

    def test_research_shortlist_requires_exactly_five_unique_symbols(self) -> None:
        with self.assertRaises(ValueError):
            save_research_shortlist(["AAPL", "MSFT"], user_id=1)
        with self.assertRaises(ValueError):
            save_research_shortlist(["AAPL", "AAPL", "MSFT", "NVDA", "META"], user_id=1)

    def test_research_shortlist_can_be_removed_without_removing_watchlist(self) -> None:
        symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "META"]
        save_research_shortlist(symbols, user_id=1)

        result = delete_research_shortlist(user_id=1)

        self.assertEqual(result, {"symbols": [], "updatedAt": None})
        self.assertEqual(load_research_shortlist(user_id=1), result)
        self.assertEqual(list_watchlist(user_id=1), symbols)

    def test_guest_personal_data_is_always_empty_and_read_only(self) -> None:
        self.assertEqual(list_holdings(user_id=0), [])
        self.assertEqual(list_dca_orders(user_id=0), [])
        self.assertEqual(list_watchlist(user_id=0), [])

        with self.assertRaises(PermissionError):
            upsert_holding(HoldingInput(symbol="AAPL", shares=1, averageCost=100), user_id=0)
        with self.assertRaises(PermissionError):
            add_watchlist_symbols(["AAPL"], user_id=0)

if __name__ == "__main__":
    unittest.main()
