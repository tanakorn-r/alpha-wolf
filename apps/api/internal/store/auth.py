from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect


def upsert_google_user(*, google_sub: str, email: str, name: str, picture_url: str | None) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """
            INSERT INTO users(google_sub, email, name, picture_url, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(google_sub) DO UPDATE SET
                email=excluded.email,
                name=excluded.name,
                picture_url=excluded.picture_url,
                updated_at=excluded.updated_at
            """,
            (google_sub, email, name, picture_url, now, now),
        )
        row = db.execute(
            "SELECT id, google_sub, email, name, picture_url, created_at, premium_redeemed_at FROM users WHERE google_sub = ?",
            (google_sub,),
        ).fetchone()
        db.commit()
    return _user(row)


def create_session(user_id: int, *, ttl_days: int = 30) -> tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=max(1, ttl_days))
    with connect() as db:
        db.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now.isoformat(),))
        db.execute(
            "INSERT INTO auth_sessions(token_hash, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)",
            (token_hash, user_id, now.isoformat(), expires_at.isoformat()),
        )
        db.commit()
    return raw_token, expires_at


def user_for_session(raw_token: str | None) -> dict[str, Any] | None:
    if not raw_token:
        return None
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        row = db.execute(
            """
            SELECT u.id, u.google_sub, u.email, u.name, u.picture_url, u.created_at, u.premium_redeemed_at
            FROM auth_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (_hash_token(raw_token), now),
        ).fetchone()
    return _user(row) if row else None


def delete_session(raw_token: str | None) -> None:
    if not raw_token:
        return
    with connect() as db:
        db.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (_hash_token(raw_token),))
        db.commit()


def redeem_premium(user_id: int) -> dict[str, Any] | None:
    """Record that this account explicitly redeemed the free-Pro promo. Idempotent — redeeming
    twice keeps the original redemption timestamp instead of resetting it."""
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            "UPDATE users SET premium_redeemed_at = COALESCE(premium_redeemed_at, ?) WHERE id = ?",
            (now, user_id),
        )
        row = db.execute(
            "SELECT id, google_sub, email, name, picture_url, created_at, premium_redeemed_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        db.commit()
    return _user(row) if row else None


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _user(row: Any) -> dict[str, Any]:
    return {
        "id": int(row[0]),
        "googleSub": str(row[1]),
        "email": str(row[2]),
        "name": str(row[3]),
        "pictureUrl": str(row[4]) if row[4] else None,
        "createdAt": str(row[5]),
        "premiumRedeemedAt": str(row[6]) if row[6] else None,
    }
