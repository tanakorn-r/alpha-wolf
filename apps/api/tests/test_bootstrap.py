from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Request

from routes import bootstrap


def _request(session: str | None = None) -> Request:
    headers = [(b"cookie", f"aw_session={session}".encode())] if session else []
    return Request({"type": "http", "method": "GET", "path": "/api/bootstrap", "headers": headers})


class BootstrapTests(unittest.TestCase):
    def test_signed_in_bootstrap_aggregates_shell_state(self) -> None:
        user = {"id": 42, "email": "wolf@example.com", "settings": {"baseCurrency": "THB"}}
        items = [{"id": 1, "readAt": None}, {"id": 2, "readAt": "2026-07-15T00:00:00Z"}]
        with (
            patch.object(bootstrap, "user_for_session", return_value=user) as restore,
            patch.object(bootstrap, "list_notifications", return_value=items) as notifications,
            patch.object(bootstrap, "list_watchlist", return_value=["SIRI.BK"]) as watchlist,
            patch.object(bootstrap, "public_agents", return_value=[{"id": "ben"}]),
            patch.object(bootstrap, "premium_promo_active", return_value=True),
        ):
            result = bootstrap.app_bootstrap(_request("session-token"))

        restore.assert_called_once_with("session-token")
        notifications.assert_called_once_with(42, 30)
        watchlist.assert_called_once_with(42)
        self.assertEqual(result["user"], user)
        self.assertEqual(result["notifications"], {"items": items, "unread": 1})
        self.assertEqual(result["watchlist"], ["SIRI.BK"])
        self.assertEqual(result["agents"], [{"id": "ben"}])

    def test_anonymous_bootstrap_skips_account_reads(self) -> None:
        with (
            patch.object(bootstrap, "user_for_session", return_value=None),
            patch.object(bootstrap, "list_notifications") as notifications,
            patch.object(bootstrap, "list_watchlist") as watchlist,
            patch.object(bootstrap, "public_agents", return_value=[]),
        ):
            result = bootstrap.app_bootstrap(_request())

        notifications.assert_not_called()
        watchlist.assert_not_called()
        self.assertIsNone(result["user"])
        self.assertEqual(result["notifications"], {"items": [], "unread": 0})
        self.assertEqual(result["watchlist"], [])


if __name__ == "__main__":
    unittest.main()
