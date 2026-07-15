from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe
from internal.ai.production_gate import attach_run_context


def record_ai_run(
    *, user_id: int, feature: str, subject: str, agent_id: str, variant: str,
    payload: dict[str, Any], guarded: dict[str, Any] | None, status: str,
    error: str | None = None,
) -> str:
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    context = payload.get("_runContext") if isinstance(payload.get("_runContext"), dict) else {}
    sources = payload.get("_sourceTimestamps") if isinstance(payload.get("_sourceTimestamps"), dict) else {}
    guarded_public = {key: value for key, value in (guarded or {}).items() if not key.startswith("_run") and key != "_sourceTimestamps"}
    with connect() as db:
        db.execute(
            """INSERT INTO ai_run_audit(
                run_id,user_id,feature,subject,agent_id,variant,model,prompt_version,
                source_timestamps,input_payload,raw_output,guarded_output,decision_state,
                quality_checks,status,error,created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_id, user_id, feature, subject, agent_id, variant,
             str(payload.get("model") or ""), str(payload.get("promptVersion") or ""),
             _encoded(sources), _encoded(context), _encoded({k: v for k, v in payload.items() if not k.startswith("_run")}),
             _encoded(guarded_public), _encoded(payload.get("decisionState") or {}),
             _encoded(guarded_public.get("qualityChecks") or []), status, error, now),
        )
        db.commit()
    return run_id


def record_ai_failure(*, key: Any, context: dict[str, Any], data_trust: dict[str, Any] | None, error: Exception) -> str:
    fast_features = {"valuation", "today", "technical", "buy-timing"}
    model = (
        os.getenv("OPENAI_FAST_MODEL", "").strip() or "gpt-5.4-mini"
        if str(key.feature) in fast_features
        else os.getenv("OPENAI_MODEL", "gpt-5.5").strip() or "gpt-5.5"
    )
    payload = attach_run_context(
        {"source": "openai", "model": model, "errorType": type(error).__name__},
        feature=str(key.feature), context=context, data_trust=data_trust,
    )
    return record_ai_run(
        user_id=int(key.user_id), feature=str(key.feature), subject=str(key.subject),
        agent_id=str(key.agent_id), variant=str(key.variant), payload=payload,
        guarded=None, status="model_error", error=str(error),
    )


def _encoded(value: Any) -> str:
    return json.dumps(json_safe(value), ensure_ascii=False, separators=(",", ":"))


def list_ai_decision_history(user_id: int, subject: str, agent_id: str, limit: int = 20) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """SELECT run_id,feature,subject,agent_id,model,prompt_version,source_timestamps,
                      guarded_output,decision_state,status,error,created_at
               FROM ai_run_audit WHERE user_id=? AND subject=? AND agent_id=?
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, subject, agent_id, max(1, min(100, limit))),
        ).fetchall()
    items: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    # Explain chronologically, then return newest first.
    for row in reversed(rows):
        get = lambda key, index: row[key] if hasattr(row, "keys") else row[index]
        state = _decoded(get("decision_state", 8))
        guarded = _decoded(get("guarded_output", 7))
        current = _decision_summary(state, guarded)
        reason = _change_reason(previous, current)
        items.append({
            "runId": str(get("run_id", 0)), "feature": str(get("feature", 1)),
            "subject": str(get("subject", 2)), "agentId": str(get("agent_id", 3)),
            "model": str(get("model", 4) or ""), "promptVersion": str(get("prompt_version", 5)),
            "sourceTimestamps": _decoded(get("source_timestamps", 6)), "decision": current,
            "status": str(get("status", 9)), "error": get("error", 10),
            "createdAt": str(get("created_at", 11)), "whyChanged": reason,
        })
        if str(get("status", 9)) == "accepted":
            previous = current
    return list(reversed(items))


def _decoded(value: Any) -> Any:
    try:
        return json.loads(str(value))
    except (TypeError, ValueError):
        return {}


def _decision_summary(state: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    guarded = state.get("guardedDecision") if isinstance(state.get("guardedDecision"), dict) else {}
    action = output.get("signal") or output.get("verdict") or output.get("holdingAction") or guarded.get("timing") or "UNKNOWN"
    return {
        "action": str(action).upper(), "stateId": str(state.get("id") or ""),
        "ownership": guarded.get("ownership"), "timing": guarded.get("timing"),
        "headline": output.get("headline"), "summary": output.get("summary") or output.get("narrative"),
    }


def _change_reason(previous: dict[str, Any] | None, current: dict[str, Any]) -> str:
    if previous is None:
        return "First recorded decision for this Agent and stock."
    changed = [key for key in ("action", "ownership", "timing") if previous.get(key) != current.get(key)]
    if not changed:
        return "Decision unchanged; the evidence and source timestamps were refreshed."
    details = ", ".join(f"{key} {previous.get(key) or '—'} → {current.get(key) or '—'}" for key in changed)
    return f"The guarded decision changed: {details}. Open the run to compare its evidence timestamps."
