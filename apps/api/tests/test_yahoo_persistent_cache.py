from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db, yahoo_cache
from internal.store.yahoo_cache import load_yahoo_data, load_yahoo_data_batch, save_yahoo_data
from internal.yahoo.client import fetch_history


class FakeHistoryTicker:
    ticker = "CACHE"

    def __init__(self) -> None:
        self.calls = 0
        self.periods: list[str] = []

    def history(self, *, period: str, interval: str, auto_adjust: bool = True) -> pd.DataFrame:
        self.calls += 1
        self.periods.append(period)
        return pd.DataFrame(
            {"Open": [10.0, 11.0], "High": [11.0, 12.0], "Low": [9.0, 10.0], "Close": [10.5, 11.5], "Volume": [100, 120]},
            index=pd.to_datetime(["2026-07-08", "2026-07-09"], utc=True),
        )


class YahooPersistentCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "cache.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        self.background_patch = patch(
            "internal.yahoo.client._refresh_in_background",
            side_effect=lambda _namespace, _key, task: task(),
        )
        self.background_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.background_patch.stop()
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_json_payload_survives_database_round_trip(self) -> None:
        save_yahoo_data("AAPL", "news", [{"title": "Cached"}], ttl_seconds=3600)

        cached = load_yahoo_data("AAPL", "news")

        self.assertIsNotNone(cached)
        self.assertTrue(cached.is_fresh)  # type: ignore[union-attr]
        self.assertEqual(cached.payload[0]["title"], "Cached")  # type: ignore[union-attr]

    def test_batch_load_uses_one_connection_for_many_exact_datasets(self) -> None:
        save_yahoo_data("AAPL", "quote", {"price": 100}, ttl_seconds=3600)
        save_yahoo_data("SIRI.BK", "history", {"records": []}, period="1y", ttl_seconds=3600)

        with patch.object(yahoo_cache, "connect", wraps=store_db.connect) as connect:
            cached = load_yahoo_data_batch([
                ("AAPL", "quote", ""),
                ("SIRI.BK", "history", "1y"),
                ("AAPL", "modules", ""),
            ])

        self.assertEqual(connect.call_count, 1)
        self.assertEqual(cached[("AAPL", "quote", "")].payload["price"], 100)
        self.assertIn(("SIRI.BK", "history", "1y"), cached)
        self.assertNotIn(("AAPL", "modules", ""), cached)

    def test_history_is_read_from_database_without_second_yahoo_call(self) -> None:
        ticker = FakeHistoryTicker()

        first = fetch_history(ticker, "5y")
        second = fetch_history(ticker, "5y")

        self.assertEqual(ticker.calls, 1)
        self.assertTrue(first.empty)
        self.assertEqual(len(second), 2)
        cached = load_yahoo_data("CACHE", "history", "5y")
        self.assertIsNotNone(cached)

    def test_expired_five_year_history_only_fetches_recent_increment(self) -> None:
        ticker = FakeHistoryTicker()
        fetch_history(ticker, "5y")
        with store_db.connect() as db:
            db.execute(
                "UPDATE yahoo_data_cache SET expires_at = ? WHERE cache_key = ?",
                ("2000-01-01T00:00:00+00:00", "CACHE:history:5y"),
            )
            db.commit()

        refreshed = fetch_history(ticker, "5y")

        self.assertEqual(ticker.periods, ["5y", "1mo"])
        self.assertEqual(len(refreshed), 2)


if __name__ == "__main__":
    unittest.main()
