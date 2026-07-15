from __future__ import annotations

from fastapi import APIRouter, Query, Request

from internal.auth_context import require_user_id
from internal.store.notifications import list_notifications, mark_notification_read

router = APIRouter()


@router.get("/api/notifications")
def get_notifications(request: Request, limit: int = Query(30, ge=1, le=100)) -> dict:
    items = list_notifications(require_user_id(request), limit)
    return {"items": items, "unread": sum(1 for item in items if not item["readAt"])}


@router.post("/api/notifications/{notification_id}/read")
def read_notification(notification_id: int, request: Request) -> dict[str, bool]:
    mark_notification_read(require_user_id(request), notification_id)
    return {"ok": True}
