from __future__ import annotations

import json
import os
import ssl
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import certifi
from pydantic import ValidationError

from internal.store.utils import parse_json_fragment
from models import StockAnalysis

OPENAI_TIMEOUT_SECONDS = 45
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
EXPECTED_SCORE_LABELS = ["Value", "Financial health", "Dividend safety", "Growth", "Timing"]


class OpenAIAnalysisError(RuntimeError):
    pass


def _strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """OpenAI's strict structured-output mode requires every key in "properties" to also
    appear in "required" at every object level (nullable fields stay optional via their
    type, not by omission) - Pydantic's model_json_schema() only lists non-default fields,
    so this walks the schema and fills in "required" everywhere recursively."""
    if isinstance(schema, dict):
        if schema.get("type") == "object" and "properties" in schema:
            schema["required"] = list(schema["properties"].keys())
            schema.setdefault("additionalProperties", False)
        for value in schema.values():
            _strict_schema(value)
    elif isinstance(schema, list):
        for item in schema:
            _strict_schema(item)
    return schema


def analyze_with_openai(context: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise OpenAIAnalysisError("OPENAI_API_KEY is not configured")

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "instructions": _analysis_instructions(),
        "input": json.dumps(context, ensure_ascii=False, separators=(",", ":")),
        "max_output_tokens": 2500,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "stock_analysis",
                "strict": True,
                "schema": _strict_schema(StockAnalysis.model_json_schema()),
            }
        },
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        with urllib_request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS, context=ssl_context) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        raise OpenAIAnalysisError(f"OpenAI returned HTTP {exc.code}") from exc
    except urllib_error.URLError as exc:
        reason = str(getattr(exc, "reason", exc))
        raise OpenAIAnalysisError(f"OpenAI analysis request failed: {reason}") from exc
    except TimeoutError as exc:
        raise OpenAIAnalysisError("OpenAI analysis request timed out") from exc
    except ValueError as exc:
        raise OpenAIAnalysisError("OpenAI returned an unreadable response") from exc

    text = extract_openai_text(raw)
    parsed = parse_json_fragment(text or "")
    if not parsed:
        raise OpenAIAnalysisError("OpenAI returned no structured analysis")

    try:
        result = StockAnalysis.model_validate(parsed)
    except ValidationError as exc:
        raise OpenAIAnalysisError("OpenAI returned an invalid analysis shape") from exc
    if [score.label for score in result.scores] != EXPECTED_SCORE_LABELS:
        raise OpenAIAnalysisError("OpenAI returned an invalid scorecard order")

    return {**result.model_dump(), "source": "openai", "model": model}


def extract_openai_text(payload: dict[str, Any]) -> str | None:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()

    chunks: list[str] = []
    for item in payload.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) or []:
            if not isinstance(content, dict):
                continue
            for key in ("text", "output_text", "value"):
                if isinstance(content.get(key), str) and content[key].strip():
                    chunks.append(content[key].strip())
    return "\n".join(chunks) if chunks else None


def _analysis_instructions() -> str:
    return """
You are Alpha Wolf's senior equity analyst. Analyze only the supplied live research data.
Do not invent missing facts, future prices, analyst opinions, dates, or industry ranks.
Clearly distinguish Yahoo/Wall Street consensus from your own evidence-based conclusion.
Judge the stock for the selected investment strategy and explain the decision to a beginner.
Use BUY NOW, WAIT, HOLD, or PASS language in signal and make uncertainty explicit.
Base confidence and every score on cited numerical evidence from the supplied context.
Compare performance with the supplied regional benchmark and industry leader.
Evaluate valuation, financial health, growth quality, dividend safety, technical timing,
industry position, material news, earnings/calendar risk, and historical DCA timing.
You must return a targetPrice object. Use supplied current price and any supported valuation
or analyst target evidence from the context. If the data is not strong enough for a precise
target, still provide a cautious target range midpoint and say that explicitly in basis.
You must also return an entryPrice object: a specific price level at which you would actually
place the next buy (not the same as the 12-month targetPrice, which is where the stock is
headed - entryPrice is where to buy it). Base it on the supplied support level, moving
averages, the historical post-dividend dip pattern, or a margin-of-safety discount to fair
value - cite which one you used in why. If current price already is the entry point, say so
explicitly in why rather than inventing a lower number.
The scores must appear exactly in this order: Value, Financial health, Dividend safety,
Growth, Timing. For DCA timing, say when to place the recurring buy; use the historical
post-dividend pattern only when the supplied sample supports it. Keep the result concise,
specific, and suitable for an investment decision, while noting it is not financial advice.
""".strip()
