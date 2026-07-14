from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from internal.store.auth import create_session, delete_session, upsert_google_user, user_for_session
from internal.store.entitlements import fulfill_stripe_ai_credits, redeem_pro_trial

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "aw_session"
NONCE_COOKIE = "aw_google_nonce"
SESSION_TTL_DAYS = 30


class GoogleCredential(BaseModel):
    credential: str = Field(min_length=20)
    nonce: str = Field(min_length=20)


class CreditCheckout(BaseModel):
    credits: int


class CreditCheckoutConfirmation(BaseModel):
    sessionId: str = Field(min_length=10, max_length=255)


CREDIT_PACKS = {
    25: {"amount": 299, "name": "25 AlphaWolf AI runs"},
    75: {"amount": 699, "name": "75 AlphaWolf AI runs"},
    200: {"amount": 1499, "name": "200 AlphaWolf AI runs"},
}


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
        raise HTTPException(status_code=401, detail="Sign in before redeeming Pro")
    redeem_pro_trial(int(user["id"]))
    return {"user": user_for_session(request.cookies.get(SESSION_COOKIE))}


@router.post("/credit-checkout")
def create_credit_checkout(payload: CreditCheckout, request: Request) -> dict[str, Any]:
    user = user_for_session(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before adding AI credits")
    pack = CREDIT_PACKS.get(payload.credits)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown credit pack")
    secret_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not secret_key:
        raise HTTPException(status_code=503, detail="Stripe Checkout is not configured")
    app_url = os.getenv("APP_URL", "http://localhost:4200").strip().rstrip("/")
    stripe = _stripe_client()
    stripe.api_key = secret_key
    session = stripe.checkout.Session.create(
        mode="payment",
        client_reference_id=str(user["id"]),
        customer_email=user.get("email"),
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": pack["amount"],
                "product_data": {"name": pack["name"]},
            },
            "quantity": 1,
        }],
        metadata={"user_id": str(user["id"]), "credits": str(payload.credits)},
        success_url=f"{app_url}/hunt-ai?tab=timing&credit_purchase=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{app_url}/hunt-ai?tab=timing&credit_purchase=cancelled",
    )
    return {"checkoutUrl": session.url}


@router.post("/credit-checkout/confirm")
def confirm_credit_checkout(payload: CreditCheckoutConfirmation, request: Request) -> dict[str, Any]:
    user = user_for_session(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before confirming AI credits")
    stripe = _configured_stripe()
    session = stripe.checkout.Session.retrieve(payload.sessionId)
    _fulfill_checkout_session(session, event_key=f"return:{payload.sessionId}", expected_user_id=int(user["id"]))
    return {"user": user_for_session(request.cookies.get(SESSION_COOKIE))}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> dict[str, bool]:
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook is not configured")
    signature = request.headers.get("stripe-signature", "")
    payload = await request.body()
    stripe = _stripe_client()
    try:
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook") from exc
    if event["type"] in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        _fulfill_checkout_session(event["data"]["object"], event_key=str(event["id"]))
    return {"received": True}


def _configured_stripe():
    secret_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not secret_key:
        raise HTTPException(status_code=503, detail="Stripe Checkout is not configured")
    stripe = _stripe_client()
    stripe.api_key = secret_key
    return stripe


def _stripe_client():
    try:
        import stripe
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Stripe SDK is unavailable") from exc
    return stripe


def _fulfill_checkout_session(session: Any, *, event_key: str, expected_user_id: int | None = None) -> None:
    metadata = dict(session.get("metadata") or {})
    try:
        user_id = int(metadata.get("user_id") or 0)
        credits = int(metadata.get("credits") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Stripe Session metadata is invalid") from exc
    pack = CREDIT_PACKS.get(credits)
    amount_total = int(session.get("amount_total") or 0)
    currency = str(session.get("currency") or "").lower()
    if expected_user_id is not None and user_id != expected_user_id:
        raise HTTPException(status_code=403, detail="Stripe Session belongs to another account")
    if session.get("payment_status") != "paid":
        raise HTTPException(status_code=409, detail="Stripe payment is not complete")
    if not pack or amount_total != pack["amount"] or currency != "usd":
        raise HTTPException(status_code=400, detail="Stripe credit pack does not match payment")
    fulfill_stripe_ai_credits(
        user_id,
        credits,
        event_key=event_key,
        session_id=str(session.get("id") or ""),
        amount_total=amount_total,
        currency=currency,
    )


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
    return {"configured": True, "clientId": client_id, "nonce": nonce}


@router.post("/google")
def google_login(payload: GoogleCredential, request: Request, response: Response) -> dict[str, Any]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    claims = _verify_google_token(payload.credential, client_id)
    if not secrets.compare_digest(str(claims.get("nonce") or ""), payload.nonce):
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
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def _cookie_samesite(request: Request) -> str:
    configured = os.getenv("AUTH_COOKIE_SAMESITE", "").strip().lower()
    if configured in {"lax", "strict", "none"}:
        return configured
    return "none" if _secure_cookie(request) else "lax"
