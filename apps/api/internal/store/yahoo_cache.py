from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe


@dataclass(frozen=True)
class YahooCacheEntry:
    payload: Any
    fetched_at: datetime
    expires_at: datetime

    @property
    def is_fresh(self) -> bool:
        return self.expires_at > datetime.now(timezone.utc)


def yahoo_cache_key(symbol: str, data_type: str, period: str = "") -> str:
    return f"{symbol.upper().strip()}:{data_type.strip().lower()}:{period.strip().lower()}"


def load_yahoo_data(symbol: str, data_type: str, period: str = "") -> YahooCacheEntry | None:
    key = yahoo_cache_key(symbol, data_type, period)
    try:
        with connect() as db:
            row = db.execute(
                "SELECT payload, fetched_at, expires_at FROM yahoo_data_cache WHERE cache_key = ?",
                (key,),
            ).fetchone()
    except Exception:
        # Startup migration may not have run in isolated scripts/tests yet. Yahoo access should
        # still work rather than turning a cache-table problem into an API outage.
        return None
    if not row:
        return None
    try:
        return YahooCacheEntry(
            payload=json.loads(str(row[0]) or "null"),
            fetched_at=_parse_datetime(str(row[1])),
            expires_at=_parse_datetime(str(row[2])),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def save_yahoo_data(
    symbol: str,
    data_type: str,
    payload: Any,
    *,
    period: str = "",
    ttl_seconds: int,
) -> None:
    key = yahoo_cache_key(symbol, data_type, period)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=max(1, ttl_seconds))
    encoded = json.dumps(json_safe(payload), ensure_ascii=False, separators=(",", ":"))
    try:
        with connect() as db:
            db.execute(
                """
                INSERT INTO yahoo_data_cache(cache_key, symbol, data_type, period, payload, fetched_at, expires_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    payload=excluded.payload,
                    fetched_at=excluded.fetched_at,
                    expires_at=excluded.expires_at
                """,
                (
                    key,
                    symbol.upper().strip(),
                    data_type.strip().lower(),
                    period.strip().lower(),
                    encoded,
                    now.isoformat(),
                    expires_at.isoformat(),
                ),
            )
            db.commit()
    except Exception as exc:
        print(f"Warning: persistent Yahoo cache write failed for {key}: {exc}")


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
