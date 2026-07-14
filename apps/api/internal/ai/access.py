from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from internal.auth_context import user_id_from_request
from internal.store.entitlements import consume_ai_credit, entitlement_status, refund_ai_credit


def require_ai_account(request: Request, *, premium_required: bool = False) -> tuple[int, dict[str, Any]]:
    user_id = user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to use AI")
    status = entitlement_status(user_id)
    if premium_required and not status["proActive"]:
        raise HTTPException(status_code=403, detail="An active Pro plan is required")
    return user_id, status


def claim_ai_run(request: Request, *, premium_required: bool = False, cost: int = 1) -> tuple[int, dict[str, Any]]:
    user_id, _ = require_ai_account(request, premium_required=premium_required)
    result = consume_ai_credit(user_id, premium_required=premium_required, cost=cost)
    if not result["allowed"]:
        if result["reason"] == "pro_required":
            raise HTTPException(status_code=403, detail="An active Pro plan is required")
        raise HTTPException(status_code=429, detail="No AI tokens remaining")
    return user_id, result


def release_ai_run(user_id: int, *, cost: int = 1) -> None:
    refund_ai_credit(user_id, cost=cost)
