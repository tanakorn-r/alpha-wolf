from __future__ import annotations

import hmac
import os
from typing import Any, Literal, Self

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from internal.store.telemetry import list_operational_telemetry, record_operational_telemetry
from internal.store.db import _is_terminal_libsql_error

router = APIRouter(prefix="/api/telemetry", tags=["operational-telemetry"])

PAGES = {"home", "terms", "privacy", "refunds", "support", "daily_brief", "live_trade", "scanner", "hunt_ai", "calendar"}
FLOWS = {"hunt_signals", "buy_timing", "next_10", "technical_analysis", "intraday_analysis", "strategy_analysis", "analyst_report", "ai_replay"}
AREAS = {"buy_timing", "replay", "strategy", "analysis", "portfolio", "auth", "discovery", "details", "calendar", "live_trade", "bootstrap", "get_other", "post_other", "put_other", "patch_other", "delete_other"}
METRICS = {"page_load", "ttfb", "dom_interactive"}
SUCCESS_EVENTS = {
    "success_dashboard_opened",
    "success_account_connected",
    "success_pro_trial_activated",
    "success_credits_purchased",
    "success_support_request_sent",
    "success_watchlist_changed",
    "success_portfolio_changed",
    "success_dca_plan_changed",
    "success_ai_analysis_returned",
    "success_strategy_returned",
    "success_replay_started",
    "success_onboarding_completed",
}
EVENTS = {"page_view", "flow_started", "flow_completed", "api_request", "performance_metric", *SUCCESS_EVENTS}
DIMENSIONS = {"", *PAGES, *FLOWS, *AREAS, *METRICS}


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str = Field(min_length=1, max_length=40)
    dimension: str = Field(default="", max_length=40)
    outcome: Literal["", "success", "failure", "abandoned", "network_error"] = ""
    method: Literal["", "get", "post", "put", "patch", "delete"] = ""
    status: int = Field(default=-1, ge=-1, le=599)
    duration_ms: int | None = Field(default=None, alias="durationMs", ge=0, le=3_600_000)

    @field_validator("name")
    @classmethod
    def known_event(cls, value: str) -> str:
        if value not in EVENTS:
            raise ValueError("Unknown operational event")
        return value

    @field_validator("dimension")
    @classmethod
    def known_dimension(cls, value: str) -> str:
        if value not in DIMENSIONS:
            raise ValueError("Unknown operational dimension")
        return value

    @model_validator(mode="after")
    def valid_shape(self) -> Self:
        if self.name == "page_view" and self.dimension not in PAGES:
            raise ValueError("page_view requires a known page")
        if self.name in {"flow_started", "flow_completed"} and self.dimension not in FLOWS:
            raise ValueError("flow event requires a known flow")
        if self.name == "api_request" and self.dimension not in AREAS:
            raise ValueError("api_request requires a known area")
        if self.name == "performance_metric" and self.dimension not in METRICS:
            raise ValueError("performance_metric requires a known metric")
        if self.name in SUCCESS_EVENTS and self.dimension:
            raise ValueError("success events cannot contain a dimension")
        if self.name == "flow_completed" and (not self.outcome or self.duration_ms is None):
            raise ValueError("completed flows require outcome and duration")
        if self.name == "api_request" and (not self.outcome or not self.method or self.duration_ms is None):
            raise ValueError("API requests require outcome, method, and duration")
        return self


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[TelemetryEvent] = Field(min_length=1, max_length=25)


@router.post("", status_code=204)
def submit_telemetry(payload: TelemetryBatch) -> Response:
    # Deliberately accept no Request object: cookies, account/session identifiers,
    # IP addresses, user agents, and referrers are not read or persisted here.
    try:
        record_operational_telemetry([event.model_dump() for event in payload.events])
    except Exception as exc:
        # Operational telemetry is explicitly best-effort. A stale Turso stream must not
        # create more client retries or compete with account restoration during recovery.
        if not _is_terminal_libsql_error(exc):
            raise
    return Response(status_code=204)


@router.get("/summary")
def telemetry_summary(
    days: int = Query(default=30, ge=1, le=90),
    admin_token: str | None = Header(default=None, alias="X-Telemetry-Admin-Token"),
) -> dict[str, Any]:
    configured_token = os.getenv("TELEMETRY_ADMIN_TOKEN", "").strip()
    if not configured_token:
        raise HTTPException(status_code=404, detail="Not found")
    if not admin_token or not hmac.compare_digest(admin_token, configured_token):
        raise HTTPException(status_code=403, detail="Invalid telemetry admin token")
    return {"days": days, "aggregates": list_operational_telemetry(days)}
