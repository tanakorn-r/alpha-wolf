from __future__ import annotations

import threading
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe

_CACHE_LOCK = threading.Lock()
_CACHE: dict[tuple[str, str], tuple[float, Any]] = {}
_COMPUTE_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_LAST_ATTEMPT_LOCK = threading.Lock()
_LAST_ATTEMPT: dict[tuple[str, str], float] = {}
_PERSISTED_NAMESPACES = {"analysis", "buy_timing"}


def cache_get(namespace: str, key: str) -> Any | None:
    cache_key = (namespace, key)
    now = datetime.now(timezone.utc).timestamp()
    with _CACHE_LOCK:
        item = _CACHE.get(cache_key)
        if item:
            expires_at, value = item
            if expires_at > now:
                return value
            _CACHE.pop(cache_key, None)
    if namespace not in _PERSISTED_NAMESPACES:
        return None
    try:
        with connect() as db:
            row = db.execute("SELECT payload, expires_at FROM ai_response_cache WHERE namespace = ? AND cache_key = ?", (namespace, key)).fetchone()
            if not row:
                return None
            payload = row["payload"] if hasattr(row, "keys") else row[0]
            expires_at = float(row["expires_at"] if hasattr(row, "keys") else row[1])
            # Persisted AI responses are durable last-known results. Their versioned cache keys
            # invalidate old reasoning, and an explicit force=true request regenerates them. Do not
            # delete a valid report merely because its freshness window passed: page reloads must
            # restore the database result first instead of showing a blank card or spending another
            # OpenAI call automatically.
        # AI reports remain useful as durable last-known results. Derived market snapshots are
        # persisted only so another Cloud Run instance can reuse them during their freshness TTL.
        if namespace != "analysis" and expires_at <= now:
            return None
        value = json.loads(str(payload))
        with _CACHE_LOCK:
            memory_expires_at = max(expires_at, now + 60) if namespace == "analysis" else expires_at
            _CACHE[cache_key] = (memory_expires_at, value)
        return value
    except Exception as exc:
        print(f"Warning: persistent cache read failed for {namespace}: {exc}")
        return None


def cache_set(namespace: str, key: str, value: Any, ttl_seconds: int) -> None:
    expires_at = datetime.now(timezone.utc).timestamp() + max(ttl_seconds, 1)
    with _CACHE_LOCK:
        _CACHE[(namespace, key)] = (expires_at, value)
    if namespace in _PERSISTED_NAMESPACES:
        try:
            updated_at = datetime.now(timezone.utc).isoformat()
            payload = json.dumps(json_safe(value), ensure_ascii=False, separators=(",", ":"))
            with connect() as db:
                db.execute(
                    """INSERT INTO ai_response_cache(namespace, cache_key, payload, expires_at, updated_at)
                       VALUES(?, ?, ?, ?, ?)
                       ON CONFLICT(namespace, cache_key) DO UPDATE SET payload=excluded.payload,
                         expires_at=excluded.expires_at, updated_at=excluded.updated_at""",
                    (namespace, key, payload, expires_at, updated_at),
                )
                db.commit()
        except Exception as exc:
            print(f"Warning: persistent cache write failed for {namespace}: {exc}")


@contextmanager
def cache_compute_lock(namespace: str, key: str):
    """Let only one request populate a cold cache key at a time.

    Concurrent browser panels often ask for the same stock before the first Yahoo response has
    returned. Without a per-key lock every request repeats the full upstream workload.
    """
    cache_key = (namespace, key)
    with _CACHE_LOCK:
        lock = _COMPUTE_LOCKS.setdefault(cache_key, threading.Lock())
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


def try_acquire_compute_lock(namespace: str, key: str) -> threading.Lock | None:
    """Non-blocking sibling of `cache_compute_lock`, for background refresh scheduling:
    if a refresh for this key is already running, skip instead of waiting. Returns the
    acquired lock (caller must release it) or None if it's already held.
    """
    cache_key = (namespace, key)
    with _CACHE_LOCK:
        lock = _COMPUTE_LOCKS.setdefault(cache_key, threading.Lock())
    return lock if lock.acquire(blocking=False) else None


def should_attempt_refresh(namespace: str, key: str, min_interval_seconds: float) -> bool:
    """Rate-limits refresh ATTEMPTS, not just successes. `try_acquire_compute_lock` alone
    only stops concurrent duplicate work — if an upstream call keeps failing or timing out,
    every new request would still trigger a fresh attempt seconds later. This tracks the
    last attempted time per key (regardless of outcome) so repeated requests for a
    failing/throttled symbol can't hammer yfinance more than once per `min_interval_seconds`.
    """
    cache_key = (namespace, key)
    now = datetime.now(timezone.utc).timestamp()
    with _LAST_ATTEMPT_LOCK:
        last = _LAST_ATTEMPT.get(cache_key)
        if last is not None and now - last < min_interval_seconds:
            return False
        _LAST_ATTEMPT[cache_key] = now
        return True
