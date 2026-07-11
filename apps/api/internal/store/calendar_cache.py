from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe


def _cache_key(month: str, region: str) -> str:
    return f"{month}:{region}"


def load_market_calendar_events(month: str, region: str) -> list[dict[str, Any]] | None:
    """Shared, non-personalized dividend events for a month/region. Every user sees the
    same market data, so this is looked up once per month/region regardless of who asks."""
    key = _cache_key(month, region)
    try:
        with connect() as db:
            row = db.execute(
                "SELECT payload, expires_at FROM market_calendar_cache WHERE cache_key = ?",
                (key,),
            ).fetchone()
    except Exception:
        return None
    if not row:
        return None
    try:
        expires_at = datetime.fromisoformat(str(row[1]))
    except (TypeError, ValueError):
        return None
    if expires_at <= datetime.now(timezone.utc):
        return None
    try:
        return json.loads(str(row[0]) or "[]")
    except json.JSONDecodeError:
        return None


def save_market_calendar_events(month: str, region: str, events: list[Any], ttl_seconds: int) -> None:
    key = _cache_key(month, region)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=max(1, ttl_seconds))
    encoded = json.dumps(json_safe(events), ensure_ascii=False, separators=(",", ":"))
    try:
        with connect() as db:
            db.execute(
                """
                INSERT INTO market_calendar_cache(cache_key, payload, fetched_at, expires_at)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    payload=excluded.payload,
                    fetched_at=excluded.fetched_at,
                    expires_at=excluded.expires_at
                """,
                (key, encoded, now.isoformat(), expires_at.isoformat()),
            )
            db.commit()
    except Exception as exc:
        print(f"Warning: persistent calendar cache write failed for {key}: {exc}")
