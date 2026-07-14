from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models import BuyHoldingInput, DcaOrderInput, HoldingInput, SellHoldingInput
from routes.portfolio import (
    patch_dca_order,
    portfolio,
    portfolio_quotes,
    buy_holding,
    remove_dca_order,
    remove_holding,
    remove_watchlist_symbol,
    save_dca_order,
    save_holding,
    save_watchlist_symbols,
    sell_holding,
    transactions,
    watchlist,
)


class PortfolioRouteAuthTests(unittest.TestCase):
    def test_every_personal_route_rejects_a_guest(self) -> None:
        request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
        calls = (
            lambda: portfolio(request),
            lambda: portfolio_quotes(request),
            lambda: save_holding(HoldingInput(symbol="AAPL", shares=1, averageCost=100), request),
            lambda: buy_holding(BuyHoldingInput(symbol="AAPL", shares=1, price=100), request),
            lambda: sell_holding("AAPL", SellHoldingInput(shares=1, price=100), request),
            lambda: remove_holding("AAPL", request),
            lambda: transactions(request),
            lambda: save_dca_order(DcaOrderInput(symbol="AAPL", amount=100, scheduledFor="2026-08-01"), request),
            lambda: remove_dca_order(1, request),
            lambda: patch_dca_order(1, request, {"amount": 50}),
            lambda: watchlist(request),
            lambda: save_watchlist_symbols(request, {"symbols": ["AAPL"]}),
            lambda: remove_watchlist_symbol("AAPL", request),
        )

        for call in calls:
            with self.subTest(call=call):
                with self.assertRaises(HTTPException) as raised:
                    call()
                self.assertEqual(raised.exception.status_code, 401)
                self.assertEqual(raised.exception.detail, "Sign in to access your account data")


if __name__ == "__main__":
    unittest.main()
