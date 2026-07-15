from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe


def create_notification(user_id: int, kind: str, subject: str, title: str, message: str, dedupe_key: str, metadata: dict[str, Any] | None = None) -> None:
    if user_id <= 0:
        return
    with connect() as db:
        db.execute(
            """INSERT OR IGNORE INTO notifications(user_id,kind,subject,title,message,dedupe_key,metadata,created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (user_id, kind, subject, title, message, dedupe_key,
             json.dumps(json_safe(metadata or {}), separators=(",", ":")), datetime.now(timezone.utc).isoformat()),
        )
        db.commit()


def notifications_from_ai_result(user_id: int, subject: str, payload: dict[str, Any], run_id: str | None) -> None:
    decision = payload.get("decisionState") if isinstance(payload.get("decisionState"), dict) else {}
    guarded = decision.get("guardedDecision") if isinstance(decision.get("guardedDecision"), dict) else {}
    action = str(payload.get("holdingAction") or payload.get("signal") or payload.get("verdict") or "").upper()
    timing = str(guarded.get("timing") or "").upper()
    key = run_id or str(payload.get("generatedAt") or "latest")
    if timing == "BREAKOUT" or action in {"BUY", "ADD"}:
        create_notification(user_id, "trigger_reached", subject, f"{subject}: research trigger reached", "The latest guarded AI run found a buy/add trigger. Review the evidence before acting.", f"trigger:{subject}:{key}")
    if action in {"SELL", "AVOID"} or str(payload.get("horizonAlignment") or "").upper() == "BROKEN":
        create_notification(user_id, "thesis_broken", subject, f"{subject}: thesis warning", "The latest guarded AI run says the thesis or risk boundary may be broken. Review what changed.", f"thesis:{subject}:{key}")
    next_buy = payload.get("nextBuy") if isinstance(payload.get("nextBuy"), dict) else {}
    if next_buy.get("start"):
        create_notification(user_id, "planned_buy_window", subject, f"{subject}: planned research window", f"The Agent's planned buy window starts {next_buy['start']}. Re-check current evidence then.", f"window:{subject}:{next_buy['start']}")


def list_notifications(user_id: int, limit: int = 30) -> list[dict[str, Any]]:
    _sync_trial_expiry_notification(user_id)
    with connect() as db:
        rows = db.execute(
            "SELECT id,kind,subject,title,message,metadata,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, max(1, min(100, limit))),
        ).fetchall()
    return [{
        "id": int(row[0]), "kind": str(row[1]), "subject": str(row[2]), "title": str(row[3]),
        "message": str(row[4]), "metadata": json.loads(str(row[5]) or "{}"),
        "readAt": row[6], "createdAt": str(row[7]),
    } for row in rows]


def mark_notification_read(user_id: int, notification_id: int) -> None:
    with connect() as db:
        db.execute("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?", (datetime.now(timezone.utc).isoformat(), notification_id, user_id))
        db.commit()


def _sync_trial_expiry_notification(user_id: int) -> None:
    with connect() as db:
        row = db.execute("SELECT premium_expires_at FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not row[0]:
        return
    try:
        expires = datetime.fromisoformat(str(row[0]).replace("Z", "+00:00"))
        if not expires.tzinfo:
            expires = expires.replace(tzinfo=timezone.utc)
    except ValueError:
        return
    now = datetime.now(timezone.utc)
    if now < expires <= now + timedelta(days=7):
        date = expires.date().isoformat()
        create_notification(user_id, "trial_expiring", "ACCOUNT", "Pro trial ending soon", f"Your Pro feature access ends {date}. Purchased AI tokens do not expire.", f"trial-expiry:{date}")
