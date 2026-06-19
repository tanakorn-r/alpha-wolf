from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from internal.store.db import migrate
from internal.store.presets import ensure_market_presets
from routes.router import register_routes

app = FastAPI(title="Alpha Wolf API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    migrate()
    ensure_market_presets()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": "fastapi", "source": "yfinance"}


register_routes(app)
