from __future__ import annotations

import sys
import tempfile
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException, Request, Response

from internal.store import db as store_db
from routes import auth


class GoogleAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "auth.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.env_patch = patch.dict(
            "os.environ",
            {"GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com", "AUTH_COOKIE_SECURE": "false"},
            clear=False,
        )
        self.db_patch.start()
        self.url_patch.start()
        self.env_patch.start()
        store_db.migrate()
    def tearDown(self) -> None:
        self.env_patch.stop()
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_google_login_restores_and_deletes_session(self) -> None:
        bootstrap_response = Response()
        bootstrap = auth.google_bootstrap(_request(), bootstrap_response)
        nonce = bootstrap["nonce"]
        claims = {
            "sub": "google-user-123",
            "email": "wolf@example.com",
            "email_verified": True,
            "name": "Alpha Wolf",
            "picture": "https://example.com/avatar.png",
            "nonce": nonce,
        }

        with patch("routes.auth._verify_google_token", return_value=claims):
            login_response = Response()
            login = auth.google_login(
                auth.GoogleCredential(credential="x" * 40, nonce=str(nonce), acceptTerms=True, acceptPrivacy=True),
                _request(),
                login_response,
            )

        self.assertEqual(login["user"]["googleSub"], "google-user-123")
        self.assertTrue(login["user"]["legalAccepted"])
        set_cookie_headers = [value.decode() for key, value in login_response.raw_headers if key == b"set-cookie"]
        self.assertTrue(any("HttpOnly" in value for value in set_cookie_headers))
        session = _cookie_value(set_cookie_headers, auth.SESSION_COOKIE)
        self.assertEqual(auth.auth_me(_request({auth.SESSION_COOKIE: session}))["user"]["email"], "wolf@example.com")

        self.assertTrue(auth.logout(_request({auth.SESSION_COOKIE: session}), Response())["ok"])
        self.assertIsNone(auth.auth_me(_request({auth.SESSION_COOKIE: session}))["user"])

    def test_google_login_rejects_nonce_mismatch(self) -> None:
        claims = {"sub": "123", "email": "wolf@example.com", "email_verified": True, "nonce": "wrong"}

        with patch("routes.auth._verify_google_token", return_value=claims):
            with self.assertRaises(HTTPException) as raised:
                auth.google_login(
                    auth.GoogleCredential(credential="x" * 40, nonce="expected" * 4, acceptTerms=True, acceptPrivacy=True),
                    _request(),
                    Response(),
                )

        self.assertEqual(raised.exception.status_code, 401)

    def test_google_login_requires_terms_and_privacy_acceptance(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            auth.google_login(
                auth.GoogleCredential(credential="x" * 40, nonce="expected" * 4),
                _request(),
                Response(),
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_cloud_run_forwarded_https_uses_cross_site_secure_cookie(self) -> None:
        request = _request(headers={"x-forwarded-proto": "https"})

        with patch.dict("os.environ", {"AUTH_COOKIE_SECURE": "", "AUTH_COOKIE_SAMESITE": ""}):
            self.assertTrue(auth._secure_cookie(request))
            self.assertEqual(auth._cookie_samesite(request), "none")


def _request(cookies: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> Request:
    cookie_header = "; ".join(f"{key}={value}" for key, value in (cookies or {}).items())
    request_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    if cookie_header:
        request_headers.append((b"cookie", cookie_header.encode()))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": request_headers, "scheme": "http", "server": ("testserver", 80)})


def _cookie_value(headers: list[str], name: str) -> str:
    for header in headers:
        parsed = SimpleCookie()
        parsed.load(header)
        if name in parsed:
            return parsed[name].value
    raise AssertionError(f"Cookie {name} not found")


if __name__ == "__main__":
    unittest.main()
