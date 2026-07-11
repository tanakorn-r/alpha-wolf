from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request

from internal.auth_context import account_cache_scope, user_id_from_request
from internal.ai.agents import agent_badge, normalize_agent_id
from internal.ai.context import build_analysis_context
from internal.ai.openai_client import OpenAIAnalysisError, analyze_buy_timing_with_openai, predict_technical_moves_with_openai
from internal.ai.access import claim_ai_run, release_ai_run, require_ai_account
from internal.market.deep import deep_analysis
from internal.market.buy_timing import apply_ai_narrative, build_buy_timing
from internal.market.detail import build_detail_bundle, get_domain_insights, get_financials, get_market_comparison
from internal.market.patterns import signed_moves_from_points
from internal.market.scoring import StrategyKey
from internal.store.cache import cache_get, cache_set
from models import MarketComparison, TechnicalMovesPredictionResponse

router = APIRouter()

UPWARD_MOVES_TTL_SECONDS = 900


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
                results[symbol] = value
    return {"items": results}


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
    return bundle


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


@router.get("/api/details/{symbol}/buy-timing")
def details_buy_timing(
    symbol: str,
    request: Request,
    strategy: StrategyKey = Query("stable_dca"),
    agent: str = Query("vera"),
    force: bool = Query(False),
) -> dict[str, Any]:
    require_ai_account(request, premium_required=True)
    normalized = symbol.upper()
    agent_id = normalize_agent_id(agent)
    account_scope = account_cache_scope(user_id_from_request(request))
    ai_cache_key = f"{account_scope}:ai-buy-timing:v28-live-current-month:{normalized}:{strategy}:{agent_id}"
    cached = cache_get("analysis", ai_cache_key)
    if cached is not None and not force:
        return cached

    result = build_buy_timing(normalized, strategy, force_refresh=force)
    if not result:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")
    try:
        has_price = float(result.get("price") or 0) > 0
    except (TypeError, ValueError):
        has_price = False
    if not has_price:
        # Keep the calculated fallback, but do not spend an AI call or attach a
        # perspective score when there is no valid current market price.
        return {**result, "agent": agent_badge(agent_id)}

    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        narrative = analyze_buy_timing_with_openai({"buyTiming": result}, agent_id)
        response = {**apply_ai_narrative(result, narrative), "agent": agent_badge(agent_id)}
    except (OpenAIAnalysisError, KeyError, TypeError, ValueError):
        release_ai_run(usage_user_id)
        fallback = {**result, "agent": agent_badge(agent_id)}
        cache_set("analysis", ai_cache_key, fallback, UPWARD_MOVES_TTL_SECONDS)
        return fallback
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
    account_scope = account_cache_scope(user_id_from_request(request))
    cache_key = f"{account_scope}:ai-next-10-technical:v12-agent-method:{normalized}:{timeframe}:{strategy}:{agent_id}"
    cached = cache_get("analysis", cache_key)
    if cached is not None and not force:
        return cached

    bundle = build_detail_bundle(normalized, strategy)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Symbol {normalized} not found")

    historical = signed_moves_from_points(normalized, timeframe, bundle.get("history") or [])  # type: ignore[arg-type]
    if not historical:
        raise HTTPException(status_code=404, detail=f"Not enough history for {normalized}")

    def _financials() -> dict[str, Any]:
        try:
            return get_financials(normalized) or {}
        except Exception as exc:
            print(f"Warning: Financials load failed for {normalized}: {exc}")
            return {}

    def _market() -> dict[str, Any]:
        try:
            return get_market_comparison(normalized) or {}
        except Exception as exc:
            print(f"Warning: Market comparison load failed for {normalized}: {exc}")
            return {}

    def _insights() -> dict[str, Any]:
        try:
            return get_domain_insights(normalized) or {}
        except Exception as exc:
            print(f"Warning: Domain insights load failed for {normalized}: {exc}")
            return {}

    financials_data: dict[str, Any] = {}
    market_data: dict[str, Any] = {}
    insights_data: dict[str, Any] = {}

    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {
            pool.submit(_financials): "financials",
            pool.submit(_market): "market",
            pool.submit(_insights): "insights",
        }
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                val = fut.result()
            except Exception as exc:
                print(f"Warning: {key} fetch failed for {normalized}: {exc}")
                val = {}
            if key == "financials":
                financials_data = val
            elif key == "market":
                market_data = val
            elif key == "insights":
                insights_data = val

    context = build_analysis_context(
        bundle,
        financials=financials_data,
        market_comparison=market_data,
        domain_insights=insights_data,
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

    usage_user_id, _ = claim_ai_run(request, premium_required=True)
    try:
        result = predict_technical_moves_with_openai(context, agent_id)
    except OpenAIAnalysisError as exc:
        release_ai_run(usage_user_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result["history"] = historical.get("history", [])
    result["historicalMoves"] = historical.get("moves", [])[:10]
    cache_set("analysis", cache_key, result, UPWARD_MOVES_TTL_SECONDS)
    return result
