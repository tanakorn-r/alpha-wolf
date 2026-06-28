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
from models import QuantPerspective, StockAnalysis, TodayPerformanceResponse

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
    result = _run_openai_structured_request(
        context=context,
        schema_model=StockAnalysis,
        schema_name="stock_analysis",
        instructions=_analysis_instructions(),
        max_output_tokens=2500,
    )
    if [score.label for score in result.scores] != EXPECTED_SCORE_LABELS:
        raise OpenAIAnalysisError("OpenAI returned an invalid scorecard order")

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model}


def analyze_quant_with_openai(context: dict[str, Any]) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=QuantPerspective,
        schema_name="quant_perspective",
        instructions=_quant_instructions(),
        max_output_tokens=2200,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model}


def analyze_today_with_openai(context: dict[str, Any]) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=TodayPerformanceResponse,
        schema_name="today_performance",
        instructions=_today_performance_instructions(),
        max_output_tokens=1600,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model}


def _run_openai_structured_request(
    *,
    context: dict[str, Any],
    schema_model: type[Any],
    schema_name: str,
    instructions: str,
    max_output_tokens: int,
) -> Any:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise OpenAIAnalysisError("OPENAI_API_KEY is not configured")

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    payload = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False, separators=(",", ":")),
        "max_output_tokens": max_output_tokens,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": _strict_schema(schema_model.model_json_schema()),
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
        return schema_model.model_validate(parsed)
    except ValidationError as exc:
        raise OpenAIAnalysisError("OpenAI returned an invalid analysis shape") from exc


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
Judge the stock for the selected investment strategy and sound like Alpha Wolf's house view:
sharp, calm, specific, and hard to confuse with generic broker research.
Use BUY NOW, WAIT, HOLD, or PASS language in signal and make uncertainty explicit.
Base confidence and every score on cited numerical evidence from the supplied context.
Compare performance with the supplied regional benchmark and industry leader.
Evaluate valuation, financial health, balance-sheet risk, growth quality, earnings quality,
dividend safety, industry position, sector and market backdrop, material news, earnings/calendar
risk, historical buy timing patterns, and only then technical timing.
Do not let chart structure dominate the call unless the supplied business and financial evidence
is weak or contradictory. A stock with weak financial quality should not receive a strong bullish
call just because momentum looks good. A strong business with a stretched chart can still be a
WAIT instead of BUY NOW.
You must explicitly balance four lenses in your reasoning:
1. Business and financial quality
2. Market and sector backdrop
3. Valuation and dividend profile
4. Technical entry timing
Use the supplied platform verdict, platform outlook, market comparison, financial research,
sector/industry research, dividend pattern, and news to build a balanced view.
Your target price must be Alpha Wolf's own 12-month house target, not a copy of Wall Street.
Use analyst targets only as one input. Build your target from the supplied valuation, growth,
profitability, balance-sheet quality, sector backdrop, and market comparison. If Wall Street's
target is the same direction but your own evidence points to a different level, use your own
level and explain why briefly in basis.
If the data is not strong enough for a precise target, still provide a cautious target range
midpoint and say that explicitly in basis.
You must also return an entryPrice object: a specific price level at which you would actually
place the next buy (not the same as the 12-month targetPrice, which is where the stock is
headed - entryPrice is where to buy it). Base it on the supplied support level, moving
averages, the historical post-dividend dip pattern, a benchmark-relative reset, or a
margin-of-safety discount to fair
value - cite which one you used in why. If current price already is the entry point, say so
explicitly in why rather than inventing a lower number.
The scores must appear exactly in this order: Value, Financial health, Dividend safety,
Growth, Timing. For Timing, say when to buy, wait, or demand a better reset; use the historical
post-dividend pattern only when the supplied sample supports it. Avoid padded explanations and
generic broker language. Every sentence should help the investor decide.
""".strip()


def _quant_instructions() -> str:
    return """
You are Alpha Wolf's quant trading analyst. Analyze only the supplied live research data.
Do not invent missing facts, prices, indicators, ranks, or signals.
This is a separate quant perspective, not a long-form valuation memo, but it still must be
balanced. Do not behave like a pure chart reader.
Start from market context and business risk, then refine the decision with technical timing.
Sound like Alpha Wolf's tactical desk: direct, high-signal, and more useful than a generic
TradingView recap.
Focus on:
- technical structure, momentum, volatility, moving-average alignment, support, resistance,
  trend quality, benchmark-relative behavior, and entry timing quality
- plus earnings quality, growth direction, dividend/event timing, sector strength, benchmark
  behavior, and whether the business backdrop supports or weakens the setup
Answer the practical question: is this investable right now, should the user wait,
or should the user avoid it until the setup improves?
Use investability values exactly: FAVORABLE, WATCH, or AVOID.
Use signal language that sounds decisive but honest: for example Trend intact, Wait for pullback,
Setup weak, Momentum improving, or Breakdown risk.
If the chart looks good but the business, earnings trend, sector backdrop, or event risk looks
fragile, say so clearly and downgrade the setup. If the business backdrop is solid but timing is
poor, the answer should lean toward WAIT rather than overreacting to near-term momentum.
Do not settle for generic insights like "momentum is constructive" unless you immediately explain
what that changes for the actual trade location, risk, or timing.
Lead with a hook, not a generic summary. The hook should feel like a sharp trading takeaway:
for example "RSI is 65.6 and price is sitting at 92.75 just below 93.75 resistance. Momentum
is constructive, but I would wait for either a breakout through 93.75 on volume or a pullback
toward 88.4-89.0."
You must return:
- buyScore: an integer from 1 to 100 answering "how attractive is this to buy now?"
100 means excellent buy timing with strong support from business, market, and technical context.
50 means mixed or average.
1 means clearly avoid for now.
Do not anchor on the same number every time. Let the score move meaningfully with the actual setup.
- hook: a punchy, short setup summary under 220 characters when possible. It must mention the
current price and at least one concrete technical reference such as RSI, MACD, support,
resistance, or moving averages. It should sound like a trader's takeaway, not a memo.
- nextActionWindow: only use a specific timing phrase when the setup truly depends on it; do not
default to "next 2-3 sessions". Use short phrases like "near-term", "this week", or "on breakout"
when that is more accurate.
- buyPlan: the concrete buy instruction, including price area or breakout condition. Use plain
language for a beginner. Avoid jargon like "reclaim", "scale in", "risk tight", "fade", or
"chase strength". Prefer wording like "buy only if price closes above X and volume is at least
Y shares or Yx average" or "wait and buy closer to X-Y if price pulls back". Keep it under 35
words when possible. When context includes average volume or volume ratio, use explicit numbers
instead of saying only "stronger volume".
The checks array must contain 4 to 6 concrete items with exact values pulled from context
when available, and each item must explain why it matters. At least one check should reflect
business or financial context when the supplied data supports it, not only chart indicators.
The tradingViewFocus list must tell the user exactly what to inspect next on the chart.
Keep the result concise, tactical, and useful for a person deciding whether to deploy cash now.
If there is no real edge, say so plainly instead of manufacturing excitement.
""".strip()


def _today_performance_instructions() -> str:
    return """
You are Alpha Wolf's session analyst. Analyze only the supplied live research data.
This call is about today's move only: what happened in this session, whether it matters,
and what it changes about the setup relative to older price behavior.
Do not invent intraday facts, volume, catalysts, or future prices.
Use the latest daily move, technical levels, recent history, market comparison, news, and
business context to decide whether today improved the setup, damaged it, or changed nothing.
Do not write a full valuation memo. This should read like a sharp desk note after the close.
Return:
- signal: a short call like IMPROVING, NOTHING NEW, STRETCHED, BREAKING DOWN, or WATCH CLOSELY
- tone: good, warn, or bad
- buyScore: 1 to 100 answering "after today's session, how attractive is this to buy now?"
- headline: one sharp line that says what today's move means
- summary: 2 short sentences max, with the main conclusion
- sessionRead: what today's move says versus the stock's normal behavior and trend
- whatChangedToday: the one thing that changed today, or say plainly that nothing important changed
- keyLevel: one exact price level or zone the investor should watch next
- action: one exact next step, with numbers when possible
- risk: the main way today's move could be misleading
Avoid generic lines like "momentum is constructive" unless you also say what changed in the setup.
If today's move is just noise, say so clearly.
""".strip()
