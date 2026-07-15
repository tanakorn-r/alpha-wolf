from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

from internal.auth_context import account_cache_scope, user_id_from_request
from internal.ai.agents import normalize_agent_id
from internal.ai.access import claim_ai_run, release_ai_run, require_ai_account
from internal.ai.context import build_analysis_context, build_technical_context, build_today_context
from internal.ai.production_gate import attach_run_context, build_decision_state
from internal.ai.openai_client import OpenAIAnalysisError, analyze_brief_with_openai, analyze_quant_with_openai, analyze_technicals_with_openai, analyze_today_with_openai, analyze_valuation_with_openai, analyze_with_openai, recommend_strategy_with_openai, review_portfolio_with_openai
from internal.market.detail import build_detail_bundle, get_ai_financials, get_domain_insights, get_market_comparison
from internal.market.data_trust import build_universe_data_trust
from internal.market.portfolio import build_portfolio_dashboard
from internal.market.scoring import StrategyKey, STRATEGY_LABELS, parse_strategy
from internal.market.universe import build_market_page
from internal.store.cache import cache_get, cache_set
from internal.store.ai_results import AIResultKey, AIResultQualityError, load_ai_result, load_latest_ai_result, save_ai_result
from internal.store.ai_audit import list_ai_decision_history, record_ai_failure
from internal.store.db import connect
from internal.store.portfolio import list_holdings
from internal.store.utils import as_float
from models import PortfolioReviewResponse, QuantPerspectiveResponse, StockAnalysisResponse, StrategyRecommendationRequest, StrategyPlaybookResponse, TechnicalAnalysisResponse, TodayPerformanceResponse, ValuationVerdictResponse

router = APIRouter()

DETAIL_TTL_SECONDS = 180
ANALYST_REPORT_TTL_SECONDS = 900

SAVED_AI_FEATURES = {
    "stock-analysis",
    "analyst-report",
    "quant",
    "valuation",
    "today",
    "technical",
    "strategy",
    "portfolio",
    "buy-timing",
    "next-10",
}


@router.get("/api/ai/decision-history")
def ai_decision_history(
    request: Request,
    subject: str = Query(...),
    agent: str = Query("vera"),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    user_id, _ = require_ai_account(request)
    return {"items": list_ai_decision_history(user_id, subject.strip().upper(), normalize_agent_id(agent), limit)}

_LEGACY_AI_MARKERS = {
    "stock-analysis": ":v29-prime-hybrid-council:",
    "analyst-report": ":analyst-report:",
    "quant": ":quant:",
    "valuation": ":valuation:",
    "today": ":today:",
    "technical": ":technical:",
    "strategy": ":strategy-playbook:",
    "portfolio": ":portfolio-review:",
    "buy-timing": ":ai-buy-timing:",
    "next-10": ":ai-next-10-technical:",
}


@router.get("/api/ai/results/latest", response_model=None)
def latest_ai_result(
    request: Request,
    feature: str = Query(...),
    subject: str = Query(...),
    agent: str = Query("vera"),
    variant_prefix: str = Query("", alias="variantPrefix"),
) -> dict[str, Any] | Response:
    """Return a saved AI result only. A miss is 204 and never spends quota or calls OpenAI."""
    user_id, _ = require_ai_account(request)
    normalized_feature = feature.strip().lower()
    if normalized_feature not in SAVED_AI_FEATURES:
        raise HTTPException(status_code=400, detail="Unknown AI result feature")
    normalized_subject = subject.strip().lower() if normalized_feature in {"strategy", "portfolio"} else subject.strip().upper()
    result = load_latest_ai_result(
        user_id,
        normalized_feature,
        normalized_subject,
        normalize_agent_id(agent),
        variant_prefix=variant_prefix.strip(),
    )
    if result is None:
        result = _adopt_legacy_ai_result(
            user_id,
            normalized_feature,
            normalized_subject,
            normalize_agent_id(agent),
            variant_prefix.strip(),
        )
    return result if result is not None else Response(status_code=204)


def _adopt_legacy_ai_result(
    user_id: int,
    feature: str,
    subject: str,
    agent_id: str,
    variant_prefix: str,
) -> dict[str, Any] | None:
    """Make pre-migration AI cards available to saved-only page hydration."""
    marker = _LEGACY_AI_MARKERS[feature]
    account_prefix = f"user:{user_id}:%"
    try:
        with connect() as db:
            rows = db.execute(
                """SELECT cache_key, payload FROM ai_response_cache
                   WHERE namespace = 'analysis' AND cache_key LIKE ?
                   ORDER BY updated_at DESC""",
                (account_prefix,),
            ).fetchall()
        for row in rows:
            cache_key = str(row["cache_key"] if hasattr(row, "keys") else row[0])
            if marker not in cache_key:
                continue
            if feature not in {"strategy", "portfolio"} and f":{subject}:" not in cache_key:
                continue
            semantic_tokens = [token for token in variant_prefix.rstrip(":").split(":")[1:] if token]
            if any(f":{token}:" not in f"{cache_key}:" for token in semantic_tokens):
                continue
            payload_text = row["payload"] if hasattr(row, "keys") else row[1]
            payload = json.loads(str(payload_text))
            legacy_variant = f"{variant_prefix}legacy:{hashlib.sha256(cache_key.encode()).hexdigest()[:12]}"
            try:
                return save_ai_result(AIResultKey(user_id, feature, subject, agent_id, legacy_variant), payload)
            except AIResultQualityError:
                continue
    except Exception as exc:
        print(f"Warning: legacy AI hydration failed for {feature}/{subject}: {exc}")
    return None


def _publish_ai_result(
    key: AIResultKey,
    result: dict[str, Any],
    previous: dict[str, Any] | None,
    usage_user_id: int | None,
    *,
    context: dict[str, Any] | None = None,
    data_trust: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Never let a failed quality gate erase the account's last known good answer."""
    try:
        audited = attach_run_context(result, feature=key.feature, context=context, data_trust=data_trust)
        return save_ai_result(key, audited)
    except Exception as exc:
        release_ai_run(usage_user_id)
        if previous is not None:
            print(f"Warning: AI refresh failed quality gate for {key.feature}/{key.subject}: {exc}")
            return previous
        raise HTTPException(status_code=503, detail=f"AI response failed quality checks: {exc}") from exc


def _load_saved_ai_result(key: AIResultKey, legacy_cache_key: str) -> dict[str, Any] | None:
    saved = load_ai_result(key)
    if saved is not None:
        return saved
    legacy = cache_get("analysis", legacy_cache_key)
    if not isinstance(legacy, dict):
        return None
    try:
        return save_ai_result(key, legacy)
    except AIResultQualityError as exc:
        print(f"Warning: rejected legacy AI result for {key.feature}/{key.subject}: {exc}")
        return None


def _analyst_input_flags(agent_id: str) -> tuple[bool, bool, bool]:
    """Only load research packs referenced by this Agent's context branch."""
    return {
        "rex": (False, True, False),
        "kai": (False, True, False),
        "nadia": (False, True, True),
        "sam": (True, False, False),
        "ben": (True, False, True),
        "alphawolf": (True, True, True),
        "vera": (True, False, True),
    }.get(agent_id, (True, False, True))


def _daily_brief_input_flags(agent_id: str) -> tuple[bool, bool, bool]:
    """Load only the research sources that can genuinely change this Agent's holding action."""
    return {
        "vera": (True, True, True),
        "ben": (True, True, True),
        "sam": (True, True, False),
        "rex": (False, True, False),
        "kai": (False, True, False),
        "nadia": (False, True, True),
        "alphawolf": (True, True, True),
    }.get(agent_id, (True, True, True))


def _fetch_analysis_data(
    symbol: str,
    strategy: StrategyKey,
    *,
    mode: str | None = None,
    include_financials: bool = True,
    include_market: bool = True,
    include_insights: bool = True,
) -> tuple[dict[str, Any] | None, dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Fetch bundle + financials + market comparison + domain insights in parallel.

    Returns (bundle, financials, market_data, insights). Any secondary fetch that
    fails returns an empty dict so the OpenAI call still proceeds with partial data.
    """
    bundle: dict[str, Any] | None = None
    financials: dict[str, Any] = {}
    market: dict[str, Any] = {}
    insights: dict[str, Any] = {}

    def _bundle() -> dict[str, Any] | None:
        # AI generation is database-first even when force=true. Force regenerates only the
        # OpenAI answer; stale persisted market evidence remains valid input and Yahoo refresh
        # is scheduled only for a dataset that has never been stored.
        return build_detail_bundle(symbol, strategy, mode=mode, refresh_stale=False)

    def _financials() -> dict[str, Any]:
        try:
            return get_ai_financials(symbol, refresh_stale=False) or {}
        except Exception as exc:
            print(f"Warning: Financials load failed for {symbol}: {exc}")
            return {}

    def _market() -> dict[str, Any]:
        try:
            return get_market_comparison(symbol, refresh_stale=False) or {}
        except Exception as exc:
            print(f"Warning: Market comparison load failed for {symbol}: {exc}")
            return {}

    def _insights() -> dict[str, Any]:
        try:
            return get_domain_insights(symbol, refresh_stale=False) or {}
        except Exception as exc:
            print(f"Warning: Domain insights load failed for {symbol}: {exc}")
            return {}

    started_at = time.monotonic()
    stage_times: dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_bundle): "bundle"}
        if include_financials:
            futures[pool.submit(_financials)] = "financials"
        if include_market:
            futures[pool.submit(_market)] = "market"
        if include_insights:
            futures[pool.submit(_insights)] = "insights"
        for future in as_completed(futures):
            key = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                print(f"Warning: {key} fetch failed for {symbol}: {exc}")
                result = None if key == "bundle" else {}
            if key == "bundle":
                bundle = result
            elif key == "financials":
                financials = result or {}
            elif key == "market":
                market = result or {}
            elif key == "insights":
                insights = result or {}
            stage_times[key] = round(time.monotonic() - started_at, 3)

    print(f"Analysis data timing {symbol}: total={time.monotonic() - started_at:.3f}s stages={stage_times}")

    return bundle, financials, market, insights


@router.post("/api/analysis/{symbol}", response_model=StockAnalysisResponse)
def analysis(symbol: str, request: Request, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request)
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    position_context = _position_context(normalized, user_id)
    position_cache_key = _position_cache_key(position_context)
    cache_key = f"{account_scope}:v29-prime-hybrid-council:{normalized}:{strategy}:{agent_id}:{position_cache_key}"
    result_key = AIResultKey(user_id, "stock-analysis", normalized, agent_id, f"v29:{strategy}:{position_cache_key}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    include_financials, include_market, include_insights = _analyst_input_flags(agent_id)
    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_financials=include_financials,
        include_market=include_market,
        include_insights=include_insights,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    _require_ai_market_data(bundle, normalized)

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        position_context=position_context,
        agent_id=agent_id,
    )
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))

    usage_user_id, _ = claim_ai_run(request)
    try:
        result = analyze_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/report", response_model=None)
def analyst_report(
    symbol: str,
    request: Request,
    payload: dict[str, Any] | None = Body(default=None),
    agent: str = Query("vera"),
    force: bool = Query(False),
) -> dict[str, Any] | JSONResponse:
    """Return the detail and Agent analysis together without duplicate market-data work.

    Cold quote data returns 202 immediately while the cache-first loaders refresh the database;
    the browser can poll without holding a Cloud Run request open on Yahoo.
    """
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    position_context = _position_context(normalized, user_id)
    position_cache_key = _position_cache_key(position_context)
    cache_key = f"{account_scope}:analyst-report:v13-prime-hybrid-council:{normalized}:{strategy}:{agent_id}:{position_cache_key}"

    result_key = AIResultKey(user_id, "analyst-report", normalized, agent_id, f"v13:{strategy}:{position_cache_key}")
    cached_analysis = _load_saved_ai_result(result_key, cache_key)
    if cached_analysis is not None and not force:
        bundle = build_detail_bundle(normalized, strategy, refresh_stale=False)
        if not bundle:
            raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
        if bundle.get("dataPending"):
            return JSONResponse(status_code=202, content={"status": "pending", "stage": "market_data", "retryAfterSeconds": 3})
        return {"status": "ready", "detail": bundle, "analysis": cached_analysis}

    include_financials, include_market, include_insights = _analyst_input_flags(agent_id)
    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_financials=include_financials,
        include_market=include_market,
        include_insights=include_insights,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    if bundle.get("dataPending"):
        return JSONResponse(status_code=202, content={"status": "pending", "stage": "market_data", "retryAfterSeconds": 3})

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        position_context=position_context,
        agent_id=agent_id,
    )
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))
    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    openai_started_at = time.monotonic()
    try:
        result = analyze_brief_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached_analysis is not None:
            # A failed explicit refresh must never erase a previously saved report. Return the
            # durable DB result with current stored market detail and let the UI keep working.
            return {
                "status": "ready",
                "detail": bundle,
                "analysis": cached_analysis,
                "refreshWarning": str(exc),
            }
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        print(f"Analyst OpenAI timing {normalized}: {time.monotonic() - openai_started_at:.3f}s")

    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached_analysis, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, ANALYST_REPORT_TTL_SECONDS)
    return {"status": "ready", "detail": bundle, "analysis": result}


@router.post("/api/analysis/{symbol}/quant", response_model=QuantPerspectiveResponse)
def quant_analysis(symbol: str, request: Request, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request)
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    mode = str((payload or {}).get("mode") or "").strip().lower()
    mode = mode if mode in {"swing", "day", "long", "value", "fomo"} else None
    cache_key = f"{account_scope}:quant:v24-prime-hybrid-council:{normalized}:{strategy}:{mode or 'default'}:{agent_id}"
    result_key = AIResultKey(user_id, "quant", normalized, agent_id, f"v24:{strategy}:{mode or 'default'}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        mode=mode,
        include_financials=False,
        include_insights=False,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    _require_ai_market_data(bundle, normalized)

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))

    usage_user_id, _ = claim_ai_run(request)
    try:
        result = analyze_quant_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/valuation", response_model=ValuationVerdictResponse)
def valuation_analysis(symbol: str, request: Request, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request)
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    cache_key = f"{account_scope}:valuation:v26-today-tape-fomo:{normalized}:{strategy}:{agent_id}"
    result_key = AIResultKey(user_id, "valuation", normalized, agent_id, f"v26:{strategy}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_market=False,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    _require_ai_market_data(bundle, normalized)

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))

    usage_user_id, _ = claim_ai_run(request)
    try:
        result = analyze_valuation_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Keep objective valuation multiples authoritative even if the model omits an echo field.
    business = bundle.get("business") if isinstance(bundle.get("business"), dict) else {}
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    tape_metrics = _valuation_tape_metrics(bundle)
    result = {
        **result,
        "metrics": {
            **metrics,
            "peRatio": business.get("peRatio"),
            "forwardPE": business.get("forwardPE"),
            **tape_metrics,
        },
    }
    result = _align_tactical_valuation_state(result, agent_id)
    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


def _valuation_tape_metrics(bundle: dict[str, Any]) -> dict[str, float | None]:
    stock = bundle.get("stock") if isinstance(bundle.get("stock"), dict) else {}
    technicals = bundle.get("technicals") if isinstance(bundle.get("technicals"), dict) else {}
    history = bundle.get("history") if isinstance(bundle.get("history"), list) else []
    today = history[-1] if history and isinstance(history[-1], dict) else {}
    prior = history[-2] if len(history) >= 2 and isinstance(history[-2], dict) else {}

    current = as_float(stock.get("price")) or as_float(today.get("close"))
    today_change_pct = as_float(stock.get("changePct"))
    previous_close = as_float(prior.get("close"))
    if previous_close is None and current is not None and today_change_pct is not None and today_change_pct > -100:
        previous_close = current / (1 + today_change_pct / 100)
    today_change = current - previous_close if current is not None and previous_close is not None else None
    if today_change_pct is None and today_change is not None and previous_close:
        today_change_pct = today_change / previous_close * 100

    return {
        "todayChange": round(today_change, 4) if today_change is not None else None,
        "todayChangePct": round(today_change_pct, 2) if today_change_pct is not None else None,
        "previousClose": round(previous_close, 4) if previous_close is not None else None,
        "dayOpen": as_float(today.get("open")),
        "dayHigh": as_float(today.get("high")),
        "dayLow": as_float(today.get("low")),
        "currentVolume": as_float(technicals.get("currentVolume")) or as_float(today.get("volume")),
        "averageVolume": as_float(technicals.get("avgVolume")),
        "volumeRatio": as_float(technicals.get("volumeRatio")),
        "rsi14": as_float(technicals.get("rsi14")),
        "support": as_float(technicals.get("support")),
        "resistance": as_float(technicals.get("resistance")),
    }


def _align_tactical_valuation_state(result: dict[str, Any], agent_id: str) -> dict[str, Any]:
    """Keep the tactical label consistent with its objective breakout geometry.

    This does not decide whether the stock is investable. It only prevents a pre-breakout WAIT
    setup from being described as already extended beyond the same resistance level.
    """
    if agent_id not in {"kai", "rex"}:
        return result
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    current = as_float(metrics.get("currentPrice"))
    resistance = as_float(metrics.get("resistance"))
    if current is None or resistance is None or resistance <= 0:
        return result
    gap_pct = (current - resistance) / resistance * 100
    if gap_pct >= -0.75 or result.get("verdict") != "CHASING":
        return result

    agent_name = "Kai" if agent_id == "kai" else "Rex"
    gap_text = f"{abs(gap_pct):.1f}% below resistance at {resistance:.2f}"
    right_now = result.get("rightNow") if isinstance(result.get("rightNow"), dict) else {}
    structure_band = result.get("structureBand") if isinstance(result.get("structureBand"), dict) else {}
    return {
        **result,
        "verdict": "BUILDING",
        "chasingAnswer": f"No. Price is still {gap_text}; the breakout has not happened.",
        "recap": f"Not a chase yet: the setup is building {gap_text}. {agent_name} waits for price and volume confirmation.",
        "rightNow": {
            **right_now,
            "action": "WAIT",
            "note": f"Setup is building {gap_text}. Wait for a volume-backed breakout instead of entering early.",
        },
        "structureBand": {**structure_band, "zoneLabel": "BUILDING"},
    }


@router.post("/api/analysis/{symbol}/today", response_model=TodayPerformanceResponse)
def today_analysis(symbol: str, request: Request, payload: dict[str, Any] | None = Body(default=None), agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper().strip()
    strategy = parse_strategy((payload or {}).get("strategy"))
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    position_context = _position_context(normalized, user_id)
    position_cache_key = _position_cache_key(position_context)
    cache_key = f"{account_scope}:today:v23-agent-evidence-consistency:{normalized}:{strategy}:{agent_id}:{position_cache_key}"
    result_key = AIResultKey(user_id, "today", normalized, agent_id, f"v23:{strategy}:{position_cache_key}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    include_financials, include_market, include_insights = _daily_brief_input_flags(agent_id)
    bundle, financials_data, market_data, insights_data = _fetch_analysis_data(
        normalized,
        strategy,
        include_financials=include_financials,
        include_market=include_market,
        include_insights=include_insights,
    )
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    _require_ai_market_data(bundle, normalized)

    context = build_today_context(
        bundle,
        position_context=position_context,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
        agent_id=agent_id,
    )
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))

    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        result = analyze_today_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/{symbol}/technical", response_model=TechnicalAnalysisResponse)
def technical_analysis(symbol: str, request: Request, agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper().strip()
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    position_context = _position_context(normalized, user_id)
    cache_key = f"{account_scope}:technical:v12-prime-hybrid-council:{normalized}:{agent_id}:{_position_cache_key(position_context)}"
    position_cache_key = _position_cache_key(position_context)
    result_key = AIResultKey(user_id, "technical", normalized, agent_id, f"v12:{position_cache_key}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    bundle = build_detail_bundle(normalized, "momentum", refresh_stale=False)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    _require_ai_market_data(bundle, normalized)
    context = build_technical_context(bundle, position_context=position_context)
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))
    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        result = {**analyze_technicals_with_openai(context, agent_id), "symbol": normalized}
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    result = _publish_ai_result(result_key, {**result, "dataTrust": bundle.get("dataTrust")}, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, ANALYST_REPORT_TTL_SECONDS)
    return result


def _require_ai_market_data(bundle: dict[str, Any], symbol: str) -> None:
    """Never spend an AI call or publish a rating on an unpriced shell record."""
    stock = bundle.get("stock") if isinstance(bundle.get("stock"), dict) else {}
    history = bundle.get("history") if isinstance(bundle.get("history"), list) else []
    try:
        price = float(stock.get("price") or 0)
    except (TypeError, ValueError):
        price = 0

    usable_closes = 0
    for point in history:
        if not isinstance(point, dict):
            continue
        try:
            if float(point.get("close") or 0) > 0:
                usable_closes += 1
        except (TypeError, ValueError):
            continue

    missing: list[str] = []
    if price <= 0:
        missing.append("a valid current price")
    if usable_closes < 5:
        missing.append("usable price history")
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"{symbol} cannot be rated yet because the market feed has no {' and '.join(missing)}. No AI score was generated.",
        )


def _position_context(symbol: str, user_id: int = 0) -> dict[str, Any]:
    normalized = symbol.upper().strip()
    try:
        for holding in list_holdings(user_id):
            if holding.symbol.upper() != normalized:
                continue
            return {
                "isHolding": True,
                "mode": "holding",
                "question": "The user already owns this stock. Analyze whether they should stay with it, buy more, trim, or sell. Focus on whether today's price is a reason to worry or whether they can keep holding.",
                "symbol": normalized,
                "shares": holding.shares,
                "averageCost": holding.averageCost,
                "monthlyDca": holding.monthlyDca,
                "strategy": holding.strategy,
                "createdAt": holding.createdAt,
            }
    except Exception as exc:
        print(f"Warning: Stored holding context load failed for {normalized}: {exc}")

    return {
        "isHolding": False,
        "mode": "candidate",
        "question": "The user does not own this stock. Analyze whether they should buy it now, wait for a better entry, or avoid it.",
        "symbol": normalized,
    }


def _position_cache_key(context: dict[str, Any]) -> str:
    if not context.get("isHolding"):
        return "candidate"
    parts = [
        "holding",
        str(context.get("shares") or ""),
        str(context.get("averageCost") or ""),
        str(context.get("monthlyDca") or ""),
        str(context.get("gainLossPct") or ""),
    ]
    return ":".join(parts)


@router.post("/api/strategy/recommendations", response_model=StrategyPlaybookResponse)
def strategy_recommendations(payload: StrategyRecommendationRequest, request: Request, agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    strategy_prompt = payload.strategy.strip()
    base_strategy = _infer_base_strategy(strategy_prompt)
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    cache_digest = hashlib.sha256(
        f"{account_scope}:{strategy_prompt.lower()}:{payload.region}:{payload.limit}:{payload.candidateLimit}:{base_strategy}:{agent_id}".encode("utf-8")
    ).hexdigest()[:24]
    cache_key = f"{account_scope}:strategy-playbook:v7-agent-method:{cache_digest}"
    result_key = AIResultKey(user_id, "strategy", "universe", agent_id, f"v7:{cache_digest}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    candidates, _, total = build_market_page(
        page=1,
        limit=payload.candidateLimit,
        strategy=base_strategy,
        region=payload.region,
    )
    if not candidates:
        raise HTTPException(status_code=404, detail="No stock candidates are available for this strategy")

    context = {
        "strategyPrompt": strategy_prompt,
        "requestedLimit": payload.limit,
        "region": payload.region,
        "baseStrategy": base_strategy,
        "baseStrategyLabel": STRATEGY_LABELS[base_strategy],
        "candidateCount": len(candidates),
        "totalUniverseMatches": total,
        "candidates": [_strategy_candidate_context(candidate, base_strategy) for candidate in candidates],
    }

    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        result = recommend_strategy_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=build_universe_data_trust(payload.region, candidates), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _filter_strategy_picks(result, candidates, payload.limit, strategy_prompt)
    strategy_trust = build_universe_data_trust(payload.region, candidates)
    result = _publish_ai_result(result_key, {**result, "dataTrust": strategy_trust}, cached, usage_user_id, context=context, data_trust=strategy_trust)
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


@router.post("/api/analysis/portfolio/review", response_model=PortfolioReviewResponse)
def portfolio_review(request: Request, agent: str = Query("vera"), force: bool = Query(False)) -> dict[str, Any]:
    require_ai_account(request)
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    portfolio = build_portfolio_dashboard(user_id, refresh_stale=False)
    portfolio_data = portfolio.model_dump() if hasattr(portfolio, "model_dump") else dict(portfolio or {})
    context = _portfolio_review_context(portfolio)
    cache_digest = hashlib.sha256(
        f"{account_scope}:{agent_id}:{context.get('totalValue')}:{context.get('gainLossPct')}:{context.get('forwardYield')}:{','.join(item.get('symbol', '') for item in context.get('holdings', []))}".encode("utf-8")
    ).hexdigest()[:24]
    cache_key = f"{account_scope}:portfolio-review:v5-agent-method:{cache_digest}"
    # One durable slot per account/Agent intentionally keeps the last review visible after the
    # portfolio changes. The generation timestamp tells the user how old its holdings snapshot is;
    # an explicit rerun replaces it with a review of the current portfolio.
    result_key = AIResultKey(user_id, "portfolio", "portfolio", agent_id, "v5")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    usage_user_id, _ = claim_ai_run(request)
    try:
        result = review_portfolio_with_openai({"portfolioContext": context}, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context={"portfolioContext": context}, data_trust=portfolio_data.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = _publish_ai_result(result_key, {**result, "dataTrust": portfolio_data.get("dataTrust")}, cached, usage_user_id, context={"portfolioContext": context}, data_trust=portfolio_data.get("dataTrust"))
    cache_set("analysis", cache_key, result, DETAIL_TTL_SECONDS)
    return result


def _infer_base_strategy(strategy_prompt: str) -> StrategyKey:
    direct = parse_strategy(strategy_prompt)
    if strategy_prompt in STRATEGY_LABELS:
        return direct

    prompt = strategy_prompt.lower()
    if any(term in prompt for term in ("day", "swing", "momentum", "fomo", "breakout", "trend", "short-term", "short term")):
        return "momentum"
    if any(term in prompt for term in ("yield", "income", "dividend", "cash flow", "cashflow")):
        return "yield"
    if any(term in prompt for term in ("dca", "stable", "long", "compound", "retirement", "recurring")):
        return "stable_dca"
    if any(term in prompt for term in ("value", "capital", "undervalued", "quality", "fundamental")):
        return "capitalized"
    return direct


def _strategy_candidate_context(candidate: dict[str, Any], base_strategy: StrategyKey) -> dict[str, Any]:
    scores = candidate.get("strategyScores") if isinstance(candidate.get("strategyScores"), dict) else {}
    return {
        "symbol": candidate.get("symbol"),
        "name": candidate.get("name"),
        "sector": candidate.get("sector"),
        "industry": candidate.get("industry"),
        "exchange": candidate.get("exchange"),
        "currency": candidate.get("currency"),
        "price": candidate.get("price"),
        "changePct": candidate.get("changePct"),
        "weeklyTrend": candidate.get("weeklyTrend"),
        "marketCap": candidate.get("marketCap"),
        "dividendYield": candidate.get("dividendYield"),
        "recommendation": candidate.get("recommendation"),
        "story": candidate.get("story"),
        "baseStrategyScore": scores.get(base_strategy),
        "strategyScores": scores,
    }


def _portfolio_review_context(portfolio: Any) -> dict[str, Any]:
    data = portfolio.model_dump() if hasattr(portfolio, "model_dump") else dict(portfolio or {})
    summary = data.get("summary") or {}
    holdings = data.get("holdings") or []
    total_value = float(summary.get("totalValue") or 0)
    rows: list[dict[str, Any]] = []
    for holding in holdings:
        value = float(holding.get("value") or 0)
        cost = float(holding.get("cost") or 0)
        gain_loss_pct = float(holding.get("gainLossPct") or 0)
        rows.append(
            {
                "symbol": holding.get("symbol"),
                "name": holding.get("name"),
                "strategy": holding.get("strategy"),
                "shares": holding.get("shares"),
                "averageCost": holding.get("averageCost"),
                "price": holding.get("price"),
                "currency": holding.get("currency"),
                "value": value,
                "cost": cost,
                "gainLoss": holding.get("gainLoss"),
                "gainLossPct": gain_loss_pct,
                "weightPct": (value / total_value * 100) if total_value > 0 else 0,
                "dividendYield": holding.get("dividendYield"),
                "monthlyDca": holding.get("monthlyDca"),
            }
        )

    sorted_by_value = sorted(rows, key=lambda item: float(item.get("value") or 0), reverse=True)
    sorted_by_return = sorted(rows, key=lambda item: float(item.get("gainLossPct") or 0), reverse=True)
    top = sorted_by_value[0] if sorted_by_value else None
    best = sorted_by_return[0] if sorted_by_return else None
    worst = sorted_by_return[-1] if sorted_by_return else None

    return {
        "empty": len(rows) == 0,
        "holdingCount": len(rows),
        "totalValue": total_value,
        "invested": summary.get("invested"),
        "gainLoss": summary.get("gainLoss"),
        "gainLossPct": summary.get("gainLossPct"),
        "dividendsYtd": summary.get("dividendsYtd"),
        "forwardYield": summary.get("forwardYield"),
        "winners": len([row for row in rows if float(row.get("gainLossPct") or 0) >= 0]),
        "losers": len([row for row in rows if float(row.get("gainLossPct") or 0) < 0]),
        "top": top,
        "topWeightPct": top.get("weightPct") if top else 0,
        "best": best,
        "worst": worst,
        "holdings": rows,
    }


def _filter_strategy_picks(result: dict[str, Any], candidates: list[dict[str, Any]], limit: int, strategy_prompt: str) -> dict[str, Any]:
    candidate_by_symbol = {str(candidate.get("symbol") or "").upper(): candidate for candidate in candidates}
    picks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pick in result.get("picks", []):
        symbol = str(pick.get("ticker") or "").upper().strip()
        if not symbol or symbol not in candidate_by_symbol or symbol in seen:
            continue
        candidate = candidate_by_symbol[symbol]
        picks.append(
            {
                **pick,
                "ticker": symbol,
                "name": str(candidate.get("name") or pick.get("name") or symbol),
            }
        )
        seen.add(symbol)
        if len(picks) >= limit:
            break

    if not picks:
        raise HTTPException(status_code=503, detail="Strategy AI did not return any valid universe picks")

    return {
        **result,
        "strategy": strategy_prompt,
        "picks": picks,
    }
