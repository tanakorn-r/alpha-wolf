from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from internal.observability import log_unhandled_exception
from internal.store.db import migrate
from routes.router import register_routes

app = FastAPI(title="Alpha Wolf API", version="1.0.0")
cors_origins = [
    value.strip()
    for value in os.getenv("CORS_ORIGINS", "http://127.0.0.1:4200,http://localhost:4200").split(",")
    if value.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    error_id = log_unhandled_exception(request, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "errorId": error_id},
    )


@app.on_event("startup")
def _startup() -> None:
    migrate()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": "fastapi", "source": "yfinance"}


register_routes(app)
