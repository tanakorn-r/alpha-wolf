from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Request

import main
from internal.auth_context import HOST_SESSION_COOKIE


def _request(
    method: str,
    *,
    origin: str | None = None,
    referer: str | None = None,
    authenticated: bool = True,
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if authenticated:
        headers.append((b"cookie", f"{HOST_SESSION_COOKIE}=session".encode()))
    if origin:
        headers.append((b"origin", origin.encode()))
    if referer:
        headers.append((b"referer", referer.encode()))
    return Request({
        "type": "http",
        "method": method,
        "path": "/api/portfolio",
        "headers": headers,
        "scheme": "https",
        "server": ("api.example", 443),
    })


class SessionSecurityTests(unittest.TestCase):
    def test_authenticated_mutation_accepts_trusted_origin(self) -> None:
        with patch.object(main, "trusted_session_origins", {"https://app.example"}):
            rejection = main._session_origin_rejection(
                _request("POST", origin="https://app.example"),
            )
        self.assertIsNone(rejection)

    def test_authenticated_mutation_rejects_cross_site_origin(self) -> None:
        with patch.object(main, "trusted_session_origins", {"https://app.example"}):
            rejection = main._session_origin_rejection(
                _request("DELETE", origin="https://evil.example"),
            )
        self.assertEqual(rejection, "Authenticated mutation origin is not allowed")

    def test_authenticated_mutation_rejects_missing_origin_and_referer(self) -> None:
        self.assertEqual(
            main._session_origin_rejection(_request("PATCH")),
            "Authenticated mutations require an Origin or Referer header",
        )

    def test_authenticated_mutation_accepts_trusted_referer_origin(self) -> None:
        with patch.object(main, "trusted_session_origins", {"https://app.example"}):
            rejection = main._session_origin_rejection(
                _request("PUT", referer="https://app.example/settings?tab=locale"),
            )
        self.assertIsNone(rejection)

    def test_safe_or_unauthenticated_request_does_not_require_origin(self) -> None:
        self.assertIsNone(main._session_origin_rejection(_request("GET")))
        self.assertIsNone(main._session_origin_rejection(_request("POST", authenticated=False)))


if __name__ == "__main__":
    unittest.main()
