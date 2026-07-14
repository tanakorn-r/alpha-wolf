from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.store import entitlements
from routes import auth


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


if __name__ == "__main__":
    unittest.main()
