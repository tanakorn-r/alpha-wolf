from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe
from internal.ai.production_gate import enforce_production_gate, strip_private_run_fields
from internal.store.ai_audit import record_ai_run
from internal.store.notifications import notifications_from_ai_result


class AIResultQualityError(ValueError):
    """Raised before a malformed AI response can replace the user's last good result."""


@dataclass(frozen=True)
class AIResultKey:
    user_id: int
    feature: str
    subject: str
    agent_id: str
    variant: str = ""


_REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "stock-analysis": ("signal", "headline", "summary"),
    "analyst-report": ("signal", "headline", "summary", "thesis"),
    "quant": ("signal", "summary", "buyPlan", "checks"),
    "valuation": ("verdict", "narrative", "rightNow", "metrics"),
    "today": ("signal", "headline", "summary", "holdingAction"),
    "technical": ("signal", "headline", "summary", "frameworks"),
    "strategy": ("headline", "marketRead", "picks"),
    "portfolio": ("verdict", "intro", "bullets"),
    "buy-timing": ("headline", "summary", "agentMonthlyPlan"),
    "next-10": ("headline", "thesis", "moves"),
    "news-research": ("headline", "summary", "horizons", "sources"),
    "history": ("headline", "summary", "timeline", "currentYear", "sources"),
}


def load_ai_result(key: AIResultKey) -> dict[str, Any] | None:
    """Load the durable last-known good result for one account-owned AI surface."""
    if key.user_id <= 0:
        return None
    try:
        with connect() as db:
            row = db.execute(
                """SELECT payload, generated_at FROM ai_results
                   WHERE user_id = ? AND feature = ? AND subject = ? AND agent_id = ? AND variant = ?""",
                (key.user_id, key.feature, key.subject, key.agent_id, key.variant),
            ).fetchone()
        if not row:
            return None
        payload_text = row["payload"] if hasattr(row, "keys") else row[0]
        generated_at = str(row["generated_at"] if hasattr(row, "keys") else row[1])
        payload = json.loads(str(payload_text))
        return quality_gate_ai_result(key, payload, generated_at=generated_at)
    except AIResultQualityError as exc:
        print(f"Warning: rejected stored AI result {key.feature}/{key.subject}: {exc}")
        return None
    except Exception as exc:
        print(f"Warning: AI result read failed for {key.feature}/{key.subject}: {exc}")
        return None


def load_latest_ai_result(
    user_id: int,
    feature: str,
    subject: str,
    agent_id: str,
    *,
    variant_prefix: str = "",
) -> dict[str, Any] | None:
    """Read-only page hydration: return the newest matching result and never generate one."""
    if user_id <= 0:
        return None
    try:
        sql = """SELECT variant, payload, generated_at FROM ai_results
                 WHERE user_id = ? AND feature = ? AND subject = ? AND agent_id = ?"""
        params: list[Any] = [user_id, feature, subject, agent_id]
        if variant_prefix:
            sql += " AND variant LIKE ?"
            params.append(f"{variant_prefix}%")
        sql += " ORDER BY updated_at DESC LIMIT 1"
        with connect() as db:
            row = db.execute(sql, params).fetchone()
        if not row:
            return None
        variant = str(row["variant"] if hasattr(row, "keys") else row[0])
        payload_text = row["payload"] if hasattr(row, "keys") else row[1]
        generated_at = str(row["generated_at"] if hasattr(row, "keys") else row[2])
        payload = json.loads(str(payload_text))
        return quality_gate_ai_result(
            AIResultKey(user_id, feature, subject, agent_id, variant),
            payload,
            generated_at=generated_at,
        )
    except AIResultQualityError as exc:
        print(f"Warning: rejected latest AI result {feature}/{subject}: {exc}")
        return None
    except Exception as exc:
        print(f"Warning: latest AI result read failed for {feature}/{subject}: {exc}")
        return None


def save_ai_result(key: AIResultKey, payload: dict[str, Any]) -> dict[str, Any]:
    """Quality-check and atomically replace only this account's last good result."""
    if key.user_id <= 0:
        raise PermissionError("AI results require an authenticated account")
    try:
        checked = quality_gate_ai_result(key, payload)
        if payload.get("promptVersion") and isinstance(payload.get("decisionState"), dict):
            checked, _ = enforce_production_gate(key.feature, key.agent_id, checked)
    except Exception as exc:
        if payload.get("_runContext") is not None:
            record_ai_run(user_id=key.user_id, feature=key.feature, subject=key.subject,
                          agent_id=key.agent_id, variant=key.variant, payload=payload,
                          guarded=None, status="rejected", error=str(exc))
        raise
    run_id = None
    if payload.get("_runContext") is not None:
        run_id = record_ai_run(user_id=key.user_id, feature=key.feature, subject=key.subject,
                               agent_id=key.agent_id, variant=key.variant, payload=payload,
                               guarded=checked, status="accepted")
    checked = strip_private_run_fields(checked)
    if run_id:
        checked["runId"] = run_id
    generated_at = str(checked["generatedAt"])
    now = datetime.now(timezone.utc).isoformat()
    encoded = json.dumps(json_safe(checked), ensure_ascii=False, separators=(",", ":"))
    with connect() as db:
        db.execute(
            """INSERT INTO ai_results(
                   user_id, feature, subject, agent_id, variant, payload, model,
                   generated_at, quality_status, created_at, updated_at
               ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'passed', ?, ?)
               ON CONFLICT(user_id, feature, subject, agent_id, variant) DO UPDATE SET
                   payload = excluded.payload,
                   model = excluded.model,
                   generated_at = excluded.generated_at,
                   quality_status = 'passed',
                   updated_at = excluded.updated_at""",
            (
                key.user_id,
                key.feature,
                key.subject,
                key.agent_id,
                key.variant,
                encoded,
                str(checked.get("model") or ""),
                generated_at,
                now,
                now,
            ),
        )
        db.commit()
    notifications_from_ai_result(key.user_id, key.subject, checked, run_id)
    return checked


def quality_gate_ai_result(
    key: AIResultKey,
    payload: dict[str, Any],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    if not isinstance(payload, dict) or not payload:
        raise AIResultQualityError("response is empty")
    source = payload.get("source") or payload.get("narrativeSource")
    if source != "openai":
        raise AIResultQualityError("response is not a completed OpenAI result")
    if not str(payload.get("model") or "").strip():
        raise AIResultQualityError("model is missing")
    badge = payload.get("agent")
    if not isinstance(badge, dict) or str(badge.get("id") or "") != key.agent_id:
        raise AIResultQualityError("agent identity does not match the result key")
    for field in _REQUIRED_FIELDS.get(key.feature, ()):
        if not _meaningful(payload.get(field)):
            raise AIResultQualityError(f"required field {field} is empty")

    stamp = generated_at or str(payload.get("generatedAt") or "") or datetime.now(timezone.utc).isoformat()
    try:
        datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AIResultQualityError("generatedAt is invalid") from exc
    return {**payload, "generatedAt": stamp}


def _meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict)):
        return len(value) > 0
    return True
