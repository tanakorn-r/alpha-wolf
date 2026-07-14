from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect

FREE_AI_LIMIT = max(0, int(os.getenv("FREE_AI_MONTHLY_LIMIT", "3")))
PRO_AI_LIMIT = max(1, int(os.getenv("PRO_AI_MONTHLY_LIMIT", "100")))
PRO_TRIAL_DAYS = max(1, int(os.getenv("PRO_TRIAL_DAYS", "30")))


def redeem_pro_trial(user_id: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    with connect() as db:
        row = db.execute("SELECT premium_redeemed_at, premium_expires_at FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise ValueError("Account not found")
        redeemed_at = _parse(row[0])
        expires_at = _parse(row[1])
        if redeemed_at is None:
            redeemed_at = now
            expires_at = now + timedelta(days=PRO_TRIAL_DAYS)
            db.execute(
                "UPDATE users SET premium_redeemed_at = ?, premium_expires_at = ? WHERE id = ?",
                (redeemed_at.isoformat(), expires_at.isoformat(), user_id),
            )
            db.commit()
        elif expires_at is None:
            expires_at = redeemed_at + timedelta(days=PRO_TRIAL_DAYS)
            db.execute("UPDATE users SET premium_expires_at = ? WHERE id = ?", (expires_at.isoformat(), user_id))
            db.commit()
    return entitlement_status(user_id)


def entitlement_status(user_id: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    period = now.strftime("%Y-%m")
    with connect() as db:
        user = db.execute("SELECT premium_redeemed_at, premium_expires_at FROM users WHERE id = ?", (user_id,)).fetchone()
        usage = db.execute("SELECT used, bonus FROM ai_usage_monthly WHERE user_id = ? AND period = ?", (user_id, period)).fetchone()
    redeemed_at = _parse(user[0]) if user else None
    expires_at = _parse(user[1]) if user else None
    if redeemed_at and expires_at is None:
        expires_at = redeemed_at + timedelta(days=PRO_TRIAL_DAYS)
    pro_active = bool(expires_at and expires_at > now)
    limit = PRO_AI_LIMIT if pro_active else FREE_AI_LIMIT
    used = int(usage[0]) if usage else 0
    bonus = int(usage[1]) if usage else 0
    total_limit = limit + bonus
    return {
        "plan": "pro" if pro_active else "free",
        "proActive": pro_active,
        "premiumRedeemedAt": redeemed_at.isoformat() if redeemed_at else None,
        "premiumExpiresAt": expires_at.isoformat() if expires_at else None,
        "aiUsage": {
            "period": period,
            "used": used,
            "limit": total_limit,
            "baseLimit": limit,
            "bonus": bonus,
            "remaining": max(0, total_limit - used),
        },
    }


def fulfill_stripe_ai_credits(
    user_id: int,
    credits: int,
    *,
    event_key: str,
    session_id: str,
    amount_total: int,
    currency: str,
) -> tuple[dict[str, Any], bool]:
    if user_id <= 0 or credits <= 0 or not event_key or not session_id:
        raise ValueError("Invalid Stripe credit fulfillment")
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        cursor = db.execute(
            """INSERT OR IGNORE INTO stripe_credit_fulfillments(
                   event_key, session_id, user_id, credits, amount_total, currency, created_at
               ) VALUES(?, ?, ?, ?, ?, ?, ?)""",
            (event_key, session_id, user_id, credits, amount_total, currency.lower(), now),
        )
        if cursor.rowcount == 0:
            db.commit()
            return entitlement_status(user_id), False
        db.execute(
            """INSERT INTO ai_usage_monthly(user_id, period, used, bonus, updated_at) VALUES(?, ?, 0, ?, ?)
               ON CONFLICT(user_id, period) DO UPDATE SET bonus = ai_usage_monthly.bonus + excluded.bonus,
               updated_at = excluded.updated_at""",
            (user_id, period, credits, now),
        )
        db.commit()
    return entitlement_status(user_id), True


def consume_ai_credit(user_id: int, *, premium_required: bool = False, cost: int = 1) -> dict[str, Any]:
    cost = max(1, int(cost))
    status = entitlement_status(user_id)
    if premium_required and not status["proActive"]:
        return {**status, "allowed": False, "reason": "pro_required"}
    usage = status["aiUsage"]
    if usage["used"] + cost > usage["limit"] or usage["limit"] <= 0:
        return {**status, "allowed": False, "reason": "limit_reached"}
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO ai_usage_monthly(user_id, period, used, updated_at) VALUES(?, ?, ?, ?)
               ON CONFLICT(user_id, period) DO UPDATE SET used = ai_usage_monthly.used + excluded.used, updated_at = excluded.updated_at
               WHERE ai_usage_monthly.used + excluded.used <= ?""",
            (user_id, usage["period"], cost, now, usage["limit"]),
        )
        db.commit()
        if cursor.rowcount == 0:
            return {**entitlement_status(user_id), "allowed": False, "reason": "limit_reached"}
    return {**entitlement_status(user_id), "allowed": True, "reason": None}


def refund_ai_credit(user_id: int, *, cost: int = 1) -> None:
    cost = max(1, int(cost))
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    with connect() as db:
        db.execute("UPDATE ai_usage_monthly SET used = MAX(0, used - ?) WHERE user_id = ? AND period = ?", (cost, user_id, period))
        db.commit()


def _parse(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None
