from __future__ import annotations

import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

_CACHE_LOCK = threading.Lock()
_CACHE: dict[tuple[str, str], tuple[float, Any]] = {}
_COMPUTE_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_LAST_ATTEMPT_LOCK = threading.Lock()
_LAST_ATTEMPT: dict[tuple[str, str], float] = {}


def cache_get(namespace: str, key: str) -> Any | None:
    cache_key = (namespace, key)
    now = datetime.now(timezone.utc).timestamp()
    with _CACHE_LOCK:
        item = _CACHE.get(cache_key)
        if not item:
            return None
        expires_at, value = item
        if expires_at <= now:
            _CACHE.pop(cache_key, None)
            return None
        return value


def cache_set(namespace: str, key: str, value: Any, ttl_seconds: int) -> None:
    expires_at = datetime.now(timezone.utc).timestamp() + max(ttl_seconds, 1)
    with _CACHE_LOCK:
        _CACHE[(namespace, key)] = (expires_at, value)


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
