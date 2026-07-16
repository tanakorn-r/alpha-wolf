from __future__ import annotations

import os
import secrets
import json
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from internal.auth_context import HOST_SESSION_COOKIE, SESSION_COOKIE, session_token_from_request
from internal.store.auth import account_exists, create_session, delete_session, upsert_google_user, user_for_session
from internal.store.entitlements import fulfill_stripe_ai_credits, redeem_pro_trial
from internal.store.account_lifecycle import delete_account_data, export_account_data, legal_acceptance_status, record_current_legal_acceptance

router = APIRouter(prefix="/api/auth", tags=["auth"])

NONCE_COOKIE = "aw_google_nonce"
SESSION_TTL_DAYS = 30


class GoogleCredential(BaseModel):
    credential: str = Field(min_length=20)
    nonce: str = Field(min_length=20)
    acceptTerms: bool = False
    acceptPrivacy: bool = False


class CreditCheckout(BaseModel):
    credits: int
    returnPath: str = Field(default="/hunt-ai", min_length=1, max_length=2048)
    acceptCurrentLegal: bool = False


class CreditCheckoutConfirmation(BaseModel):
    sessionId: str = Field(min_length=10, max_length=255)


class AccountDeletion(BaseModel):
    confirmation: str
    acknowledgeCreditForfeiture: bool = False


CREDIT_PACKS = {
    25: {"amount": 299, "name": "25 AlphaWolf AI runs", "price_env": "STRIPE_PRICE_25"},
    75: {"amount": 699, "name": "75 AlphaWolf AI runs", "price_env": "STRIPE_PRICE_75"},
    200: {"amount": 1499, "name": "200 AlphaWolf AI runs", "price_env": "STRIPE_PRICE_200"},
}


@router.get("/me")
def auth_me(request: Request) -> dict[str, Any]:
    return {
        "user": user_for_session(session_token_from_request(request)),
        "premiumPromoActive": premium_promo_active(),
    }


@router.post("/redeem-premium")
def redeem_premium_route(request: Request) -> dict[str, Any]:
    if not premium_promo_active():
        raise HTTPException(status_code=409, detail="The free Pro promo is no longer available")
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before redeeming Pro")
    redeem_pro_trial(int(user["id"]))
    return {"user": user_for_session(session_token_from_request(request))}


@router.post("/credit-checkout")
def create_credit_checkout(payload: CreditCheckout, request: Request) -> dict[str, Any]:
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before adding AI credits")
    if not user.get("legalAccepted"):
        if not payload.acceptCurrentLegal:
            raise HTTPException(status_code=409, detail="Accept the current Terms and Privacy Policy before purchasing AI tokens")
        record_current_legal_acceptance(int(user["id"]), source="credit_checkout")
        user = {**user, "legalAccepted": True}
    pack = CREDIT_PACKS.get(payload.credits)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown credit pack")
    secret_key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not secret_key:
        raise HTTPException(status_code=503, detail="Stripe Checkout is not configured")
    app_url = os.getenv("APP_URL", "http://localhost:4200").strip().rstrip("/")
    success_url = _checkout_return_url(app_url, payload.returnPath, status="success", session_id="{CHECKOUT_SESSION_ID}")
    cancel_url = _checkout_return_url(app_url, payload.returnPath, status="cancelled")
    stripe = _stripe_client()
    stripe.api_key = secret_key
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            client_reference_id=str(user["id"]),
            customer_email=user.get("email"),
            line_items=[_checkout_line_item(pack)],
            metadata={"user_id": str(user["id"]), "credits": str(payload.credits)},
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except stripe.StripeError as exc:
        raise HTTPException(status_code=502, detail="Stripe Checkout is temporarily unavailable") from exc
    if not session.url:
        raise HTTPException(status_code=502, detail="Stripe Checkout did not return a payment URL")
    return {"checkoutUrl": session.url}


@router.post("/credit-checkout/confirm")
def confirm_credit_checkout(payload: CreditCheckoutConfirmation, request: Request) -> dict[str, Any]:
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before confirming AI credits")
    stripe = _configured_stripe()
    try:
        session = stripe.checkout.Session.retrieve(payload.sessionId)
    except stripe.StripeError as exc:
        raise HTTPException(status_code=502, detail="Stripe could not verify this Checkout Session") from exc
    purchased_credits = _fulfill_checkout_session(session, event_key=f"return:{payload.sessionId}", expected_user_id=int(user["id"]))
    return {
        "user": user_for_session(session_token_from_request(request)),
        "purchasedCredits": purchased_credits,
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> dict[str, bool]:
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not webhook_secret.startswith("whsec_"):
        raise HTTPException(status_code=503, detail="Stripe webhook is not configured")
    signature = request.headers.get("stripe-signature", "")
    payload = await request.body()
    stripe = _stripe_client()
    try:
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
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


def _checkout_line_item(pack: dict[str, Any]) -> dict[str, Any]:
    price_id = os.getenv(str(pack["price_env"]), "").strip()
    if price_id:
        if not price_id.startswith("price_"):
            raise HTTPException(status_code=503, detail=f"{pack['price_env']} is not a Stripe Price ID")
        return {"price": price_id, "quantity": 1}
    return {
        "price_data": {
            "currency": "usd",
            "unit_amount": pack["amount"],
            "product_data": {"name": pack["name"]},
        },
        "quantity": 1,
    }


def _checkout_return_url(app_url: str, return_path: str, *, status: str, session_id: str | None = None) -> str:
    parsed = urlsplit(return_path)
    if (
        not return_path.startswith("/")
        or return_path.startswith("//")
        or "\\" in return_path
        or parsed.scheme
        or parsed.netloc
    ):
        raise HTTPException(status_code=400, detail="Checkout return path is invalid")
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key not in {"credit_purchase", "session_id"}]
    query.append(("credit_purchase", status))
    if session_id:
        query.append(("session_id", session_id))
    relative_url = urlunsplit(("", "", parsed.path or "/", urlencode(query, safe="{}"), parsed.fragment))
    return f"{app_url}{relative_url}"


def _fulfill_checkout_session(session: Any, *, event_key: str, expected_user_id: int | None = None) -> int:
    metadata = dict(session.get("metadata") or {})
    try:
        user_id = int(metadata.get("user_id") or 0)
        credits = int(metadata.get("credits") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Stripe Session metadata is invalid") from exc
    pack = CREDIT_PACKS.get(credits)
    amount_total = int(session.get("amount_total") or 0)
    currency = str(session.get("currency") or "").lower()
    client_reference_id = str(session.get("client_reference_id") or "")
    if expected_user_id is not None and user_id != expected_user_id:
        raise HTTPException(status_code=403, detail="Stripe Session belongs to another account")
    if expected_user_id is None and not account_exists(user_id):
        # A checkout webhook can arrive after its account was permanently deleted. Never
        # recreate an orphan token balance for an identity that no longer exists.
        return 0
    if session.get("mode") != "payment" or client_reference_id != str(user_id):
        raise HTTPException(status_code=400, detail="Stripe Session identity is invalid")
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
    return credits


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
    if not payload.acceptTerms or not payload.acceptPrivacy:
        raise HTTPException(status_code=400, detail="Accept the Terms and Privacy Policy to create or connect an AlphaWolf account")

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
    record_current_legal_acceptance(int(user["id"]), source="google_signup")
    user = {**user, **legal_acceptance_status(int(user["id"]))}
    raw_session, expires_at = create_session(user["id"], ttl_days=SESSION_TTL_DAYS)
    secure_cookie = _secure_cookie(request)
    cookie_name = HOST_SESSION_COOKIE if secure_cookie else SESSION_COOKIE
    response.set_cookie(
        cookie_name,
        raw_session,
        max_age=SESSION_TTL_DAYS * 86_400,
        expires=expires_at,
        httponly=True,
        secure=secure_cookie,
        samesite=_cookie_samesite(request),
        path="/",
    )
    if cookie_name == HOST_SESSION_COOKIE:
        response.delete_cookie(SESSION_COOKIE, path="/", secure=True, samesite="lax")
    response.delete_cookie(NONCE_COOKIE, path="/api/auth")
    return {"user": user}


@router.post("/legal/accept")
def accept_current_legal(request: Request) -> dict[str, Any]:
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in before accepting account terms")
    record_current_legal_acceptance(int(user["id"]), source="account_settings")
    return {"user": user_for_session(session_token_from_request(request))}


@router.get("/account/export")
def account_export(request: Request) -> Response:
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to export your account data")
    payload = json.dumps(export_account_data(int(user["id"])), ensure_ascii=False, indent=2, default=str)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="alphawolf-account-export.json"'},
    )


@router.delete("/account")
def account_delete(payload: AccountDeletion, request: Request, response: Response) -> dict[str, bool]:
    user = user_for_session(session_token_from_request(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to delete your account")
    if payload.confirmation.strip() != "DELETE":
        raise HTTPException(status_code=400, detail='Type DELETE to confirm permanent account deletion')
    remaining = int((user.get("aiUsage") or {}).get("tokens") or 0)
    if remaining > 0 and not payload.acknowledgeCreditForfeiture:
        raise HTTPException(status_code=409, detail=f"This account still has {remaining} unused AI tokens. Confirm that deletion forfeits them, or contact support first.")
    delete_account_data(int(user["id"]))
    _clear_session_cookies(response)
    response.delete_cookie(NONCE_COOKIE, path="/api/auth")
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    delete_session(session_token_from_request(request))
    _clear_session_cookies(response)
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
    if request.headers.get("x-alpha-wolf-proxy", "").strip().lower() == "first-party":
        return "lax"
    configured = os.getenv("AUTH_COOKIE_SAMESITE", "").strip().lower()
    if configured in {"lax", "strict", "none"}:
        return configured
    return "none" if _secure_cookie(request) else "lax"


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    # __Host- cookies are accepted by browsers only when the deletion header also preserves
    # Secure and Path=/ with no Domain attribute.
    response.delete_cookie(HOST_SESSION_COOKIE, path="/", secure=True, samesite="lax")
