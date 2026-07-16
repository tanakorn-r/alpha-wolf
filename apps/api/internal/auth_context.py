from __future__ import annotations

from fastapi import HTTPException, Request

from internal.store.auth import user_for_session

SESSION_COOKIE = "aw_session"
HOST_SESSION_COOKIE = "__Host-aw_session"
GUEST_USER_ID = 0


def session_token_from_request(request: Request) -> str | None:
    """Prefer the hardened HTTPS cookie while accepting pre-migration sessions."""
    return request.cookies.get(HOST_SESSION_COOKIE) or request.cookies.get(SESSION_COOKIE)


def user_id_from_request(request: Request) -> int:
    user = user_for_session(session_token_from_request(request))
    return int(user["id"]) if user else GUEST_USER_ID


def require_user_id(request: Request, *, detail: str = "Sign in to access your account data") -> int:
    """Return the authenticated account id; personal data must never use the guest scope."""
    user_id = user_id_from_request(request)
    if user_id <= GUEST_USER_ID:
        raise HTTPException(status_code=401, detail=detail)
    return user_id


def account_cache_scope(user_id: int) -> str:
    return f"user:{user_id}" if user_id else "guest"
