from __future__ import annotations

from fastapi import FastAPI

from routes import agents, analysis, calendar, dashboard, details, discover, live_trade, market, portfolio, presets, quote, radar, sectors, stocks


def register_routes(app: FastAPI) -> None:
    for module in (stocks, dashboard, radar, quote, details, analysis, discover, presets, sectors, portfolio, market, calendar, live_trade, agents):
        app.include_router(module.router)
