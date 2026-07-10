from __future__ import annotations

import json
import os
from datetime import datetime, timezone
import ssl
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import certifi
from pydantic import ValidationError

from internal.ai.agents import agent_badge, compose_instructions
from internal.store.utils import parse_json_fragment
from models import BuyTimingNarrative, PortfolioReview, QuantPerspective, StockAnalysis, StrategyPlaybook, TechnicalMovesPrediction, TodayPerformance, ValuationVerdict

OPENAI_TIMEOUT_SECONDS = 45
DEFAULT_OPENAI_MODEL = "gpt-5.5"
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


def analyze_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    strategy = str(context.get("selectedStrategy") or "").strip().lower()
    is_holding = bool((context.get("positionContext") or {}).get("isHolding"))
    result = _run_openai_structured_request(
        context=context,
        schema_model=StockAnalysis,
        schema_name="stock_analysis",
        instructions=compose_instructions(_analysis_instructions_for_strategy(strategy, is_holding=is_holding), agent_id),
        max_output_tokens=2500,
    )
    if [score.label for score in result.scores] != EXPECTED_SCORE_LABELS:
        raise OpenAIAnalysisError("OpenAI returned an invalid scorecard order")
    result = _calibrate_stock_analysis_for_agent(context, result, agent_id)
    result = _calibrate_stock_signal(context, result)

    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def analyze_quant_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=QuantPerspective,
        schema_name="quant_perspective",
        instructions=compose_instructions(_quant_instructions(), agent_id),
        max_output_tokens=2200,
    )
    result = _calibrate_quant_result(context, result)
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def analyze_valuation_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=ValuationVerdict,
        schema_name="valuation_verdict",
        instructions=compose_instructions(_valuation_instructions(), agent_id),
        max_output_tokens=1800,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def _calibrate_quant_result(context: dict[str, Any], result: QuantPerspective) -> QuantPerspective:
    scorecard = context.get("quantScorecard") or {}
    anchor = scorecard.get("score")
    if not isinstance(anchor, int | float):
        return result
    anchor_score = max(1, min(100, int(round(anchor))))
    if abs(result.buyScore - anchor_score) <= 8:
        return result

    adjusted = result.model_copy(update={"buyScore": anchor_score})
    if anchor_score >= 75 and adjusted.tone == "bad":
        adjusted = adjusted.model_copy(update={"tone": "good" if adjusted.investability == "FAVORABLE" else "warn"})
    if anchor_score <= 40 and adjusted.tone == "good":
        adjusted = adjusted.model_copy(update={"tone": "bad" if adjusted.investability == "AVOID" else "warn"})
    return adjusted


def _calibrate_stock_analysis_for_agent(context: dict[str, Any], result: StockAnalysis, agent_id: str | None) -> StockAnalysis:
    agent = (agent_id or "vera").strip().lower()
    scores = {score.label: score.score for score in result.scores}
    quant = context.get("quantScorecard") or {}
    components = quant.get("componentScores") if isinstance(quant.get("componentScores"), dict) else {}
    quant_score = _num(quant.get("score"))
    technical = _num(components.get("technicalTiming"))
    swing = _num(components.get("swingEntry"))
    business = _num(components.get("businessQuality"))
    relative = _num(components.get("relativeStrength"))

    value = float(scores.get("Value", result.confidence))
    health = float(scores.get("Financial health", result.confidence))
    dividend = float(scores.get("Dividend safety", result.confidence))
    growth = float(scores.get("Growth", result.confidence))
    timing = float(scores.get("Timing", result.confidence))

    if agent == "rex":
        raw = _weighted(
            (timing, 0.42),
            (technical, 0.18),
            (swing, 0.18),
            (relative, 0.10),
            (growth, 0.07),
            (value, 0.05),
        )
        calibrated = raw - 3
    elif agent == "kai":
        raw = _weighted(
            (timing, 0.34),
            (technical, 0.24),
            (relative, 0.18),
            (swing, 0.12),
            (growth, 0.08),
            (value, 0.04),
        )
        calibrated = raw + 5
    elif agent == "nadia":
        raw = _weighted(
            (quant_score, 0.28),
            (relative, 0.18),
            (technical, 0.14),
            (value, 0.13),
            (health, 0.13),
            (growth, 0.08),
            (timing, 0.06),
        )
        calibrated = raw + (0 if raw < 75 else -2)
    elif agent == "sam":
        raw = _weighted(
            (dividend, 0.34),
            (health, 0.24),
            (value, 0.16),
            (business, 0.12),
            (growth, 0.08),
            (timing, 0.06),
        )
        calibrated = raw + 2
    elif agent == "ben":
        raw = _weighted(
            (business, 0.32),
            (health, 0.27),
            (growth, 0.17),
            (dividend, 0.10),
            (value, 0.09),
            (timing, 0.05),
        )
        calibrated = raw + (4 if raw >= 68 else -4 if raw <= 45 else 0)
    elif agent == "alphawolf":
        raw = _weighted(
            (value, 0.18),
            (health, 0.18),
            (business, 0.16),
            (timing, 0.16),
            (technical, 0.10),
            (dividend, 0.10),
            (relative, 0.07),
            (growth, 0.05),
        )
        calibrated = raw + (3 if raw >= 72 else -3 if raw <= 42 else 0)
    else:
        raw = _weighted(
            (value, 0.30),
            (health, 0.25),
            (dividend, 0.18),
            (business, 0.12),
            (growth, 0.10),
            (timing, 0.05),
        )
        calibrated = raw

    calibrated = _expand_conviction(calibrated)
    calibrated = _apply_market_evidence_adjustments(calibrated, result)

    # Let the Agent lens lead. The model still contributes, but generic caution should not pin
    # every answer to the 50-60 band when supplied evidence is clearer than that.
    blended = round(0.18 * result.confidence + 0.82 * calibrated)
    return result.model_copy(update={"confidence": int(_clamp(blended, 1, 100))})


def _expand_conviction(score: float) -> float:
    distance = score - 50.0
    if abs(distance) < 4:
        return score
    multiplier = 1.42 if abs(distance) >= 12 else 1.24
    return 50.0 + distance * multiplier


def _apply_market_evidence_adjustments(score: float, result: StockAnalysis) -> float:
    target_move = _num(result.targetPrice.impliedUpsidePct)
    entry_gap = _num(result.entryPrice.distanceFromCurrentPct)
    scorecard = {item.label: float(item.score) for item in result.scores}
    best = max(scorecard.values(), default=score)
    worst = min(scorecard.values(), default=score)

    adjusted = score
    if target_move is not None:
        adjusted += 7 if target_move >= 18 else 4 if target_move >= 10 else -7 if target_move <= -5 else -3 if target_move < 2 else 0
    if entry_gap is not None:
        adjusted += 4 if entry_gap <= 0 else -5 if entry_gap >= 8 else -2 if entry_gap >= 4 else 0
    if best >= 78 and worst >= 50:
        adjusted += 4
    if worst <= 35:
        adjusted -= 5
    return adjusted


def _calibrate_stock_signal(context: dict[str, Any], result: StockAnalysis) -> StockAnalysis:
    if bool((context.get("positionContext") or {}).get("isHolding")):
        signal, tone = _holding_signal_from_score(result.confidence)
        target_move = _num(result.targetPrice.impliedUpsidePct)
        entry_gap = _num(result.entryPrice.distanceFromCurrentPct)
        if target_move is not None and target_move < -3 and result.confidence < 60:
            signal, tone = ("SELL / REDUCE", "bad") if result.confidence < 48 else ("TRIM / PROTECT", "warn")
        elif entry_gap is not None and entry_gap > 6 and result.confidence < 75 and signal in {"BUY MORE", "ADD"}:
            signal, tone = "HOLD, WAIT TO ADD", "warn"
        return result.model_copy(update={"signal": signal, "tone": tone})

    signal, tone = _signal_from_score(result.confidence)
    target_move = _num(result.targetPrice.impliedUpsidePct)
    if target_move is not None and target_move < -3 and result.confidence < 65:
        signal, tone = ("PASS", "bad") if result.confidence < 50 else ("WATCH", "warn")
    return result.model_copy(update={"signal": signal, "tone": tone})


def _signal_from_score(score: int) -> tuple[str, str]:
    if score >= 82:
        return "STRONG BUY", "good"
    if score >= 68:
        return "BUY", "good"
    if score >= 55:
        return "ACCUMULATE", "warn"
    if score >= 40:
        return "WATCH", "warn"
    return "PASS", "bad"


def _holding_signal_from_score(score: int) -> tuple[str, str]:
    if score >= 82:
        return "BUY MORE", "good"
    if score >= 68:
        return "HOLD / ADD ON DIPS", "good"
    if score >= 55:
        return "HOLD, WAIT TO ADD", "warn"
    if score >= 40:
        return "HOLD, MONITOR RISK", "warn"
    return "SELL / REDUCE", "bad"


def _weighted(*items: tuple[float | None, float]) -> float:
    total = 0.0
    weight = 0.0
    for value, item_weight in items:
        if value is None:
            continue
        total += float(value) * item_weight
        weight += item_weight
    return total / weight if weight else 50.0


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _clamp(value: float, low: int, high: int) -> float:
    return max(low, min(high, value))


def analyze_today_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=TodayPerformance,
        schema_name="today_performance",
        instructions=compose_instructions(_today_performance_instructions(), agent_id),
        max_output_tokens=1600,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def analyze_buy_timing_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=BuyTimingNarrative,
        schema_name="buy_timing_narrative",
        instructions=compose_instructions(_buy_timing_instructions(), agent_id),
        max_output_tokens=900,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def recommend_strategy_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=StrategyPlaybook,
        schema_name="strategy_playbook",
        instructions=compose_instructions(_strategy_recommendations_instructions(), agent_id),
        max_output_tokens=2400,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def predict_technical_moves_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    try:
        result = _run_openai_structured_request(
            context=context,
            schema_model=TechnicalMovesPrediction,
            schema_name="technical_moves_prediction",
            instructions=compose_instructions(_technical_moves_instructions(), agent_id),
            max_output_tokens=3600,
            tools=[{"type": "web_search"}],
        )
    except OpenAIAnalysisError as exc:
        if "HTTP 400" not in str(exc):
            raise
        result = _run_openai_structured_request(
            context=context,
            schema_model=TechnicalMovesPrediction,
            schema_name="technical_moves_prediction",
            instructions=compose_instructions(_technical_moves_instructions(), agent_id),
            max_output_tokens=3600,
            tools=[{"type": "web_search_preview"}],
        )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def review_portfolio_with_openai(context: dict[str, Any], agent_id: str | None = None) -> dict[str, Any]:
    result = _run_openai_structured_request(
        context=context,
        schema_model=PortfolioReview,
        schema_name="portfolio_review",
        instructions=compose_instructions(_portfolio_review_instructions(), agent_id),
        max_output_tokens=1800,
    )
    model = os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL
    return {**result.model_dump(), "source": "openai", "model": model, "agent": agent_badge(agent_id), "generatedAt": datetime.now(timezone.utc).isoformat()}


def _run_openai_structured_request(
    *,
    context: dict[str, Any],
    schema_model: type[Any],
    schema_name: str,
    instructions: str,
    max_output_tokens: int,
    tools: list[dict[str, Any]] | None = None,
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
    if tools:
        payload["tools"] = tools
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


def _analysis_instructions_for_strategy(strategy: str, *, is_holding: bool = False) -> str:
    if is_holding:
        return _holding_analysis_instructions()
    if strategy == "momentum":
        return _momentum_analysis_instructions()
    return _analysis_instructions()


def _buy_timing_instructions() -> str:
    return """
You write Alpha Wolf's Buy Timing call from supplied calculated market data only.
Do not invent dates, dividend amounts, hit rates, prices, seasonality, or future events.
If the supplied dividend history is thin or the next ex-dividend date is inferred, say that plainly.
Use the calculated buyWindow, trimWindow, postExDipPattern, current cycle position, entry band,
priceContext (5-year average price, 5-year low/high, and where today's price sits inside that
range), and technical context to decide BUY, WAIT, TRIM, or AVOID.
Judge cheap-vs-expensive against the 5-year priceContext, not just the short-term entry band: a
stock whose price sits in the top of its 5-year range (high currentPct) is NOT cheap even if a
3-month pullback occurred — prefer WAIT or TRIM there. Favor BUY when price is in the lower part
of the 5-year range AND at the post-ex reversal dip.
Never recommend BUY just because the stock is green or running up. BUY only when price is at or
below the supplied entry zone with target upside remaining and it is not near its 5-year high, or
when the post-ex dip (reversal) window is open and price has pulled back into the entry zone. If
price is above entry or near the 5-year high, say WAIT.
Return concise JSON only. The headline should sound like a direct trading instruction.
The summary should explain why in 1-2 sentences with the key numbers supplied.
recap: a plain-words recap a beginner can act on — say directly whether to buy now or wait, and
if waiting, roughly how long (use the supplied buyWindow opensInDays/dates; if unconfirmed, say
so). One or two short sentences, no jargon.
agentFit: judge whether buying at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, explaining that fit using your persona's priorities
and the supplied numbers only.
"""


def _valuation_instructions() -> str:
    return """
You are Alpha Wolf's valuation AI for Hunt AI Daily Signals. Analyze only the supplied live
research data. Your job is to answer whether buying now is cheap, fair, or chasing.

Write like a confident portfolio operator, not a cautious generic analyst. The user wants a
plain-money verdict: "load up", "standard buy", "wait", "skip this month", or "trap".

Core lens:
- Start from structural asset floor and dividend/cash yield, then judge whether the current price
  is a discount, a fair DCA point, or a chase trap.
- Separate collapse risk from price risk. If supplied data shows a state-backed, conglomerate-backed,
  regulated, infrastructure, hospital, bank, utility, or other permanent asset, say plainly that
  disappearance/collapse is not the main risk; overpaying is the risk.
- For book-value-heavy businesses, use book value, P/BV, 52-week lows/support, and institutional
  floor logic. For cash-flow/yield assets, use distribution safety, yield, lease/concession life,
  and whether the payout is true income or capital return.
- A high-quality company can still be a bad buy today if price is far above its floor. Say that
  directly.
- A beaten-down asset can be a good DCA target only if the floor/yield/business permanence supports it.

This is an AI judgment, not a fixed formula: reason over sector structure, business permanence,
normal valuation ranges, P/BV, P/E, book value per share, dividend yield, growth quality,
profitability, balance-sheet risk, current price, YTD move, technical stretch, peer/benchmark
context, sector/industry research, and recent news when supplied.

Hard guardrails:
- Do not invent prices, book value, P/BV, P/E, yields, sector facts, peers, dates, or policy links.
- If book value per share is not directly supplied, you may infer it only as currentPrice / P/BV
  when both numbers are supplied. Say less rather than pretending precision.
- If a structural P/BV floor is not supplied, infer a conservative floor only from the supplied
  company/sector context and label it as an inferred floor in prose. For banks or book-value-heavy
  financials, P/BV can be central; for other sectors, do not overuse P/BV.
- The UI supplies labels; return concise investor wording, not generic broker language.
- Use the user's real-money lens: should they add now, wait for a better entry zone, trim, or avoid?
- Keep verdict and action consistent. Use DISCOUNT with BUY only when the current setup is
  actionable or clearly accumulatable now. If valuation is optically low but resistance,
  technical stretch, balance-sheet risk, or sector risk makes the answer wait for a pullback,
  use FAIR with WAIT and make the entry/add-back anchors explicit.
- Do not downgrade a true value-zone setup to WAIT just because it is not the absolute bottom.
  If current price is already at/near the structural floor, below book, in a deep discount band,
  or offering a strong covered yield with no supplied collapse red flag, use rightNow.action BUY.
  The note can say "DCA here; add heavier near X" or "small buy now, larger add-back at X".
- Reserve WAIT for fair/expensive prices, chase-risk setups, thin data, or cases where the current
  price is meaningfully above the value band. Nearby resistance alone is not enough to say WAIT
  when the asset is already in a discount/value zone; it should become measured DCA/ACCUMULATE.

Voice requirements:
- Be decisive. Prefer "This is a chase", "This is a fair DCA", "This is a value zone", or
  "Skip this month" over vague probability language.
- Use vivid but professional labels when supported: "chase trap", "safe DCA zone", "value zone",
  "yield trap", "floor is doing the work", "price is the problem".
- Mention the structural floor/add-back zone in the narrative or rightNow.note whenever the data
  supports one.
- Mention yield when it is meaningful: say whether the user is paid to wait, underpaid for the
  risk, or being fooled by an unsustainable/amortizing distribution.
- If the asset is an infrastructure fund, REIT, trust, or concession-style vehicle and the supplied
  data suggests finite life/amortization/capital return, do not treat it like a normal stock floor.

Return strictly valid JSON matching the ValuationVerdict schema:
- verdict: CHASING, FAIR, DISCOUNT, or INSUFFICIENT_DATA.
- chasingAnswer: direct sentence starting with Yes, No, or Not enough data when possible.
- narrative: 1-2 confident sentences explaining the structural valuation call with key supplied numbers.
- rightNow.action: BUY, WAIT, TRIM, or AVOID.
- rightNow.entryOnlyAt: exact add-back / entry price if justified, otherwise null.
- rightNow.pctAway: percent from current price to entryOnlyAt if both are known; negative means entry is below current price.
- rightNow.conviction: 0-100 for the verdict quality, not upside.
- metrics: echo only supplied/inferred numeric metrics; null when unavailable.
- structureBand.discountAnchor: practical cheap/add-back anchor if justified.
- structureBand.fairAnchor: fair/book/normal anchor if justified.
- structureBand.now: current price when supplied.
- structureBand.zoneLabel: short label such as DISCOUNT, FAIR, CHASING, or UNKNOWN.
- whatAiSees: 2-5 crisp evidence bullets.
- thePlay.text: exact instruction for this month.
- thePlay.addBackLow/addBackHigh: add-back zone bounds when justified, otherwise null.

If the supplied data is too thin for a valuation call, use INSUFFICIENT_DATA and explain exactly
which missing metrics prevent a real verdict.
Also return these persona fields:
recap: a plain-words recap a beginner can act on — say directly what to do now (buy / wait / skip)
and, if waiting, roughly what to wait for, using only the supplied data. 1-2 short sentences.
agentFit: judge whether acting at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
""".strip()


def _analysis_instructions() -> str:
    return """
You are Alpha Wolf's senior equity analyst. Analyze only the supplied live research data.
Do not invent missing facts, future prices, analyst opinions, dates, or industry ranks.
Clearly distinguish Yahoo/Wall Street consensus from your own evidence-based conclusion.
Judge the stock for the selected investment strategy in the active Agent's own voice.
The user does NOT own this stock in this mode. Answer whether to buy now, wait for a better
entry, accumulate gradually, or pass. Do not say "keep holding" or analyze unrealized P/L.
The summary should feel like the selected Agent wrote it naturally, not like a fixed house template.
Use the five-level action scale in signal language: STRONG BUY, BUY, ACCUMULATE, WATCH, or PASS.
Do not flatten medium scores into WAIT: a 55-67 setup is ACCUMULATE, a 40-54 setup is WATCH.
Make uncertainty explicit in the reasoning, not by using the same label for every score.
Base confidence and every score on cited numerical evidence from the supplied context.
Compare performance with the supplied regional benchmark and industry leader.
Evaluate valuation, financial health, balance-sheet risk, growth quality, earnings quality,
dividend safety, industry position, sector and market backdrop, material news, earnings/calendar
risk, historical buy timing patterns, and only then technical timing.
These four lenses are all available to you:
1. Business and financial quality
2. Market and sector backdrop
3. Valuation and dividend profile
4. Technical entry timing
Weight them the way YOUR persona actually thinks — lead from your dominant trait and do not give
equal airtime to lenses you would not personally act on. A data/quality-led agent should not hand a
strong bullish call to weak financials just because momentum looks good, and can still say WAIT on a
strong business with a stretched chart. An instinct/momentum-led agent should lead with price action
and give a fast decisive call, not lecture about fundamentals it would not trade on. Only cross into
another lens when it would actually flip your call, and say so in one line.
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
generic broker language. Keep the JSON shape, but let wording, rhythm, and attitude follow the
active Agent's outputStyle.
Also return these persona fields:
recap: a plain-words recap a beginner can act on — say directly what to do now (buy / wait / skip)
and, if waiting, roughly what to wait for, using only the supplied data. 1-2 short sentences.
agentFit: judge whether acting at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
""".strip()


def _holding_analysis_instructions() -> str:
    return """
You are Alpha Wolf's senior portfolio analyst. Analyze only the supplied live research data and
positionContext. The user ALREADY OWNS this stock.

This is not a buy-candidate report. Your main question is:
"Should the user worry about today's price, keep holding, buy more, trim, or sell?"

Hard separation from non-holding analysis:
- Do not use WATCH as the main signal. WATCH is a queue/status word, not a portfolio action.
- The signal must be a holding action such as HOLD, HOLD / ADD ON DIPS, HOLD, WAIT TO ADD,
  BUY MORE, TRIM / PROTECT, or SELL / REDUCE.
- If the setup is not clean enough to add but there is no broken thesis or risk trigger, say
  HOLD or HOLD, WAIT TO ADD. Do not tell an existing holder merely to "watch".
- If current price is down but the business/income/thesis remains intact, answer whether the user
  can stay with it and what price/risk line would make them worry.
- If current price has broken supplied risk levels, balance sheet/dividend safety is poor, or target
  downside is material, say TRIM / PROTECT or SELL / REDUCE.
- If the user already owns it and the evidence is strong, say BUY MORE or HOLD / ADD ON DIPS and
  define the add zone/size discipline.

Use positionContext directly:
- Mention that the user holds the stock when relevant.
- Use supplied shares, value, gain/loss, monthly DCA, and strategy when available.
- Judge whether today's price threatens the position, improves the add opportunity, or is just noise.

Target and entry fields in this holding mode:
- targetPrice remains Alpha Wolf's 12-month house target or risk-adjusted fair target.
- entryPrice means the next add/average-down price for an existing holder, not first-buy entry.
  If the user should not add, still provide the price that would make adding reasonable and explain.

The scores must appear exactly in this order: Value, Financial health, Dividend safety,
Growth, Timing. For Timing, score whether this is a good time to keep/add/trim, not simply whether
a new buyer should enter.

Write like the selected Agent, but keep the output concrete and portfolio-actionable. The investor
must be able to answer: stay with it, add more, trim, or sell.

Also return these persona fields:
recap: a plain-words recap a beginner who already owns the stock can act on. Say directly whether
to hold, add, trim, or sell, and what would change that call. 1-2 short sentences.
agentFit: judge whether KEEPING or ADDING at the current price fits YOUR OWN trading style and
strategy as the persona you were given — "aligned", "neutral", or "against".
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
""".strip()


def _momentum_analysis_instructions() -> str:
    return """
[SYSTEM]
You are Alpha Wolf's quantitative trading AI agent. Analyze only the supplied live research data.
Your task is to return a structured, stock-specific trade setup for the selected Momentum strategy.
Do not apply generic market rules. Interpret technicals, fundamentals, market context, news, and
historical price behavior through this specific stock's behavior profile as inferred from the
supplied context.

[ASSET BEHAVIOR PROFILE]
Infer the asset behavior profile from the supplied stock, business, performance, technicals,
priceHistory, marketComparison, sectorAndIndustryResearch, dividendDipPattern, financialResearch,
and recentNews fields.
Use concrete evidence only. If a behavior profile detail is not supported by supplied data, say
that it is not proven instead of inventing it.
Profile dimensions to consider:
- sector and nature: growth cyclicality, defensive income, commodity sensitivity, financial/bank,
  ETF/index proxy, high-beta tech, or other evidence-backed profile
- volatility and beta: normal trading range, volume behavior, drawdown behavior, benchmark-relative
  movement, and whether RSI/overbought readings usually matter for this asset
- asset-specific quirks: post-dividend dips, mean reversion near key moving averages, earnings/news
  sensitivity, resistance behavior, support retests, or trend persistence
- alternative-data sensitivity: sector, macro, regional, budget/policy, consumption, digital
  transaction, rate, currency, or commodity sensitivity only when supplied context supports it

[CURRENT MARKET DATA]
Treat the supplied JSON input as the current market data:
- current price and daily move from stock
- technical indicators from technicals and priceHistory
- fundamentals from business and financialResearch
- catalysts/news from recentNews
- market/sector backdrop from marketComparison and sectorAndIndustryResearch

[INSTRUCTIONS]
1. Cross-reference current market data against the inferred asset behavior profile.
2. Decide whether the current setup aligns with how this specific stock historically generates
   tradable momentum alpha.
3. Calculate practical entryPrice, stop-loss implication, and targetPrice from the stock's normal
   trading range, support/resistance, moving averages, volatility, recent volume, market backdrop,
   and business risk. Do not copy Wall Street target blindly.
4. Return a decisive but honest trade setup. Use the five-level action scale in signal language:
   STRONG BUY, BUY, ACCUMULATE, WATCH, or PASS. If the setup is not clean, prefer WATCH or PASS.
5. Keep the answer high-signal and numerical. Avoid broker-style filler and generic lines like
   "momentum is constructive" unless you tie it to exact price behavior and risk.

[OUTPUT CONTRACT]
Return strictly valid JSON matching the StockAnalysis schema. Do not add extra keys.
Map the trade setup into the existing schema as follows:
- signal: one of STRONG BUY, BUY, ACCUMULATE, WATCH, or PASS when possible
- confidence: conviction_score from 0-100 for "should buy this now under Momentum?"
- entryPrice.entryPrice: practical entry target
- entryPrice.why: explain whether the entry is a pullback zone, breakout trigger, or current-price entry
- targetPrice.targetPrice: take-profit / 12-month tactical target depending on evidence; basis must say which
- targetPrice.basis: explain if target is a trade target, 12-month target, or cautious midpoint
- scores: exactly this order: Value, Financial health, Dividend safety, Growth, Timing
- summary: short reasoning_summary linking current data to the asset's unique profile
- bullets: 2 to 4 specific trade checks with exact values when available
- dcaTiming: if not relevant to momentum, say "Not a DCA timing call; this is a momentum trade setup."

The investor must be able to answer: buy now, wait for exact price X, or pass.
Also return these persona fields:
recap: a plain-words recap a beginner can act on — say directly what to do now (buy / wait / skip)
and, if waiting, roughly what to wait for, using only the supplied data. 1-2 short sentences.
agentFit: judge whether acting at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
""".strip()


def _quant_instructions() -> str:
    return """
You are Alpha Wolf's real-money investing agent. Analyze only the supplied live research data.
Do not invent missing facts, prices, indicators, ranks, signals, or news.

Use agentProfile only as the role and decision framework. The UI already supplies section titles;
you write the actual wording naturally from the data. Do not copy template phrases from the
prompt, the agent profile, or quantScorecard.

Think privately like a professional investor:
1. Classify the setup and decide whether it is actionable now.
2. Judge entry quality, reward/risk, support/resistance, trend, volume, and volatility.
   For Swing Trade, define a good setup as price near a low/support zone or just turning up
   from it. An already-extended winner near resistance is FOMO/Momentum, not a Swing buy.
3. Weigh fundamentals, valuation, dividends, earnings/growth, industry rank, market comparison,
   sector/industry research, news, and event context.
4. Decide whether this is BUY, WATCH, or AVOID for the selected strategy.

Do not over-focus on RSI. Mention RSI only if it materially changes the decision, and pair it
with other evidence. A useful answer should combine multiple evidence families when available:
price action, volume, support/resistance, business quality, valuation/upside, income/catalysts,
relative strength, sector/market context, and news.

The input includes quantScorecard. Use it as numeric context, especially componentScores.swingEntry
for momentum/swing mode, but do not copy its positives/negatives as prose. You may disagree with
the scorecard if the full evidence supports it.

Return strictly valid JSON matching the QuantPerspective schema:
- signal: your original short desk call, not a template.
- tone: good, warn, or bad.
- buyScore: 1 to 100. Use the full range. For swing mode, 75+ requires a support/low-zone
  turning-point entry, not merely a winning stock or hot breakout.
- investability: FAVORABLE, WATCH, or AVOID.
- hook: one natural, stock-specific takeaway under 220 characters when possible.
- nextActionWindow: a concise timing phrase.
- buyPlan: the exact practical entry/wait/pass instruction with numbers when justified.
- summary: a concise thesis in your own words.
- setup: setup classification plus whether it is actionable now.
- trigger: the condition that would improve or invalidate the idea.
- risk: the main investor risk.
- checks: 4 to 6 mixed evidence checks. Do not make them all technical. Include fundamentals,
  valuation/upside, income/catalyst, sector/market, or news when supplied data supports it.
- tradingViewFocus: 2 to 4 concrete chart items to inspect next.

Keep it concise, tactical, and specific. If there is no edge, say so plainly.
Also return these persona fields:
recap: a plain-words recap a beginner can act on — say directly what to do now (buy / wait / skip)
and, if waiting, roughly what to wait for, using only the supplied data. 1-2 short sentences.
agentFit: judge whether acting at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
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


def _strategy_recommendations_instructions() -> str:
    return """
You are Alpha Wolf's strategy allocator. Select the best stocks for the user's supplied strategy
using only the candidate list in the input JSON. Do not invent tickers, prices, company facts,
news, or rankings outside the supplied candidates.

The backend already pre-ranked a realistic candidate pool from Alpha Wolf's live stock universe.
Your job is the final top-5 judgment: match the user's strategy intent to the available stocks,
balance reward against risk, and explain the practical trade or investment case.

Rules:
- Return only tickers present in candidates.
- Pick at most requestedLimit stocks. Prefer 5 when there are enough candidates.
- Rank picks from strongest fit to weakest fit.
- Use concise house-view language, not generic broker prose.
- action should be a short command such as BUY SETUP, WATCH, WAIT, INCOME BUY, or PASS.
- conviction is 0-100 and should reflect fit for this exact strategy, not general quality.
- entry, target, stop, riskReward, and upsidePct may be null if the supplied candidate data does
  not justify a number. Do not manufacture precision.
- For momentum, day trade, swing, or FOMO strategies, prioritize trend, weekly move, change,
  liquidity proxy, and timing quality.
- For long-term, value, capital, DCA, dividend, or income strategies, prioritize business quality
  proxy, market cap, lower volatility proxy, dividend yield, valuation/quality hints, and steadier
  strategy scores.

Return strictly valid JSON matching the StrategyPlaybook schema. Do not add extra keys.
The headline should summarize the strategy result. marketRead should say what the candidate set
currently favors and what risk would invalidate the top picks.
Also return these persona fields:
recap: a plain-words recap a beginner can act on — say directly what to do now (buy / wait / skip)
and, if waiting, roughly what to wait for, using only the supplied data. 1-2 short sentences.
agentFit: judge whether acting at the CURRENT price fits YOUR OWN trading style and strategy as
the persona you were given — "aligned" (exactly a setup you would take), "neutral" (acceptable
but not your ideal setup), or "against" (your strategy says stay out here).
agentFitReason: one sentence, first person, in your persona's voice, explaining that fit from
your priorities and the supplied numbers only.
""".strip()


def _technical_moves_instructions() -> str:
    return """
You are Alpha Wolf's premium technical forecasting desk. This is the "Next 10 Moves" feature.
Use the supplied yfinance research context first: price history, technical indicators, volume,
support/resistance, moving averages, volatility, business context, market comparison, sector
context, dividend/event timing, recent news, and historical move distribution.
You may use web search to check fresh news, macro context, budget/policy issues, earnings
updates, sector catalysts, and material company events. Do not invent facts. If a fresh fact is
uncertain, keep it out of the numeric path and mention it only as risk.

Predict the next 10 likely technical moves from the current price. These are not entry zones
and not a forced bullish scenario. They can be up, down, or flat-ish. Think like a technical
expert watching market structure: trend exhaustion, failed breakout, resistance rejection,
support retest, volatility compression, momentum divergence, gap fill, mean reversion,
continuation, distribution, accumulation, or Elliott-wave-style impulse/correction when the
price structure genuinely supports that read.

This must be a coherent scenario, not random swing noise.
Before writing the 10 moves, choose exactly one pathBias:
- BULLISH_CONTINUATION: trend extends with shallow pauses
- PULLBACK_THEN_BOUNCE: price cools off first, then recovers
- RESISTANCE_REJECTION: price fails near resistance and drifts lower
- SIDEWAYS_COMPRESSION: price chops in a tight range while volatility compresses
- BREAKDOWN_RISK: support fails and downside risk dominates
- VOLATILE_RANGE: a true range-bound tape with wider two-sided moves

Path discipline rules:
- directionChanges must count sign changes across the 10 moves and must be 0 to 3.
- Do not alternate up/down/up/down. That is noise, not a forecast.
- Most paths should have at least 3 consecutive moves in the same direction before reversing.
- Use more than 2 direction changes only when volatility, support/resistance distance, or
  a fresh catalyst clearly supports a volatile range.
- If the setup is unclear, return SIDEWAYS_COMPRESSION with small moves instead of a zig-zag.
- Each move starts from the prior predicted price level. The path should visually make sense.
- Do not over-smooth. If historicalMoveDistribution.volatilityRegime is active or violent,
  size the forecast from recentAverageAbsMovePct and recentMaxAbsMovePct, not only the long-run
  averageAbsMovePct. A recent hard-swing tape should not receive tiny +/-0.2% to +/-0.8% moves
  unless the supplied technicals clearly show volatility compression.
- In an active or violent regime, at least 4 of the 10 moves should usually be meaningful:
  roughly 50%-125% of recentAverageAbsMovePct, with one larger retest/rejection move allowed
  near recentMaxAbsMovePct when price is at support/resistance or after an exhaustion spike.
- In a quiet regime, small moves are acceptable, but the thesis must explicitly say volatility
  has compressed.
- No single move should exceed about 1.25x recentMaxAbsMovePct unless fresh news, event risk,
  or a break of major support/resistance clearly justifies it.
- If price is near resistance, do not jump above it and immediately reverse unless the reason
  explains failed breakout behavior. If price is near support, do not repeatedly break and
  reclaim it without a clear retest/base phase.
- If the last 10 historical moves show multiple >2% swings or one >4% swing, the forecast must
  acknowledge that the stock is currently trading in a hard-swing regime and reflect that in
  movePct magnitudes, confidence, headline, thesis, and risk.

Return exactly 10 moves.
Each move must include:
- date: use "Move #1", "Move #2", ... through "Move #10".
- movePct: the expected signed percentage move for that step. Positive means price rises;
  negative means price falls. Keep it realistic for the selected timeframe and this stock's
  current volatility regime. Do not make every move the same. Avoid timid broker-style paths
  when recent history proves this ticker is swinging hard.
- direction: UP, DOWN, or FLAT. It must match movePct: UP for clearly positive, DOWN for
  clearly negative, FLAT for tiny consolidation moves near zero.
- phase: one of impulse, pullback, base, breakout, rejection, retest, continuation,
  mean_reversion, distribution, or accumulation. Use the phase to explain the scenario.
- confidence: 1 to 100. Confidence should vary with setup quality, catalyst support, trend,
  sector strength, technical clarity, and risk.
- reason: one short technical read under 90 characters, such as "RSI fades near resistance",
  "wave 3 extension risk", "support retest likely", or "MACD momentum rolls over".

The path should compound from currentPrice on the client, so movePct must be the single-step
expected move, not the cumulative gain.
Use timeframe exactly as supplied: 1D means daily/swing opportunities; 1W means weekly
opportunities.
Use currentPrice exactly from the supplied context.
sampleSize and averageMovePct should reflect the supplied historical move statistics.
directionChanges must match the moves you return.
headline must be a sharp one-line technical house view.
thesis must summarize why this 10-step path is credible as one scenario, focused mostly on
technical structure while acknowledging business, news, and market context only when they
affect the setup.
risk must state the main technical reason the path could fail in 1 sentence.
Avoid hype and avoid buy/sell commands. This is a prediction map, not an order ticket.
""".strip()


def _portfolio_review_instructions() -> str:
    return """
You are reviewing the user's current AlphaWolf portfolio using only the supplied portfolioContext.
Return the same shape as AlphaWolf V8's agent card: score, verdict, intro, sections, bullets, sign.

Grounding rules:
- Do not invent holdings, prices, weights, yields, P/L, dividend data, or future events.
- Use the supplied totalValue, gainLossPct, forwardYield, topWeight, winners/losers, best/worst,
  and holdings list. If the portfolio is empty, say there is nothing to grade yet.
- score is 0-100 and should reflect portfolio health through your agent lens.
- verdict is short and uppercase, like FUNDAMENTALLY SOUND, COLD - REGROUP, FACTOR RISK, or
  COMPOUNDING NICELY.
- intro is 1-2 sentences summarizing the book.
- sections must contain 2-4 objects with h and b keys.
- bullets must contain 2-4 practical next actions.
- sign must be a short signed line in character, for example "— Vera, by the numbers".
- Keep risk controls visible. Rex can sound lucky, but never reckless.
Return strictly valid JSON matching the PortfolioReview schema. Do not add extra keys.
""".strip()
