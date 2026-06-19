from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

_CACHE_LOCK = threading.Lock()
_CACHE: dict[tuple[str, str], tuple[float, Any]] = {}


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
