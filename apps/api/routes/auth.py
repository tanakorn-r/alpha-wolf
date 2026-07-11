from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from internal.store.auth import create_session, delete_session, redeem_premium, upsert_google_user, user_for_session

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "aw_session"
NONCE_COOKIE = "aw_google_nonce"
SESSION_TTL_DAYS = 30


class GoogleCredential(BaseModel):
    credential: str = Field(min_length=20)


@router.get("/me")
def auth_me(request: Request) -> dict[str, Any]:
    return {
        "user": user_for_session(request.cookies.get(SESSION_COOKIE)),
        "premiumPromoActive": premium_promo_active(),
    }


@router.post("/redeem-premium")
def redeem_premium_route(request: Request) -> dict[str, Any]:
    if not premium_promo_active():
        raise HTTPException(status_code=409, detail="The free Pro promo is no longer available")
    user = user_for_session(request.cookies.get(SESSION_COOKIE))
    if not user:
        # Guests have no account row to stamp — the frontend grants premium locally in this case.
        return {"user": None}
    return {"user": redeem_premium(int(user["id"]))}


def premium_promo_active() -> bool:
    # Manual kill switch for the "Pro free for now" promo: defaults on, and stays on for
    # every account (signed-in or guest) until this is set to false and the API restarts —
    # there is no automatic expiry baked into the code.
    return os.getenv("PREMIUM_PROMO_ENABLED", "true").strip().lower() not in {"0", "false", "no"}


@router.get("/google/bootstrap")
def google_bootstrap(request: Request, response: Response) -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        return {"configured": False, "clientId": None, "nonce": None}
    nonce = secrets.token_urlsafe(32)
    response.set_cookie(
        NONCE_COOKIE,
        nonce,
        max_age=600,
        httponly=True,
        secure=_secure_cookie(request),
        samesite=_cookie_samesite(request),
        path="/api/auth",
    )
    return {"configured": True, "clientId": client_id, "nonce": nonce}


@router.post("/google")
def google_login(payload: GoogleCredential, request: Request, response: Response) -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    expected_nonce = request.cookies.get(NONCE_COOKIE)
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    if not expected_nonce:
        raise HTTPException(status_code=400, detail="Google sign-in session expired")

    claims = _verify_google_token(payload.credential, client_id)
    if not secrets.compare_digest(str(claims.get("nonce") or ""), expected_nonce):
        raise HTTPException(status_code=401, detail="Google sign-in nonce is invalid")
    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    google_sub = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip()
    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google identity is incomplete")

    user = upsert_google_user(
        google_sub=google_sub,
        email=email,
        name=str(claims.get("name") or email.split("@", 1)[0]),
        picture_url=str(claims.get("picture") or "").strip() or None,
    )
    raw_session, expires_at = create_session(user["id"], ttl_days=SESSION_TTL_DAYS)
    response.set_cookie(
        SESSION_COOKIE,
        raw_session,
        max_age=SESSION_TTL_DAYS * 86_400,
        expires=expires_at,
        httponly=True,
        secure=_secure_cookie(request),
        samesite=_cookie_samesite(request),
        path="/",
    )
    response.delete_cookie(NONCE_COOKIE, path="/api/auth")
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    delete_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(NONCE_COOKIE, path="/api/auth")
    return {"ok": True}


def _verify_google_token(credential: str, client_id: str) -> dict[str, Any]:
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        return dict(id_token.verify_oauth2_token(credential, google_requests.Request(), client_id))
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Google authentication dependency is unavailable") from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Google credential is invalid") from exc


def _secure_cookie(request: Request) -> bool:
    configured = os.getenv("AUTH_COOKIE_SECURE", "").strip().lower()
    if configured in {"1", "true", "yes"}:
        return True
    if configured in {"0", "false", "no"}:
        return False
    return request.url.scheme == "https"


def _cookie_samesite(request: Request) -> str:
    configured = os.getenv("AUTH_COOKIE_SAMESITE", "").strip().lower()
    if configured in {"lax", "strict", "none"}:
        return configured
    return "none" if _secure_cookie(request) else "lax"
