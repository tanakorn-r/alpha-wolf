from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter, Request

from internal.ai.agents import public_agents
from internal.store.auth import user_for_session
from internal.store.notifications import list_notifications
from internal.store.portfolio import list_watchlist
from routes.auth import SESSION_COOKIE, premium_promo_active

router = APIRouter()
_ACCOUNT_READ_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="bootstrap-read")


@router.get("/api/bootstrap")
def app_bootstrap(request: Request) -> dict[str, Any]:
    """Restore the small, shared app shell state in one network round trip."""
    user = user_for_session(request.cookies.get(SESSION_COOKIE))
    notifications: dict[str, Any] = {"items": [], "unread": 0}
    watchlist: list[str] = []

    if user:
        user_id = int(user["id"])
        notification_future = _ACCOUNT_READ_EXECUTOR.submit(list_notifications, user_id, 30)
        watchlist_future = _ACCOUNT_READ_EXECUTOR.submit(list_watchlist, user_id)
        items = notification_future.result()
        notifications = {"items": items, "unread": sum(1 for item in items if not item["readAt"])}
        watchlist = watchlist_future.result()

    return {
        "user": user,
        "premiumPromoActive": premium_promo_active(),
        "agents": public_agents(),
        "notifications": notifications,
        "watchlist": watchlist,
    }
