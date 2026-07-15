from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from internal.auth_context import account_cache_scope, user_id_from_request
from internal.ai.agents import agent_badge, normalize_agent_id
from internal.ai.context import build_analysis_context
from internal.ai.production_gate import attach_run_context, build_decision_state
from internal.ai.openai_client import OpenAIAnalysisError, analyze_buy_timing_with_openai, predict_technical_moves_with_openai
from internal.ai.access import claim_ai_run, release_ai_run, require_ai_account
from internal.market.deep import deep_analysis
from internal.market.buy_timing import apply_ai_narrative, build_agent_evidence, build_buy_timing
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.data_trust import YAHOO_PROVIDER_POLICY
from internal.market.patterns import signed_moves_from_points
from internal.market.scoring import StrategyKey
from internal.store.cache import cache_compute_lock, cache_get, cache_set
from internal.store.ai_results import AIResultKey, AIResultQualityError, load_ai_result, save_ai_result
from internal.store.ai_audit import record_ai_failure
from models import MarketComparison, TechnicalMovesPredictionResponse

router = APIRouter()

UPWARD_MOVES_TTL_SECONDS = 900


def _publish_ai_result(
    key: AIResultKey,
    result: dict[str, Any],
    previous: dict[str, Any] | None,
    usage_user_id: int | None,
    *,
    context: dict[str, Any] | None = None,
    data_trust: dict[str, Any] | None = None,
) -> dict[str, Any]:
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


@router.post("/api/details/batch")
def details_batch(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    requested = payload.get("items") or []
    jobs: list[tuple[str, StrategyKey]] = []
    seen: set[tuple[str, str]] = set()
    for item in requested[:30]:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").upper().strip()
        strategy = str(item.get("strategy") or "capitalized")
        if not symbol or strategy not in {"capitalized", "stable_dca", "yield", "momentum"}:
            continue
        key = (symbol, strategy)
        if key not in seen:
            seen.add(key)
            jobs.append((symbol, strategy))  # type: ignore[arg-type]

    results: dict[str, Any] = {}
    # Bound concurrency here. The detail builder already performs four Yahoo calls in parallel;
    # firing every holding at once creates a thread/request storm and makes the whole brief slower.
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(build_detail_bundle, symbol, strategy): symbol for symbol, strategy in jobs}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                value = future.result()
            except Exception as exc:
                print(f"Warning: batch detail failed for {symbol}: {exc}")
                value = None
            if value is not None:
                results[symbol] = _compact_daily_detail(value)
    return {"items": results}


def _compact_daily_detail(bundle: dict[str, Any]) -> dict[str, Any]:
    """Daily Brief needs a decision row, not the full six-tab stock-detail payload."""
    business = bundle.get("business") or {}
    technicals = bundle.get("technicals") or {}
    return {
        "stock": bundle.get("stock") or {},
        "verdict": bundle.get("verdict") or {},
        "technicals": {"sma50": technicals.get("sma50")},
        "business": {
            "dividendYield": business.get("dividendYield"),
            "targetMeanPrice": business.get("targetMeanPrice"),
        },
        "history": (bundle.get("history") or [])[-56:],
        "news": (bundle.get("news") or [])[:1],
        "dataTrust": bundle.get("dataTrust"),
        "decisionState": _bundle_decision_state(bundle),
        "dataPending": bool(bundle.get("dataPending")),
    }


def _bundle_decision_state(bundle: dict[str, Any]) -> dict[str, Any]:
    return build_decision_state({
        "stock": bundle.get("stock") or {},
        "business": bundle.get("business") or {},
        "technicals": bundle.get("technicals") or {},
        "companyStructureProfile": bundle.get("companyStructure") or {},
    }, data_trust=bundle.get("dataTrust"))


@router.get("/api/market/data-policy")
def market_data_policy() -> dict[str, Any]:
    return {
        "provider": "Yahoo Finance",
        "transport": "yfinance",
        "delayed": True,
        "policy": YAHOO_PROVIDER_POLICY,
    }


@router.get("/api/details/{symbol}")
def details(
    symbol: str,
    strategy: StrategyKey = Query("capitalized"),
    mode: str | None = Query(default=None, pattern="^(swing|day|long|value|fomo)$"),
) -> dict[str, Any]:
    normalized = symbol.upper()
    bundle = build_detail_bundle(normalized, strategy, mode=mode)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return {**bundle, "decisionState": _bundle_decision_state(bundle)}


@router.get("/api/details/{symbol}/financials")
def details_financials(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    financials = get_financials(normalized)
    if not financials:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return financials


@router.get("/api/details/{symbol}/insights")
def details_insights(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    insights = get_domain_insights(normalized)
    if not insights:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return insights


@router.get("/api/details/{symbol}/market-comparison", response_model=MarketComparison)
def details_market_comparison(symbol: str) -> MarketComparison:
    comparison = get_market_comparison(symbol)
    if not comparison:
        raise HTTPException(status_code=503, detail=f"Market comparison for {symbol.upper()} is unavailable")
    return MarketComparison.model_validate(comparison)


@router.get("/api/details/{symbol}/deep")
def details_deep(symbol: str) -> dict[str, Any]:
    normalized = symbol.upper()
    result = deep_analysis(normalized)
    if not result:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    return result


@router.get("/api/details/{symbol}/buy-timing", response_model=None)
def details_buy_timing(
    symbol: str,
    request: Request,
    strategy: StrategyKey = Query("stable_dca"),
    agent: str = Query("vera"),
    force: bool = Query(False),
) -> dict[str, Any] | JSONResponse:
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper()
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    ai_cache_key = f"{account_scope}:ai-buy-timing:v62-strategic-current-dca:{normalized}:{strategy}:{agent_id}"
    result_key = AIResultKey(user_id, "buy-timing", normalized, agent_id, f"v62:{strategy}")
    cached = _load_saved_ai_result(result_key, ai_cache_key)
    if cached is not None and not force:
        return cached

    # One request per account/symbol/persona performs the derived snapshot and AI call. A duplicate
    # forced request that was already waiting on the same lock returns the result produced ahead of
    # it instead of spending another quota unit and repeating OpenAI work.
    with cache_compute_lock("buy_timing_ai", ai_cache_key):
        latest = _load_saved_ai_result(result_key, ai_cache_key)
        if latest is not None and (not force or latest != cached):
            return latest

        # force=true means regenerate the Agent reasoning, not bypass all persisted Yahoo/derived
        # market data. The snapshot has its own 15-minute freshness contract.
        result = build_buy_timing(normalized, strategy, refresh_stale=False)
        if not result:
            raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
        if result.get("dataPending"):
            return JSONResponse(status_code=202, content={"status": "pending", "stage": "market_data", "retryAfterSeconds": 3})
        try:
            has_price = float(result.get("price") or 0) > 0
        except (TypeError, ValueError):
            has_price = False
        if not has_price:
            raise HTTPException(
                status_code=503,
                detail="Current price is not ready yet. Please retry the Agent plan.",
            )

        usage_user_id, _ = claim_ai_run(request, premium_required=True)
        try:
            agent_evidence = build_agent_evidence(result, agent_id)
            agent_result = {key: value for key, value in result.items() if key != "_sourceSnapshots"}
            agent_result["agentEvidence"] = agent_evidence
            snapshots = result.get("_sourceSnapshots") if isinstance(result.get("_sourceSnapshots"), dict) else {}
            agent_result["canonicalDecisionState"] = build_decision_state({
                "stock": {"symbol": result.get("symbol"), "price": result.get("price"), "currency": result.get("currency")},
                "business": snapshots.get("business") or {},
                "technicals": snapshots.get("technicals") or result.get("technicalContext") or {},
                "businessStructure": result.get("businessStructure") or {},
                "companyStructureProfile": result.get("companyStructureProfile") or {},
            }, data_trust=result.get("dataTrust"))
            narrative = analyze_buy_timing_with_openai({"buyTiming": agent_result}, agent_id)
            response = {**apply_ai_narrative(agent_result, narrative), "agent": agent_badge(agent_id)}
        except (OpenAIAnalysisError, AIResultQualityError, KeyError, TypeError, ValueError) as exc:
            record_ai_failure(key=result_key, context={"buyTiming": agent_result if "agent_result" in locals() else result}, data_trust=result.get("dataTrust"), error=exc)
            release_ai_run(usage_user_id)
            print(f"Warning: Buy Timing Agent plan failed for {normalized}/{agent_id}: {exc}")
            if cached is not None:
                return cached
            # Mechanical seasonality is useful evidence, but it is not a successful persona plan.
            raise HTTPException(
                status_code=503,
                detail="The Agent response was incomplete. Please retry Buy Timing.",
            ) from exc
        response = _publish_ai_result(result_key, response, cached, usage_user_id, context={"buyTiming": agent_result}, data_trust=result.get("dataTrust"))
        cache_set("analysis", ai_cache_key, response, UPWARD_MOVES_TTL_SECONDS)
        return response


@router.get("/api/details/{symbol}/upward-moves", response_model=TechnicalMovesPredictionResponse)
def details_upward_moves(
    symbol: str,
    request: Request,
    timeframe: str = Query("1D", pattern="^(1D|1W)$"),
    strategy: StrategyKey = Query("capitalized"),
    agent: str = Query("vera"),
    force: bool = Query(False),
) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper()
    agent_id = normalize_agent_id(agent)
    user_id = user_id_from_request(request)
    account_scope = account_cache_scope(user_id)
    cache_key = f"{account_scope}:ai-next-10-technical:v20-prime-hybrid-council:{normalized}:{timeframe}:{strategy}:{agent_id}"
    result_key = AIResultKey(user_id, "next-10", normalized, agent_id, f"v20:{timeframe}:{strategy}")
    cached = _load_saved_ai_result(result_key, cache_key)
    if cached is not None and not force:
        return cached

    bundle = build_detail_bundle(normalized, strategy, refresh_stale=False)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    historical = signed_moves_from_points(normalized, timeframe, bundle.get("history") or [])  # type: ignore[arg-type]
    if not historical:
        raise HTTPException(status_code=404, detail=f"Not enough history for {normalized}")

    context = build_analysis_context(
        bundle,
        financials={},
        market_comparison={},
        domain_insights={},
        agent_id=agent_id,
    )
    context["forecastRequest"] = {
        "feature": "Next 10 Technical Moves",
        "timeframe": timeframe,
        "requiredMoves": 10,
        "allowNegativeMoves": True,
        "notEntryZones": True,
        "currentPrice": historical.get("currentPrice"),
    }
    context["historicalMoveDistribution"] = historical
    context["canonicalDecisionState"] = build_decision_state(context, data_trust=bundle.get("dataTrust"))

    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        result = predict_technical_moves_with_openai(context, agent_id)
    except (OpenAIAnalysisError, AIResultQualityError) as exc:
        record_ai_failure(key=result_key, context=context, data_trust=bundle.get("dataTrust"), error=exc)
        release_ai_run(usage_user_id)
        if cached is not None:
            return cached
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result["history"] = historical.get("history", [])
    result["historicalMoves"] = historical.get("moves", [])[:10]
    result["dataTrust"] = bundle.get("dataTrust")
    result = _publish_ai_result(result_key, result, cached, usage_user_id, context=context, data_trust=bundle.get("dataTrust"))
    cache_set("analysis", cache_key, result, UPWARD_MOVES_TTL_SECONDS)
    return result
