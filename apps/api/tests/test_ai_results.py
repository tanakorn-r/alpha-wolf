from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import db as store_db
from fastapi import Request
from fastapi.responses import Response
from internal.store.ai_results import AIResultKey, AIResultQualityError, load_ai_result, load_latest_ai_result, save_ai_result
from routes import analysis


def _result(agent_id: str, headline: str, generated_at: str = "2026-07-15T01:02:03+00:00") -> dict:
    return {
        "signal": "WAIT",
        "headline": headline,
        "summary": "A complete saved analysis.",
        "source": "openai",
        "model": "gpt-test",
        "agent": {"id": agent_id},
        "generatedAt": generated_at,
    }


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/api/ai/results/latest", "headers": []})


class AIResultStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "ai.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_results_are_isolated_by_account_and_keep_generation_time(self) -> None:
        one = AIResultKey(1, "stock-analysis", "AAPL", "vera", "v1:stable")
        two = AIResultKey(2, "stock-analysis", "AAPL", "vera", "v1:stable")
        save_ai_result(one, _result("vera", "User one's answer"))
        save_ai_result(two, _result("vera", "User two's answer", "2026-07-15T04:05:06+00:00"))

        self.assertEqual(load_ai_result(one)["headline"], "User one's answer")  # type: ignore[index]
        self.assertEqual(load_ai_result(one)["generatedAt"], "2026-07-15T01:02:03+00:00")  # type: ignore[index]
        self.assertEqual(load_ai_result(two)["headline"], "User two's answer")  # type: ignore[index]

    def test_failed_quality_gate_does_not_replace_last_good_result(self) -> None:
        key = AIResultKey(1, "stock-analysis", "AAPL", "vera", "v1:stable")
        save_ai_result(key, _result("vera", "Keep me"))

        with self.assertRaises(AIResultQualityError):
            save_ai_result(key, {**_result("vera", ""), "summary": ""})

        self.assertEqual(load_ai_result(key)["headline"], "Keep me")  # type: ignore[index]

    def test_agent_identity_is_part_of_the_quality_contract(self) -> None:
        key = AIResultKey(1, "stock-analysis", "AAPL", "ben", "v1:stable")
        with self.assertRaisesRegex(AIResultQualityError, "agent identity"):
            save_ai_result(key, _result("vera", "Wrong persona"))

    def test_guest_cannot_read_or_write_ai_results(self) -> None:
        key = AIResultKey(0, "stock-analysis", "AAPL", "vera", "v1:stable")
        self.assertIsNone(load_ai_result(key))
        with self.assertRaises(PermissionError):
            save_ai_result(key, _result("vera", "No guest row"))

    def test_latest_read_can_match_a_variant_prefix_without_generating(self) -> None:
        stable = AIResultKey(1, "stock-analysis", "AAPL", "vera", "v29:stable_dca:candidate")
        momentum = AIResultKey(1, "stock-analysis", "AAPL", "vera", "v29:momentum:candidate")
        save_ai_result(stable, _result("vera", "Stable answer"))
        save_ai_result(momentum, _result("vera", "Momentum answer"))

        result = load_latest_ai_result(1, "stock-analysis", "AAPL", "vera", variant_prefix="v29:stable_dca:")
        self.assertEqual(result["headline"], "Stable answer")  # type: ignore[index]

    def test_latest_route_returns_204_on_miss_without_entering_generation_flow(self) -> None:
        with (
            patch.object(analysis, "require_ai_account", return_value=(1, object())),
            patch.object(analysis, "load_latest_ai_result", return_value=None) as load,
            patch.object(analysis, "claim_ai_run") as claim,
        ):
            response = analysis.latest_ai_result(_request(), "today", "AAPL", "vera", "v23:stable_dca:")

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 204)
        load.assert_called_once()
        claim.assert_not_called()

    def test_latest_route_adopts_a_valid_pre_migration_ai_cache_row(self) -> None:
        legacy = _result("vera", "Restored legacy answer")
        with store_db.connect() as db:
            db.execute(
                "INSERT INTO ai_response_cache(namespace, cache_key, payload, expires_at, updated_at) VALUES(?, ?, ?, ?, ?)",
                (
                    "analysis",
                    "user:1:v29-prime-hybrid-council:AAPL:stable_dca:vera:candidate",
                    json.dumps(legacy),
                    1.0,
                    "2026-07-15T01:02:03+00:00",
                ),
            )
            db.commit()
        with patch.object(analysis, "require_ai_account", return_value=(1, object())):
            response = analysis.latest_ai_result(_request(), "stock-analysis", "AAPL", "vera", "v29:stable_dca:")

        self.assertEqual(response["headline"], "Restored legacy answer")  # type: ignore[index]
        self.assertIsNotNone(load_latest_ai_result(1, "stock-analysis", "AAPL", "vera", variant_prefix="v29:stable_dca:"))

    def test_migration_is_idempotent(self) -> None:
        store_db.migrate()
        with store_db.connect() as db:
            columns = {row[1] for row in db.execute("PRAGMA table_info(ai_results)").fetchall()}
        self.assertTrue({"user_id", "feature", "subject", "agent_id", "payload", "generated_at"}.issubset(columns))


if __name__ == "__main__":
    unittest.main()
