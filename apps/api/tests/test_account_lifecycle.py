from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from internal.store import db as store_db
from internal.store.account_lifecycle import delete_account_data, export_account_data, legal_acceptance_status, record_current_legal_acceptance
from internal.store.auth import upsert_google_user


class AccountLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "account.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()
        self.user = upsert_google_user(google_sub="legal-user", email="wolf@example.com", name="Wolf", picture_url=None)

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_acceptance_is_versioned(self) -> None:
        self.assertFalse(legal_acceptance_status(self.user["id"])["legalAccepted"])
        record_current_legal_acceptance(self.user["id"])
        status = legal_acceptance_status(self.user["id"])
        self.assertTrue(status["legalAccepted"])
        self.assertIsNotNone(status["legalAcceptedAt"])

    def test_export_contains_account_owned_data(self) -> None:
        record_current_legal_acceptance(self.user["id"])
        with store_db.connect() as db:
            db.execute("INSERT INTO portfolio_watchlist(user_id, symbol, created_at) VALUES(?, 'AAPL', '2026-07-15T00:00:00+00:00')", (self.user["id"],))
            db.execute("INSERT INTO support_requests(user_id, email, category, subject, message, created_at) VALUES(?, ?, 'support', 'Help', 'Please help me', '2026-07-15T00:00:00+00:00')", (self.user["id"], self.user["email"]))
            db.commit()
        exported = export_account_data(self.user["id"])
        self.assertEqual(exported["profile"]["email"], "wolf@example.com")
        self.assertEqual(exported["watchlist"][0]["symbol"], "AAPL")
        self.assertEqual(exported["supportRequests"][0]["subject"], "Help")
        json.dumps(exported)

    def test_delete_removes_all_account_scopes(self) -> None:
        user_id = self.user["id"]
        with store_db.connect() as db:
            db.execute("UPDATE ai_credit_balances SET balance = 10, updated_at = 'now' WHERE user_id = ?", (user_id,))
            db.execute("INSERT INTO backtrade_jobs(id, account_scope, payload, updated_at) VALUES('job', ?, '{}', 'now')", (f"user:{user_id}",))
            db.execute("INSERT INTO ai_response_cache(namespace, cache_key, payload, expires_at, updated_at) VALUES('analysis', ?, '{}', 1, 'now')", (f"user:{user_id}:result",))
            db.commit()
        delete_account_data(user_id)
        with store_db.connect() as db:
            self.assertIsNone(db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone())
            self.assertIsNone(db.execute("SELECT user_id FROM ai_credit_balances WHERE user_id = ?", (user_id,)).fetchone())
            self.assertIsNone(db.execute("SELECT id FROM backtrade_jobs WHERE account_scope = ?", (f"user:{user_id}",)).fetchone())
            self.assertIsNone(db.execute("SELECT cache_key FROM ai_response_cache WHERE cache_key LIKE ?", (f"user:{user_id}:%",)).fetchone())


if __name__ == "__main__":
    unittest.main()
