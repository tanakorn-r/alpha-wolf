from __future__ import annotations

from fastapi import Request

from internal.store.auth import user_for_session

SESSION_COOKIE = "aw_session"
GUEST_USER_ID = 0


def user_id_from_request(request: Request) -> int:
    user = user_for_session(request.cookies.get(SESSION_COOKIE))
    return int(user["id"]) if user else GUEST_USER_ID


def account_cache_scope(user_id: int) -> str:
    return f"user:{user_id}" if user_id else "guest"
