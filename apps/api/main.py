from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from internal.observability import log_unhandled_exception
from internal.auth_context import session_token_from_request
from internal.store.db import migrate
from routes.router import register_routes

app = FastAPI(title="Alpha Wolf API", version="1.0.0")
cors_origins = [
    value.strip()
    for value in os.getenv("CORS_ORIGINS", "http://127.0.0.1:4200,http://localhost:4200").split(",")
    if value.strip()
]
trusted_session_origins = set(cors_origins) | {
    "http://127.0.0.1:4200",
    "http://localhost:4200",
    "capacitor://localhost",
    "https://localhost",
}
configured_app_origin = os.getenv("APP_URL", "").strip()
if configured_app_origin:
    parsed_app_origin = urlsplit(configured_app_origin)
    if parsed_app_origin.scheme and parsed_app_origin.netloc:
        trusted_session_origins.add(f"{parsed_app_origin.scheme.lower()}://{parsed_app_origin.netloc.lower()}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _session_security(request: Request, call_next):
    rejection = _session_origin_rejection(request)
    if rejection:
        return JSONResponse(
            status_code=403,
            content={"detail": rejection},
            headers={"Cache-Control": "no-store"},
        )
    response = await call_next(request)
    if request.url.path.startswith("/api/auth/") or request.url.path == "/api/bootstrap":
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Vary"] = _append_vary(response.headers.get("Vary"), "Cookie")
    return response


def _session_origin_rejection(request: Request) -> str | None:
    if request.method.upper() not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None
    if not session_token_from_request(request):
        return None
    origin = _request_origin(request)
    if origin is None:
        return "Authenticated mutations require an Origin or Referer header"
    if origin not in trusted_session_origins:
        return "Authenticated mutation origin is not allowed"
    return None


def _request_origin(request: Request) -> str | None:
    raw = request.headers.get("origin", "").strip()
    if not raw:
        raw = request.headers.get("referer", "").strip()
    if not raw or raw.lower() == "null":
        return None
    parsed = urlsplit(raw)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _append_vary(current: str | None, value: str) -> str:
    items = [item.strip() for item in (current or "").split(",") if item.strip()]
    if value.lower() not in {item.lower() for item in items}:
        items.append(value)
    return ", ".join(items)


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
