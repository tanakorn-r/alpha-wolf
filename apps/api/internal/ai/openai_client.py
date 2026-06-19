from __future__ import annotations

import json
import os
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from internal.ai.heuristics import normalize_analysis
from internal.market.scoring import StrategyKey
from internal.store.utils import parse_json_fragment

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"
OPENAI_TIMEOUT_SECONDS = 30


def analyze_with_openai(bundle: dict[str, Any], strategy: StrategyKey) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None

    stock = bundle["stock"]
    technicals = bundle["technicals"]
    news = bundle["news"]
    prompt = {
        "symbol": stock["symbol"],
        "name": stock["name"],
        "strategy": strategy,
        "price": stock.get("price"),
        "changePct": stock.get("changePct"),
        "weeklyTrend": stock.get("weeklyTrend"),
        "strategyScores": stock.get("strategyScores"),
        "technicals": technicals,
        "recentNews": news[:5],
        "instructions": [
            "Return strict JSON only.",
            "Fields: score (1-100 integer), recommendation (short sentence), summary (2-3 sentences), reasons (array of 3-5 short bullets), future (1-2 sentence forecast), confidence (Low, Medium, High), technicalNotes (array), newsNotes (array).",
            "Use the supplied live technicals and news to justify the score.",
            "Do not mention that you are an AI model.",
        ],
    }

    payload = {
        "model": OPENAI_MODEL,
        "input": json.dumps(prompt, ensure_ascii=False),
        "temperature": 0.2,
    }
    request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (urllib_error.URLError, TimeoutError, ValueError):
        return None

    text = extract_openai_text(raw)
    if not text:
        return None

    parsed = parse_json_fragment(text)
    if not parsed:
        return None

    return normalize_analysis(parsed, bundle, strategy, raw_text=text)


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
