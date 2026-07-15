from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from internal.store import db as store_db
from internal.store.account_lifecycle import delete_account_data, export_account_data, legal_acceptance_status, record_current_legal_acceptance
from internal.store.auth import upsert_google_user
from internal.store.settings import load_user_settings, save_user_settings


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
        record_current_legal_acceptance(self.user["id"], source="credit_checkout")
        status = legal_acceptance_status(self.user["id"])
        self.assertTrue(status["legalAccepted"])
        self.assertIsNotNone(status["legalAcceptedAt"])
        with store_db.connect() as db:
            rows = db.execute(
                "SELECT document, version, accepted_at, source FROM legal_acceptances WHERE user_id = ? ORDER BY document",
                (self.user["id"],),
            ).fetchall()
        self.assertEqual([str(row[0]) for row in rows], ["privacy", "terms"])
        self.assertEqual({str(row[3]) for row in rows}, {"credit_checkout"})
        self.assertEqual(len({str(row[2]) for row in rows}), 1)

    def test_legal_acceptance_rows_cannot_be_updated(self) -> None:
        record_current_legal_acceptance(self.user["id"], source="google_signup")
        with self.assertRaises(sqlite3.IntegrityError):
            with store_db.connect() as db:
                db.execute("UPDATE legal_acceptances SET source = 'tampered' WHERE user_id = ?", (self.user["id"],))

    def test_legal_acceptance_rows_cannot_be_deleted_while_account_exists(self) -> None:
        record_current_legal_acceptance(self.user["id"], source="google_signup")
        with self.assertRaises(sqlite3.IntegrityError):
            with store_db.connect() as db:
                db.execute("DELETE FROM legal_acceptances WHERE user_id = ?", (self.user["id"],))

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

    def test_locale_settings_are_absent_until_setup_then_restored(self) -> None:
        self.assertIsNone(self.user["settings"])
        saved = save_user_settings(
            self.user["id"],
            country_code="TH",
            display_language="en",
            base_currency="THB",
            timezone_name="Asia/Bangkok",
            date_locale="en-GB",
            number_locale="en-US",
            preferred_markets=["thailand", "us"],
        )
        self.assertEqual(saved["baseCurrency"], "THB")
        self.assertEqual(load_user_settings(self.user["id"])["preferredMarkets"], ["thailand", "us"])
        restored = upsert_google_user(google_sub="legal-user", email="wolf@example.com", name="Wolf", picture_url=None)
        self.assertEqual(restored["settings"]["timezone"], "Asia/Bangkok")
        self.assertIsNotNone(export_account_data(self.user["id"])["settings"])

    def test_delete_removes_all_account_scopes(self) -> None:
        user_id = self.user["id"]
        with store_db.connect() as db:
            db.execute("UPDATE ai_credit_balances SET balance = 10, updated_at = 'now' WHERE user_id = ?", (user_id,))
            db.execute("INSERT INTO backtrade_jobs(id, account_scope, payload, updated_at) VALUES('job', ?, '{}', 'now')", (f"user:{user_id}",))
            db.execute("INSERT INTO ai_response_cache(namespace, cache_key, payload, expires_at, updated_at) VALUES('analysis', ?, '{}', 1, 'now')", (f"user:{user_id}:result",))
            db.commit()
        save_user_settings(
            user_id,
            country_code="US",
            display_language="en",
            base_currency="USD",
            timezone_name="America/New_York",
            date_locale="en-US",
            number_locale="en-US",
            preferred_markets=["us"],
        )
        delete_account_data(user_id)
        with store_db.connect() as db:
            self.assertIsNone(db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone())
            self.assertIsNone(db.execute("SELECT user_id FROM ai_credit_balances WHERE user_id = ?", (user_id,)).fetchone())
            self.assertIsNone(db.execute("SELECT id FROM backtrade_jobs WHERE account_scope = ?", (f"user:{user_id}",)).fetchone())
            self.assertIsNone(db.execute("SELECT cache_key FROM ai_response_cache WHERE cache_key LIKE ?", (f"user:{user_id}:%",)).fetchone())
            self.assertIsNone(db.execute("SELECT user_id FROM user_settings WHERE user_id = ?", (user_id,)).fetchone())


if __name__ == "__main__":
    unittest.main()
