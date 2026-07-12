from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.market.detail import hydrate_stock_quote_from_history


class DetailQuoteFallbackTests(unittest.TestCase):
    def test_missing_thai_quote_uses_latest_stored_close(self) -> None:
        stock = {"symbol": "MTC.BK", "price": 0, "changePct": 0, "currency": None}
        history = pd.DataFrame({"Close": [31.75, 32.50]})

        result = hydrate_stock_quote_from_history(stock, history)

        self.assertEqual(result["price"], 32.50)
        self.assertEqual(result["changePct"], 2.36)
        self.assertEqual(result["currency"], "THB")
        self.assertEqual(result["priceSource"], "stored_history_close")

    def test_real_quote_is_not_overwritten_by_history(self) -> None:
        stock = {"symbol": "AAPL", "price": 210.0, "changePct": 1.0, "currency": "USD"}
        history = pd.DataFrame({"Close": [200.0, 205.0]})

        self.assertIs(hydrate_stock_quote_from_history(stock, history), stock)


if __name__ == "__main__":
    unittest.main()
