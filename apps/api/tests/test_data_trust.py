from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pandas as pd

from internal.market.data_trust import aggregate_data_trust, build_yahoo_data_trust
from internal.store.yahoo_cache import YahooCacheEntry
from routes.details import _compact_daily_detail


class DataTrustTests(unittest.TestCase):
    def _entry(self, payload, *, fresh: bool = True):
        now = datetime.now(timezone.utc)
        return YahooCacheEntry(payload, now - timedelta(minutes=1), now + (timedelta(minutes=1) if fresh else -timedelta(seconds=1)))

    @patch("internal.market.data_trust.load_yahoo_data")
    def test_delayed_snapshot_exposes_market_and_fetch_times(self, load):
        load.side_effect = lambda _symbol, kind, _period="": self._entry({"value": 1}) if kind in {"quote", "modules", "history"} else None
        history = pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-07-14T20:00:00Z"]))
        trust = build_yahoo_data_trust(
            "AAPL",
            stock={"price": 100, "currency": "USD"},
            business={
                "marketCap": 1, "peRatio": 1, "priceToBook": 1, "roe": 1,
                "profitMargin": 1, "revenueGrowth": 1, "dividendYield": 1, "debtToEquity": 1,
            },
            history=history,
            include_news=False,
            include_dividends=False,
        )
        self.assertEqual(trust["status"], "delayed")
        self.assertTrue(trust["delayed"])
        self.assertEqual(trust["marketTimestamp"], "2026-07-14T20:00:00+00:00")
        self.assertEqual(trust["marketTimestampSource"], "latest daily close")
        self.assertIsNotNone(trust["fetchedAt"])

    @patch("internal.market.data_trust.load_yahoo_data")
    def test_stale_and_missing_fields_cannot_look_current(self, load):
        load.side_effect = lambda _symbol, kind, _period="": self._entry({"value": 1}, fresh=kind != "quote")
        trust = build_yahoo_data_trust("AAPL", stock={"price": 100, "currency": "USD"}, business={}, include_news=False, include_dividends=False)
        self.assertEqual(trust["status"], "stale")
        self.assertTrue(trust["stale"])
        self.assertIn("marketTimestamp", trust["missingFields"])

    def test_aggregate_uses_least_trustworthy_status(self):
        base = {"provider": "Yahoo Finance", "status": "delayed", "stale": False, "marketTimestamp": "2026-07-15", "fetchedAt": "2026-07-15", "fallback": {"used": False}, "missingFields": [], "datasets": []}
        aggregate = aggregate_data_trust([base, {**base, "symbol": "B", "status": "partial", "missingFields": ["roe"]}])
        self.assertEqual(aggregate["status"], "partial")
        self.assertIn("B: roe", aggregate["missingFields"])

    def test_daily_brief_compact_payload_keeps_trust(self):
        trust = {"provider": "Yahoo Finance", "status": "stale"}
        result = _compact_daily_detail({"stock": {}, "dataTrust": trust})
        self.assertEqual(result["dataTrust"], trust)


if __name__ == "__main__":
    unittest.main()
