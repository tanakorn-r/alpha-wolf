from __future__ import annotations

import json
import math
import re
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd


def string_or_none(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def percent_value(value: Any) -> float | None:
    number = as_float(value)
    if number is None:
        return None
    if abs(number) <= 1.5:
        return number * 100.0
    return number


def safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "get"):
        return value
    try:
        return dict(value)
    except Exception:
        return {}


def safe_dataframe_records(frame: Any) -> list[dict[str, Any]]:
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        return []
    return frame.reset_index().replace({pd.NaT: None}).to_dict(orient="records")


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, timezone):
        return str(value)
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except Exception:
            pass
    return str(value)


def normalize_statement_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def normalize_timestamp(value: Any) -> str | None:
    number = as_float(value)
    if number is None:
        return None
    if number > 10_000_000_000:
        number /= 1000.0
    try:
        return pd.to_datetime(number, unit="s", utc=True).isoformat()
    except Exception:
        return None


def recommendation_label(value: Any) -> str:
    key = str(value or "").lower()
    mapping = {
        "strong_buy": "Strong Buy",
        "buy": "Buy",
        "outperform": "Outperform",
        "hold": "Hold",
        "underperform": "Underperform",
        "sell": "Sell",
    }
    return mapping.get(key, "Hold")


def slugify_index(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "unknown"


def parse_json_fragment(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None
