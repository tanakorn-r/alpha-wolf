from __future__ import annotations

import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import cache


class AiCachePersistenceTests(unittest.TestCase):
    def test_expired_persisted_ai_result_remains_last_known_result(self) -> None:
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.execute(
            """CREATE TABLE ai_response_cache(
                namespace TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                payload TEXT NOT NULL,
                expires_at REAL NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(namespace, cache_key)
            )"""
        )
        db.execute(
            "INSERT INTO ai_response_cache VALUES(?, ?, ?, ?, ?)",
            ("analysis", "saved-report", json.dumps({"headline": "Still here"}), 1.0, "2026-01-01T00:00:00Z"),
        )
        db.commit()
        with cache._CACHE_LOCK:
            cache._CACHE.clear()

        with patch.object(cache, "connect", return_value=db):
            result = cache.cache_get("analysis", "saved-report")

        self.assertEqual(result, {"headline": "Still here"})
        self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_response_cache").fetchone()[0], 1)
        db.close()


if __name__ == "__main__":
    unittest.main()
