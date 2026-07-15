from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from internal.store import db as store_db
from internal.store.ai_audit import list_ai_decision_history, record_ai_run
from internal.store.backtrade_jobs import claim_backtrade_job, load_backtrade_job, save_backtrade_job
from internal.store.notifications import list_notifications, notifications_from_ai_result


class PreGaHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "hardening.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_replay_queue_is_claimable_after_process_memory_is_lost(self) -> None:
        job = {"id": "durable", "accountScope": "user:7", "status": "queued", "symbol": "AAPL", "agent": {"id": "ben"}, "config": {"years": 3}, "progress": 0}
        save_backtrade_job(job)
        claimed = claim_backtrade_job("worker-one")
        self.assertEqual(claimed["id"], "durable")  # type: ignore[index]
        self.assertEqual(load_backtrade_job("durable", "user:7")["status"], "queued")  # payload updates when worker reports progress
        self.assertIsNone(claim_backtrade_job("worker-two"))

    def test_history_explains_changed_and_unchanged_decisions(self) -> None:
        base = {"model": "gpt-test", "promptVersion": "v1", "decisionState": {"id": "one", "guardedDecision": {"ownership": "PARTICIPATE", "timing": "WAIT"}}}
        record_ai_run(user_id=1, feature="stock-analysis", subject="AAPL", agent_id="vera", variant="v1", payload=base, guarded={"signal": "WAIT"}, status="accepted")
        record_ai_run(user_id=1, feature="stock-analysis", subject="AAPL", agent_id="vera", variant="v1", payload={**base, "decisionState": {"id": "two", "guardedDecision": {"ownership": "PARTICIPATE", "timing": "BREAKOUT"}}}, guarded={"signal": "BUY"}, status="accepted")
        history = list_ai_decision_history(1, "AAPL", "vera")
        self.assertIn("WAIT → BUY", history[0]["whyChanged"])
        self.assertEqual(history[-1]["whyChanged"], "First recorded decision for this Agent and stock.")

    def test_research_notifications_are_account_scoped_and_deduplicated(self) -> None:
        payload = {"signal": "BUY", "decisionState": {"guardedDecision": {"timing": "BREAKOUT"}}}
        notifications_from_ai_result(1, "AAPL", payload, "run-one")
        notifications_from_ai_result(1, "AAPL", payload, "run-one")
        self.assertEqual(len(list_notifications(1)), 1)
        self.assertEqual(list_notifications(2), [])


if __name__ == "__main__":
    unittest.main()
