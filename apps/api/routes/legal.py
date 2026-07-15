from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from internal.legal import legal_versions
from internal.store.account_lifecycle import create_support_request
from internal.store.auth import user_for_session

router = APIRouter(prefix="/api", tags=["legal-account"])


class SupportRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    category: Literal["support", "account", "privacy", "refund", "bug"] = "support"
    subject: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=10, max_length=4000)
    website: str = Field(default="", max_length=0)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value.strip()):
            raise ValueError("Enter a valid email address")
        return value.strip().lower()


@router.get("/legal")
def legal_info() -> dict[str, Any]:
    return {
        "productRole": "Research, notes, portfolio tracking, and AI decision support only; AlphaWolf does not execute trades or hold customer assets.",
        "versions": legal_versions(),
        "routes": {"terms": "/terms", "privacy": "/privacy", "refunds": "/refunds", "support": "/support"},
    }


@router.post("/support", status_code=201)
def submit_support(payload: SupportRequest, request: Request) -> dict[str, Any]:
    if payload.website:
        raise HTTPException(status_code=400, detail="Invalid support request")
    user = user_for_session(request.cookies.get("aw_session"))
    request_id = create_support_request(
        user_id=int(user["id"]) if user else None,
        email=payload.email,
        category=payload.category,
        subject=payload.subject,
        message=payload.message,
    )
    return {"ok": True, "requestId": request_id, "message": "Your request was recorded. Keep the request number for reference."}
