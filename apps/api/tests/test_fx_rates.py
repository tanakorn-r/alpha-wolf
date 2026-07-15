from __future__ import annotations

import sys
import tempfile
import unittest
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal import fx
from internal.store import db as store_db
from internal.store.portfolio import list_transactions, record_buy
from internal.market.portfolio import _native_cash_ledger, _native_fifo_metrics, _native_to_thb
from models import BuyHoldingInput, PortfolioTransaction


class FxRateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "fx.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_spot_rate_returns_fallback_without_waiting_for_yahoo(self) -> None:
        with patch.object(fx, "_schedule_spot_refresh") as schedule, patch.object(fx, "_fetch_rate") as fetch:
            result = fx.usd_quote_rate("THB")

        self.assertEqual(result.rate, 36.5)
        self.assertEqual(result.source, "fallback")
        self.assertTrue(result.stale)
        schedule.assert_called_once_with("THB=X", "THB", "spot")
        fetch.assert_not_called()

    def test_background_spot_refresh_is_cached_in_database_for_one_day(self) -> None:
        history = pd.DataFrame({"Close": [35.25, 35.5]}, index=pd.to_datetime(["2026-07-14", "2026-07-15"]))
        ticker = Mock()
        ticker.history.return_value = history

        with patch.object(fx.yf, "Ticker", return_value=ticker) as ticker_factory:
            fx._schedule_spot_refresh("THB=X", "THB", "spot")
            fx._FX_BACKGROUND_EXECUTOR.submit(lambda: None).result(timeout=2)
            result = fx.usd_quote_rate("THB")

        self.assertEqual(result.rate, 35.5)
        self.assertEqual(ticker_factory.call_count, 1)
        self.assertEqual(ticker.history.call_count, 1)
        self.assertGreaterEqual((result.expires_at - result.fetched_at).total_seconds(), 86_399)
        with store_db.connect() as db:
            row = db.execute("SELECT data_type, period FROM yahoo_data_cache WHERE symbol = ?", ("THB=X",)).fetchone()
        self.assertEqual(tuple(row), ("fx", "spot"))

    def test_thb_trade_stores_native_execution_and_usd_cost_basis(self) -> None:
        now = datetime.now(timezone.utc)
        thb = fx.FxRate("USD", "THB", 36.5, now, now + timedelta(days=1), "test")
        with patch.object(fx, "usd_quote_rate", return_value=thb):
            holding = record_buy(
                BuyHoldingInput(symbol="SCB.BK", shares=2, price=146, fees=3.65, currency="THB"),
                user_id=7,
            )

        transaction = list_transactions(7)[0]
        self.assertAlmostEqual(holding.averageCost, (2 * 4 + 0.1) / 2)
        self.assertEqual(transaction.nativeCurrency, "THB")
        self.assertEqual(transaction.nativePrice, 146)
        self.assertEqual(transaction.nativeFees, 3.65)
        self.assertEqual(transaction.fxRate, 36.5)
        self.assertAlmostEqual(transaction.price, 4)
        self.assertAlmostEqual(transaction.costBasis or 0, 8.1)

    def test_expired_database_rate_is_used_when_yfinance_is_unavailable(self) -> None:
        now = datetime.now(timezone.utc)
        with store_db.connect() as db:
            db.execute(
                """INSERT INTO yahoo_data_cache(cache_key, symbol, data_type, period, payload, fetched_at, expires_at)
                   VALUES(?, ?, ?, ?, ?, ?, ?)""",
                (
                    "THB=X:fx:spot",
                    "THB=X",
                    "fx",
                    "spot",
                    json.dumps({"base": "USD", "quote": "THB", "rate": 34.75, "source": "yfinance"}),
                    (now - timedelta(days=2)).isoformat(),
                    (now - timedelta(days=1)).isoformat(),
                ),
            )
            db.commit()
        ticker = Mock()
        ticker.history.side_effect = RuntimeError("offline")

        with patch.object(fx, "_schedule_spot_refresh") as schedule, patch.object(fx.yf, "Ticker", return_value=ticker):
            result = fx.usd_quote_rate("THB")

        self.assertEqual(result.rate, 34.75)
        self.assertTrue(result.stale)
        self.assertEqual(result.source, "yfinance-cache")
        schedule.assert_called_once_with("THB=X", "THB", "spot")
        ticker.history.assert_not_called()

    def test_thai_return_is_calculated_in_native_currency_before_display_conversion(self) -> None:
        siri = native_transaction(1, "SIRI.BK", "BUY", 13_500, 1.47)
        hmpro_buy = native_transaction(2, "HMPRO.BK", "BUY", 100, 6.60)
        hmpro_sell = native_transaction(3, "HMPRO.BK", "SELL", 100, 6.60)

        siri_cost, siri_realized = _native_fifo_metrics([siri])
        _hmpro_cost, hmpro_realized = _native_fifo_metrics([hmpro_buy, hmpro_sell])
        cash, contributions, _gross = _native_cash_ledger([siri, hmpro_buy, hmpro_sell])
        current_siri_value = 13_500 * 1.46
        total_return_thb = current_siri_value - siri_cost + siri_realized + hmpro_realized

        self.assertEqual(siri_cost, 19_845)
        self.assertEqual(cash["THB"], 660)
        self.assertEqual(contributions["THB"], 20_505)
        self.assertEqual(total_return_thb, -135)
        self.assertEqual(_native_to_thb(total_return_thb, "THB", 33.47), -135)

    def test_migration_recovers_native_thb_price_from_legacy_bk_transaction(self) -> None:
        with store_db.connect() as db:
            db.execute(
                """INSERT INTO portfolio_transactions(
                       user_id, symbol, kind, shares, price, amount, fees, cost_basis,
                       realized_pnl, occurred_at, source, created_at,
                       native_currency, native_price, native_fees, fx_rate
                   ) VALUES(1, 'SIRI.BK', 'BUY', 100, ?, ?, 0, ?, NULL, ?, 'USER', ?, 'USD', ?, 0, 1)""",
                (1.47 / 36.5, 147 / 36.5, 147 / 36.5, now_iso(), now_iso(), 1.47 / 36.5),
            )
            db.commit()

        store_db.migrate()
        transaction = list_transactions(1, "SIRI.BK")[0]

        self.assertEqual(transaction.nativeCurrency, "THB")
        self.assertAlmostEqual(transaction.nativePrice, 1.47)
        self.assertEqual(transaction.fxRate, 36.5)


def native_transaction(transaction_id: int, symbol: str, kind: str, shares: float, native_price: float) -> PortfolioTransaction:
    occurred_at = f"2026-07-{10 + transaction_id:02d}T00:00:00+00:00"
    amount_native = shares * native_price
    return PortfolioTransaction(
        id=transaction_id,
        symbol=symbol,
        kind=kind,
        shares=shares,
        price=amount_native / shares / 36.5,
        amount=amount_native / 36.5,
        nativeCurrency="THB",
        nativePrice=native_price,
        fxRate=36.5,
        occurredAt=occurred_at,
        source="USER",
        createdAt=occurred_at,
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    unittest.main()
