from __future__ import annotations

import json
import os
import sys
import traceback
import uuid
from typing import Any

from fastapi import Request


def log_unhandled_exception(request: Request, exc: BaseException) -> str:
    """Emit one structured, trace-correlated Cloud Logging entry and return its error ID."""
    payload, error_id = build_exception_log(request, exc)
    sys.stderr.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stderr.flush()
    return error_id


def build_exception_log(request: Request, exc: BaseException) -> tuple[dict[str, Any], str]:
    trace_id, sampled = _cloud_trace_context(request.headers.get("x-cloud-trace-context", ""))
    error_id = trace_id or uuid.uuid4().hex
    route = request.scope.get("route")
    route_template = getattr(route, "path", None)
    exception_type = type(exc).__name__
    exception_message = str(exc)
    stack_trace = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    payload: dict[str, Any] = {
        "severity": "ERROR",
        # Cloud Error Reporting parses stack traces from the special message field.
        "message": f"Unhandled {exception_type}: {exception_message}\n{stack_trace}",
        "errorId": error_id,
        "exceptionType": exception_type,
        "exceptionMessage": exception_message,
        "stackTrace": stack_trace,
        "route": route_template or request.url.path,
        "service": os.getenv("K_SERVICE", ""),
        "revision": os.getenv("K_REVISION", ""),
        "httpRequest": {
            "requestMethod": request.method,
            # Deliberately exclude query parameters, cookies, request bodies, IPs, and
            # user agents. The request log already has them when an operator needs them.
            "requestUrl": request.url.path,
            "status": 500,
        },
    }

    project_id = _project_id()
    if trace_id and project_id:
        payload["logging.googleapis.com/trace"] = f"projects/{project_id}/traces/{trace_id}"
        payload["logging.googleapis.com/trace_sampled"] = sampled
    return payload, error_id


def _cloud_trace_context(header: str) -> tuple[str, bool]:
    if not header:
        return "", False
    trace_part, _, options = header.partition(";")
    trace_id = trace_part.partition("/")[0].strip()
    if len(trace_id) != 32 or any(character not in "0123456789abcdefABCDEF" for character in trace_id):
        return "", False
    return trace_id.lower(), options.strip() == "o=1"


def _project_id() -> str:
    for name in ("GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID", "GCP_PROJECT", "GCLOUD_PROJECT", "PROJECT_ID"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""
