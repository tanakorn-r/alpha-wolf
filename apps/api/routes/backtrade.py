from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from internal.ai.backtrade import create_backtrade_job, get_backtrade_job
from internal.ai.access import claim_ai_run, release_ai_run, require_ai_account
from internal.auth_context import account_cache_scope, user_id_from_request


router = APIRouter()


@router.post("/api/backtrade/jobs")
def start_backtrade(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    scope = account_cache_scope(user_id_from_request(request))
    years = max(1, min(5, int(payload.get("years") or 5)))
    usage_cost = years * 12 + 1
    usage_user_id, _ = claim_ai_run(request, premium_required=True, cost=usage_cost)
    try:
        return create_backtrade_job(scope, payload)
    except ValueError as exc:
        release_ai_run(usage_user_id, cost=usage_cost)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        release_ai_run(usage_user_id, cost=usage_cost)
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/api/backtrade/jobs/{job_id}")
def backtrade_status(job_id: str, request: Request) -> dict[str, Any]:
    scope = account_cache_scope(user_id_from_request(request))
    job = get_backtrade_job(scope, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Replay job not found")
    return job
