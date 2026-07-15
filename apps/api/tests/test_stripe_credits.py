from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import entitlements
from internal.store import db as store_db
from routes import auth


class StripeCreditsTests(unittest.TestCase):
    @staticmethod
    def _create_credit_database(database: str) -> None:
        with sqlite3.connect(database, factory=store_db.ClosingSQLiteConnection) as db:
            db.execute("CREATE TABLE users(id INTEGER PRIMARY KEY, premium_redeemed_at TEXT, premium_expires_at TEXT)")
            db.execute(
                "CREATE TABLE ai_credit_balances(user_id INTEGER PRIMARY KEY, balance INTEGER DEFAULT 0, used_total INTEGER DEFAULT 0, updated_at TEXT)"
            )
            db.execute(
                "CREATE TABLE stripe_credit_fulfillments(event_key TEXT PRIMARY KEY, session_id TEXT UNIQUE, user_id INTEGER, credits INTEGER, amount_total INTEGER, currency TEXT, created_at TEXT)"
            )
            db.execute("INSERT INTO users(id) VALUES(1)")
            db.commit()

    def test_paid_pack_is_fulfilled_exactly_once_per_checkout_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "credits.db")
            self._create_credit_database(database)

            with (
                patch.object(entitlements, "connect", side_effect=lambda: sqlite3.connect(database, factory=store_db.ClosingSQLiteConnection)),
                patch.object(entitlements, "FREE_STARTING_TOKENS", 0),
            ):
                first, first_granted = entitlements.fulfill_stripe_ai_credits(
                    1, 25, event_key="evt_1", session_id="cs_test_1", amount_total=299, currency="usd"
                )
                second, second_granted = entitlements.fulfill_stripe_ai_credits(
                    1, 25, event_key="return:cs_test_1", session_id="cs_test_1", amount_total=299, currency="usd"
                )

            self.assertTrue(first_granted)
            self.assertFalse(second_granted)
            self.assertEqual(first["aiUsage"]["tokens"], 25)
            self.assertEqual(second["aiUsage"]["tokens"], 25)

    def test_token_balance_is_unchanged_by_calendar_month_rollover(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "credits.db")
            self._create_credit_database(database)

            class Clock(datetime):
                current = datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc)

                @classmethod
                def now(cls, tz=None):
                    return cls.current

            with (
                patch.object(entitlements, "connect", side_effect=lambda: sqlite3.connect(database, factory=store_db.ClosingSQLiteConnection)),
                patch.object(entitlements, "datetime", Clock),
                patch.object(entitlements, "FREE_STARTING_TOKENS", 1),
            ):
                status, granted = entitlements.fulfill_stripe_ai_credits(
                    1, 2, event_key="evt_rollover", session_id="cs_rollover", amount_total=299, currency="usd"
                )
                self.assertTrue(granted)
                self.assertEqual(status["aiUsage"]["tokens"], 3)  # one-time starter + refill
                self.assertTrue(entitlements.consume_ai_credit(1)["allowed"])
                self.assertTrue(entitlements.consume_ai_credit(1)["allowed"])
                self.assertEqual(entitlements.entitlement_status(1)["aiUsage"]["tokens"], 1)

                Clock.current = datetime(2026, 8, 1, 0, 1, tzinfo=timezone.utc)
                next_month = entitlements.entitlement_status(1)["aiUsage"]

            self.assertEqual(next_month["used"], 2)
            self.assertEqual(next_month["tokens"], 1)
            self.assertEqual(next_month["remaining"], 1)

    def test_trial_tokens_are_a_one_time_persistent_grant(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "credits.db")
            self._create_credit_database(database)
            with (
                patch.object(entitlements, "connect", side_effect=lambda: sqlite3.connect(database, factory=store_db.ClosingSQLiteConnection)),
                patch.object(entitlements, "FREE_STARTING_TOKENS", 1),
                patch.object(entitlements, "PRO_TRIAL_TOKENS", 100),
            ):
                first = entitlements.redeem_pro_trial(1)
                second = entitlements.redeem_pro_trial(1)

            self.assertEqual(first["aiUsage"]["tokens"], 101)
            self.assertEqual(second["aiUsage"]["tokens"], 101)

    def test_legacy_monthly_bonus_migrates_once_to_persistent_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "migration.db"
            with patch.object(store_db, "DB_PATH", database), patch.object(store_db, "DATABASE_URL", None):
                store_db.migrate()
                with store_db.connect() as db:
                    db.execute(
                        "INSERT INTO users(id, google_sub, email, name, created_at, updated_at) VALUES(1, 'sub', 'a@example.com', 'A', 'now', 'now')"
                    )
                    db.execute("CREATE TABLE ai_usage_monthly(user_id INTEGER, period TEXT, used INTEGER DEFAULT 0, bonus INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(user_id, period))")
                    db.execute("INSERT INTO ai_usage_monthly(user_id, period, used, bonus, updated_at) VALUES(1, '2026-07', 0, 25, 'now')")
                    db.commit()

                store_db.migrate()
                store_db.migrate()
                with store_db.connect() as db:
                    balance = db.execute("SELECT balance FROM ai_credit_balances WHERE user_id = 1").fetchone()[0]
                    legacy_table = db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_usage_monthly'").fetchone()

            self.assertEqual(balance, 25)
            self.assertIsNone(legacy_table)

    def test_checkout_fulfillment_requires_paid_payment_for_the_same_user(self) -> None:
        session = {
            "id": "cs_test_valid",
            "mode": "payment",
            "client_reference_id": "7",
            "payment_status": "paid",
            "amount_total": 299,
            "currency": "usd",
            "metadata": {"user_id": "7", "credits": "25"},
        }
        with patch.object(auth, "fulfill_stripe_ai_credits") as fulfill:
            auth._fulfill_checkout_session(session, event_key="evt_valid", expected_user_id=7)

        fulfill.assert_called_once_with(
            7,
            25,
            event_key="evt_valid",
            session_id="cs_test_valid",
            amount_total=299,
            currency="usd",
        )

    def test_checkout_fulfillment_rejects_a_mismatched_client_reference(self) -> None:
        session = {
            "id": "cs_test_wrong_user",
            "mode": "payment",
            "client_reference_id": "8",
            "payment_status": "paid",
            "amount_total": 299,
            "currency": "usd",
            "metadata": {"user_id": "7", "credits": "25"},
        }
        with self.assertRaises(HTTPException) as raised:
            auth._fulfill_checkout_session(session, event_key="evt_wrong_user", expected_user_id=7)
        self.assertEqual(raised.exception.status_code, 400)

    def test_dashboard_price_id_is_used_when_configured(self) -> None:
        with patch.dict("os.environ", {"STRIPE_PRICE_25": "price_test_25"}):
            line_item = auth._checkout_line_item(auth.CREDIT_PACKS[25])
        self.assertEqual(line_item, {"price": "price_test_25", "quantity": 1})

    def test_dynamic_price_is_used_without_dashboard_price_id(self) -> None:
        with patch.dict("os.environ", {}, clear=False):
            with patch.dict("os.environ", {"STRIPE_PRICE_25": ""}):
                line_item = auth._checkout_line_item(auth.CREDIT_PACKS[25])
        self.assertEqual(line_item["price_data"]["unit_amount"], 299)
        self.assertEqual(line_item["price_data"]["currency"], "usd")

    def test_checkout_returns_to_the_page_that_started_the_purchase(self) -> None:
        url = auth._checkout_return_url(
            "http://localhost:4200",
            "/scanner?kind=stable#results",
            status="success",
            session_id="{CHECKOUT_SESSION_ID}",
        )
        self.assertEqual(
            url,
            "http://localhost:4200/scanner?kind=stable&credit_purchase=success&session_id={CHECKOUT_SESSION_ID}#results",
        )

    def test_checkout_rejects_an_external_return_url(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            auth._checkout_return_url("http://localhost:4200", "//attacker.example/receipt", status="success")
        self.assertEqual(raised.exception.status_code, 400)

    def test_checkout_requires_current_legal_acceptance(self) -> None:
        request = Mock(cookies={auth.SESSION_COOKIE: "session"})
        user = {"id": 7, "email": "wolf@example.com", "legalAccepted": False}
        with patch.object(auth, "user_for_session", return_value=user), patch.object(auth, "record_current_legal_acceptance") as accept:
            with self.assertRaises(HTTPException) as raised:
                auth.create_credit_checkout(auth.CreditCheckout(credits=25), request)
        self.assertEqual(raised.exception.status_code, 409)
        accept.assert_not_called()

    def test_checkout_can_accept_current_legal_versions_in_the_same_request(self) -> None:
        request = Mock(cookies={auth.SESSION_COOKIE: "session"})
        user = {"id": 7, "email": "wolf@example.com", "legalAccepted": False}
        with (
            patch.object(auth, "user_for_session", return_value=user),
            patch.object(auth, "record_current_legal_acceptance") as accept,
            patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}),
        ):
            with self.assertRaises(HTTPException) as raised:
                auth.create_credit_checkout(auth.CreditCheckout(credits=25, acceptCurrentLegal=True), request)
        self.assertEqual(raised.exception.status_code, 503)
        accept.assert_called_once_with(7, source="credit_checkout")


if __name__ == "__main__":
    unittest.main()
