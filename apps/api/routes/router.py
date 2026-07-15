from __future__ import annotations

from fastapi import FastAPI

from routes import agents, analysis, auth, backtrade, calendar, dashboard, details, discover, legal, live_trade, market, notifications, portfolio, presets, quote, radar, sectors, settings, stocks


def register_routes(app: FastAPI) -> None:
    for module in (stocks, dashboard, radar, quote, details, analysis, backtrade, discover, presets, sectors, portfolio, market, calendar, live_trade, agents, auth, settings, legal, notifications):
        app.include_router(module.router)
