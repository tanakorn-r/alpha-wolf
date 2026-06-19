from __future__ import annotations

from fastapi import FastAPI

from routes import analysis, dashboard, details, discover, presets, quote, radar, sectors, stocks


def register_routes(app: FastAPI) -> None:
    for module in (stocks, dashboard, radar, quote, details, analysis, discover, presets, sectors):
        app.include_router(module.router)
