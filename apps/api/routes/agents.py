from __future__ import annotations

from fastapi import APIRouter

from internal.ai.agents import public_agents
from models import AgentProfile

router = APIRouter()


@router.get("/api/agents", response_model=list[AgentProfile])
def agents() -> list[dict[str, object]]:
    return public_agents()
