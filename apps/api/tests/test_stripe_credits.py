from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import entitlements


class StripeCreditsTests(unittest.TestCase):
    def test_paid_pack_is_fulfilled_exactly_once_per_checkout_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "credits.db")
            with sqlite3.connect(database) as db:
                db.execute("CREATE TABLE users(id INTEGER PRIMARY KEY, premium_redeemed_at TEXT, premium_expires_at TEXT)")
                db.execute(
                    "CREATE TABLE ai_usage_monthly(user_id INTEGER, period TEXT, used INTEGER DEFAULT 0, bonus INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(user_id, period))"
                )
                db.execute(
                    "CREATE TABLE stripe_credit_fulfillments(event_key TEXT PRIMARY KEY, session_id TEXT UNIQUE, user_id INTEGER, credits INTEGER, amount_total INTEGER, currency TEXT, created_at TEXT)"
                )
                db.execute("INSERT INTO users(id) VALUES(1)")
                db.commit()

            with patch.object(entitlements, "connect", side_effect=lambda: sqlite3.connect(database)):
                first, first_granted = entitlements.fulfill_stripe_ai_credits(
                    1, 25, event_key="evt_1", session_id="cs_test_1", amount_total=299, currency="usd"
                )
                second, second_granted = entitlements.fulfill_stripe_ai_credits(
                    1, 25, event_key="return:cs_test_1", session_id="cs_test_1", amount_total=299, currency="usd"
                )

            self.assertTrue(first_granted)
            self.assertFalse(second_granted)
            self.assertEqual(first["aiUsage"]["bonus"], 25)
            self.assertEqual(second["aiUsage"]["bonus"], 25)


if __name__ == "__main__":
    unittest.main()
