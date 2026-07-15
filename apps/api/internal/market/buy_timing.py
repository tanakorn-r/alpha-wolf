from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import median
from typing import Any

import pandas as pd

from internal.market.deep import deep_analysis
from internal.market.detail import build_detail_bundle
from internal.market.company_structure import classify_company_structure
from internal.market.scoring import StrategyKey
from internal.market.symbol import fetch_symbol_record
from internal.store.cache import cache_get, cache_set
from internal.store.utils import as_float
from internal.yahoo.client import fetch_dividends, fetch_history, ticker as make_ticker

BUY_TIMING_CACHE_NAMESPACE = "buy_timing"
BUY_TIMING_TTL_SECONDS = 900
BUY_TIMING_PENDING_TTL_SECONDS = 2
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def build_buy_timing(symbol: str, strategy: StrategyKey = "stable_dca", force_refresh: bool = False) -> dict[str, Any] | None:
    normalized = symbol.upper().strip()
    cache_key = f"v15-industry-company-seasonality:{normalized}:{strategy}"
    cached = cache_get(BUY_TIMING_CACHE_NAMESPACE, cache_key)
    if cached is not None and not force_refresh:
        return cached

    stock = fetch_symbol_record(normalized)
    if not stock:
        return None

    ticker = make_ticker(normalized)

    # Fetch all four data sources in parallel — each is an independent network call.
    from concurrent.futures import ThreadPoolExecutor, as_completed as _as_completed

    history = pd.DataFrame()
    dividends = None
    detail: dict[str, Any] = {}
    deep: dict[str, Any] = {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {
            # Keep dividends out of Close so the backtest can book and report them explicitly.
            pool.submit(fetch_history, ticker, "5y", False): "history",
            pool.submit(fetch_dividends, ticker, "5y"): "dividends",
            pool.submit(build_detail_bundle, normalized, strategy): "detail",
            pool.submit(deep_analysis, normalized): "deep",
        }
        for fut in _as_completed(futs):
            key = futs[fut]
            try:
                val = fut.result()
            except Exception as exc:
                print(f"Warning: buy_timing {key} fetch failed for {normalized}: {exc}")
                val = None
            if key == "history":
                history = val if val is not None else pd.DataFrame()
            elif key == "dividends":
                dividends = val
            elif key == "detail":
                detail = val or {}
            elif key == "deep":
                deep = val or {}

    closes = _close_series(history)
    history_dividends = _dividend_series(history)
    current_price = as_float(stock.get("price")) or as_float(deep.get("price")) or _latest_close(closes)
    events = _dividend_events(closes, dividends)
    intervals = _event_intervals(events)
    cycle_days = int(round(median(intervals))) if intervals else (365 if events else None)
    cycle_confidence = "measured" if intervals else ("estimated_annual" if events else "none")
    next_ex = _infer_next_ex_date(events, cycle_days)
    today = date.today()
    days_to_ex = (next_ex - today).days if next_ex else None
    buy_start = next_ex + timedelta(days=1) if next_ex else None
    buy_end = next_ex + timedelta(days=10) if next_ex else None
    trim_start = next_ex - timedelta(days=10) if next_ex else None
    trim_end = next_ex - timedelta(days=1) if next_ex else None
    last_ex = events[-1]["date"] if events else None
    current_buy_start = last_ex + timedelta(days=1) if last_ex else None
    current_buy_end = last_ex + timedelta(days=10) if last_ex else None
    position_pct = _cycle_position(events, cycle_days, today)
    avg_dip = _average([event["dipPct"] for event in events])
    hit_rate = _hit_rate(events)
    recoveries = [event["recoverySessions"] for event in events if event["recoverySessions"] is not None]
    recovery_days = round(_average(recoveries)) if recoveries else None
    random_dip = _average_random_dip(closes)
    edge = (abs(avg_dip) - abs(random_dip)) if avg_dip is not None and random_dip is not None else None
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    entry_gap_pct = ((entry - current_price) / current_price * 100.0) if current_price and entry is not None else None
    upside_left_pct = ((target - current_price) / current_price * 100.0) if current_price and target is not None else None
    seasonality = _monthly_returns(closes)
    current_year_returns = _current_year_monthly_returns(closes, today, current_price)
    cheapest = min(seasonality, key=lambda item: item["returnPct"])["month"] if seasonality else None
    peak = max(seasonality, key=lambda item: item["returnPct"])["month"] if seasonality else None
    monthly_map = _monthly_map(seasonality, current_year_returns, events, cycle_days, next_ex, today)
    monthly_history = _monthly_close_history(closes, history_dividends)
    backtest = _backtest_monthly_plan(monthly_history, monthly_map)
    price_context = _price_context(closes, current_price)
    company_structure = detail.get("companyStructure") or classify_company_structure(detail.get("business") or {}, detail.get("stock") or stock)
    business_structure = _business_structure(detail.get("business"), company_structure)
    participation_context = _participation_context(detail)
    timeline = _build_timeline(today, last_ex, next_ex, current_buy_start, current_buy_end, buy_start, buy_end, trim_start, trim_end)
    pattern_good = bool(avg_dip is not None and avg_dip < -0.3 and (hit_rate or 0) >= 55)
    action = _action(pattern_good, today, current_buy_start, current_buy_end, trim_start, trim_end, current_price, deep, price_context)
    headline, summary = _fallback_narrative(normalized, action, pattern_good, current_price, deep, avg_dip, hit_rate, buy_start, buy_end)

    result = {
        "symbol": normalized,
        "name": stock.get("name") or normalized,
        "currency": stock.get("currency") or deep.get("currency") or "USD",
        "price": current_price,
        "headline": headline,
        "summary": summary,
        "action": action,
        "narrativeSource": "calculated",
        "nextBuy": {"start": _iso(buy_start), "end": _iso(buy_end), "opensInDays": _days_until(buy_start, today), "label": _window_label(buy_start, buy_end)},
        "nextTrim": {"start": _iso(trim_start), "end": _iso(trim_end), "opensInDays": _days_until(trim_start, today), "label": _window_label(trim_start, trim_end)},
        "currentBuyWindow": {"start": _iso(current_buy_start), "end": _iso(current_buy_end), "isOpen": bool(current_buy_start and current_buy_end and current_buy_start <= today <= current_buy_end)},
        "entryBand": {
            "low": as_float(deep.get("buyZoneLow")) or entry,
            "high": as_float(deep.get("buyZoneHigh")) or entry,
            "entry": entry,
            "gapPct": round(entry_gap_pct, 2) if entry_gap_pct is not None else None,
            "upsideLeftPct": round(upside_left_pct, 2) if upside_left_pct is not None else None,
            "isAtOrBelowEntry": bool(current_price is not None and entry is not None and current_price <= entry * 1.005),
        },
        "cycle": {
            "nextExDate": _iso(next_ex),
            "lastExDate": _iso(events[-1]["date"]) if events else None,
            "cycleDays": cycle_days,
            "positionPct": position_pct,
            "daysToEx": days_to_ex,
            "isInferred": bool(next_ex and cycle_days),
            "confidence": cycle_confidence,
        },
        "postExDipPattern": {
            "hasPattern": pattern_good,
            "sampleSize": len(events),
            "hitRate": round(hit_rate, 1) if hit_rate is not None else None,
            "averageDipPct": round(avg_dip, 2) if avg_dip is not None else None,
            "averageRandomDipPct": round(random_dip, 2) if random_dip is not None else None,
        },
        "stats": {
            "cyclesTested": len(events),
            "cyclesHit": sum(1 for event in events if event["dipPct"] < 0),
            "avgPostExDipPct": round(avg_dip, 2) if avg_dip is not None else None,
            "fullRecoverySessions": recovery_days,
            "edgeVsRandomBuyPct": round(edge, 2) if edge is not None else None,
        },
        "priceContext": price_context,
        "businessStructure": business_structure,
        "companyStructureProfile": company_structure,
        "participationContext": participation_context,
        "timeline": timeline,
        "seasonality": seasonality,
        "comparisonYear": today.year,
        "cheapestMonth": cheapest,
        "peakMonth": peak,
        "monthlyMap": monthly_map,
        "monthlyHistory": monthly_history,
        "backtest": backtest,
        "events": [
            {
                "exDate": _iso(event["date"]),
                "amount": event["amount"],
                "dipPct": round(event["dipPct"], 2),
                "recoverySessions": event["recoverySessions"],
            }
            for event in events[-8:]
        ],
        "technicalContext": {
            "signal": deep.get("signal"),
            "entry": as_float(deep.get("entry")),
            "target": as_float(deep.get("target")),
            "stop": as_float(deep.get("stop")),
            "support": as_float(deep.get("support")),
            "resistance": as_float(deep.get("resistance")),
            "dividendPattern": detail.get("dividendPattern"),
        },
        # Kept internal to the cached snapshot. The route selects only the sources appropriate
        # to the active Agent before sending context to the model or returning the response.
        "_sourceSnapshots": {
            "business": detail.get("business") or {},
            "technicals": detail.get("technicals") or {},
            "performance": detail.get("performance") or {},
            "industryPeers": detail.get("peerRank") or {},
            "news": (detail.get("news") or [])[:5],
        },
        "dataPending": bool(not current_price or history.empty),
        "dataTrust": detail.get("dataTrust"),
    }
    cache_set(
        BUY_TIMING_CACHE_NAMESPACE,
        cache_key,
        result,
        BUY_TIMING_PENDING_TTL_SECONDS if result["dataPending"] else BUY_TIMING_TTL_SECONDS,
    )
    return result


def build_agent_evidence(result: dict[str, Any], agent_id: str) -> dict[str, Any]:
    """Select four genuinely different source groups for the active persona."""
    agent = (agent_id or "vera").strip().lower()
    snapshots = result.get("_sourceSnapshots") if isinstance(result.get("_sourceSnapshots"), dict) else {}
    business = snapshots.get("business") if isinstance(snapshots.get("business"), dict) else {}
    technicals = snapshots.get("technicals") if isinstance(snapshots.get("technicals"), dict) else {}
    performance = snapshots.get("performance") if isinstance(snapshots.get("performance"), dict) else {}
    returns = performance.get("returns") if isinstance(performance.get("returns"), dict) else {}
    news = snapshots.get("news") if isinstance(snapshots.get("news"), list) else []
    industry_peers = snapshots.get("industryPeers") if isinstance(snapshots.get("industryPeers"), dict) else {}
    entry = result.get("entryBand") if isinstance(result.get("entryBand"), dict) else {}
    price_context = result.get("priceContext") if isinstance(result.get("priceContext"), dict) else {}
    pattern = result.get("postExDipPattern") if isinstance(result.get("postExDipPattern"), dict) else {}
    stats = result.get("stats") if isinstance(result.get("stats"), dict) else {}
    backtest = result.get("backtest") if isinstance(result.get("backtest"), dict) else {}
    currency = str(result.get("currency") or "USD")
    company_structure = result.get("companyStructureProfile") if isinstance(result.get("companyStructureProfile"), dict) else {}
    structure_value = f"{company_structure.get('label') or 'unclassified'} · {str(company_structure.get('sizeBucket') or 'unknown').replace('_', ' ').lower()}"

    fundamentals = _evidence_section("Business economics", "Company financial profile", [
        ("structure", structure_value),
        ("ROE", _pct(business.get("roe"))), ("profit margin", _pct(business.get("profitMargin"))),
        ("revenue growth", _pct(business.get("revenueGrowth"))), ("earnings growth", _pct(business.get("earningsGrowth"))),
    ])
    cash_flow = _evidence_section("Owner cash generation", "Reported company fundamentals", [
        ("free cash flow", _money(business.get("freeCashflow"), currency, compact=True)),
        ("total cash", _money(business.get("totalCash"), currency, compact=True)),
        ("total debt", _money(business.get("totalDebt"), currency, compact=True)),
        ("debt/equity", _pct(business.get("debtToEquity"))),
    ])
    valuation_source = "Market valuation + structural peer cohort" if industry_peers.get("sizeMatchedCount") else "Market valuation + derived entry band"
    valuation = _evidence_section("Valuation & entry", valuation_source, [
        ("trailing P/E", _multiple(business.get("peRatio"))), ("forward P/E", _multiple(business.get("forwardPE"))),
        ("price/book", _multiple(business.get("priceToBook"))),
        ("peer median P/B", _multiple(industry_peers.get("peerMedianPriceToBook"))),
        ("P/B vs peers", _pct(industry_peers.get("priceToBookVsPeerPct"))),
        ("peer median P/E", _multiple(industry_peers.get("peerMedianPeRatio"))),
        ("structural peers", _plain(industry_peers.get("sizeMatchedCount"))),
        ("price / buy zone", f"{_money(result.get('price'), currency)} / {_money(entry.get('low'), currency)}-{_money(entry.get('high'), currency)}"),
    ])
    balance_sheet = _evidence_section("Capital structure", "Reported balance-sheet profile", [
        ("cash", _money(business.get("totalCash"), currency, compact=True)), ("debt", _money(business.get("totalDebt"), currency, compact=True)),
        ("debt/equity", _pct(business.get("debtToEquity"))), ("ROA", _pct(business.get("roa"))),
    ])
    income = _evidence_section("Income durability", "Dividend + company fundamentals", [
        ("dividend yield", _pct(business.get("dividendYield"))), ("payout ratio", _pct(business.get("payoutRatio"))),
        ("post-ex hit rate", _pct(pattern.get("hitRate"))), ("measured cycles", _plain(pattern.get("sampleSize"))),
    ])
    tape = _evidence_section("Tape & momentum", "Price/volume technicals", [
        ("RSI(14)", _plain(technicals.get("rsi14"))), ("volume / 20D average", _multiple(technicals.get("volumeRatio"))),
        ("MACD histogram", _plain(technicals.get("macdHistogram"))), ("trend", _plain(technicals.get("trend"))),
    ])
    levels = _evidence_section("Trade levels", "20-session technical structure", [
        ("support", _money(technicals.get("support"), currency)), ("resistance", _money(technicals.get("resistance"), currency)),
        ("hard stop", _money((result.get("technicalContext") or {}).get("stop"), currency)),
        ("target", _money((result.get("technicalContext") or {}).get("target"), currency)),
    ])
    momentum = _evidence_section("Acceleration", "Historical return + momentum model", [
        ("YTD return", _pct(returns.get("ytd"))), ("1Y return", _pct(returns.get("1y"))),
        ("momentum score", _score(performance.get("momentumScore"))), ("volatility", _pct(technicals.get("volatility"))),
    ])
    catalysts = _evidence_section("Crowd & catalyst check", "Recent stored market news", [
        ("recent headlines", _headline_summary(news)), ("volume confirmation", _multiple(technicals.get("volumeRatio"))),
    ])
    statistics = _evidence_section("Measured timing edge", "Dividend-event backtest", [
        ("average post-ex dip", _pct(pattern.get("averageDipPct"))), ("hit rate", _pct(pattern.get("hitRate"))),
        ("cycles", _plain(pattern.get("sampleSize"))), ("edge vs random", _pct(stats.get("edgeVsRandomBuyPct"))),
    ])
    factors = _evidence_section("Factor snapshot", "Company + price factor inputs", [
        ("quality / ROE", _pct(business.get("roe"))), ("value / P/B", _multiple(business.get("priceToBook"))),
        ("momentum score", _score(performance.get("momentumScore"))), ("5Y range position", _pct(price_context.get("currentPct"))),
    ])
    risk = _evidence_section("Risk rule", "Volatility + technical risk inputs", [
        ("volatility", _pct(technicals.get("volatility"))), ("debt/equity", _pct(business.get("debtToEquity"))),
        ("stop", _money((result.get("technicalContext") or {}).get("stop"), currency)), ("target upside", _pct(entry.get("upsideLeftPct"))),
    ])
    simulation = _evidence_section("Plan simulation", "Five-year monthly backtest", [
        ("strategy return", _pct(backtest.get("strategyReturnPct"))), ("always-buy return", _pct(backtest.get("alwaysBuyReturnPct"))),
        ("contributed", _money(backtest.get("totalContributed"), currency)), ("ending value", _money(backtest.get("endingValue"), currency)),
    ])
    prime_structure = _evidence_section("Rule anchor · structure & funding", "Rule engine · industry-normalized company evidence", [
        ("structure", structure_value), ("ROE", _pct(business.get("roe"))),
        ("profit margin", _pct(business.get("profitMargin"))), ("revenue growth", _pct(business.get("revenueGrowth"))),
        ("free cash flow", _money(business.get("freeCashflow"), currency, compact=True)),
        ("debt/equity", _pct(business.get("debtToEquity"))),
    ])
    prime_value_income = _evidence_section("Ownership case · value & income", "Valuation, structural peers + income evidence", [
        ("trailing P/E", _multiple(business.get("peRatio"))), ("forward P/E", _multiple(business.get("forwardPE"))),
        ("price/book", _multiple(business.get("priceToBook"))), ("peer median P/B", _multiple(industry_peers.get("peerMedianPriceToBook"))),
        ("dividend yield", _pct(business.get("dividendYield"))), ("payout ratio", _pct(business.get("payoutRatio"))),
        ("price / buy zone", f"{_money(result.get('price'), currency)} / {_money(entry.get('low'), currency)}-{_money(entry.get('high'), currency)}"),
    ])
    prime_timing = _evidence_section("AI judgment · regime & execution", "Tape, catalysts + measured timing evidence", [
        ("RSI(14)", _plain(technicals.get("rsi14"))), ("volume / 20D average", _multiple(technicals.get("volumeRatio"))),
        ("trend", _plain(technicals.get("trend"))), ("momentum score", _score(performance.get("momentumScore"))),
        ("recent headlines", _headline_summary(news)), ("edge vs random", _pct(stats.get("edgeVsRandomBuyPct"))),
        ("measured cycles", _plain(pattern.get("sampleSize"))),
    ])
    prime_risk = _evidence_section("Portfolio decision · risk & benchmark", "Risk engine, trade levels + DCA comparison", [
        ("volatility", _pct(technicals.get("volatility"))),
        ("hard stop", _money((result.get("technicalContext") or {}).get("stop"), currency)),
        ("target upside", _pct(entry.get("upsideLeftPct"))),
        ("strategy return", _pct(backtest.get("strategyReturnPct"))),
        ("always-buy return", _pct(backtest.get("alwaysBuyReturnPct"))),
        ("exposure-normalized return", _pct(backtest.get("exposureNormalizedReturnPct"))),
        ("average stock exposure", _pct(backtest.get("averageStockExposurePct"))),
    ])

    profiles = {
        "vera": ("Institutional underwriting", [fundamentals, balance_sheet, valuation, risk]),
        "ben": ("Owner-quality research", [fundamentals, cash_flow, balance_sheet, valuation]),
        "sam": ("Income-source research", [income, cash_flow, balance_sheet, valuation]),
        "rex": ("Trading-desk sources", [tape, levels, momentum, risk]),
        "kai": ("Momentum & attention sources", [catalysts, tape, momentum, levels]),
        "nadia": ("Systematic research sources", [statistics, factors, risk, simulation]),
        "alphawolf": ("Prime hybrid council stack", [prime_structure, prime_value_income, prime_timing, prime_risk]),
    }
    profile, sections = profiles.get(agent, profiles["vera"])
    return {"agentId": agent, "profile": profile, "sections": sections}


def _evidence_section(label: str, source: str, metrics: list[tuple[str, str]]) -> dict[str, Any]:
    return {"label": label, "source": source, "metrics": [{"label": key, "value": value} for key, value in metrics]}


def _plain(value: Any) -> str:
    number = as_float(value)
    if number is not None:
        return f"{number:,.2f}".rstrip("0").rstrip(".")
    return str(value) if value not in (None, "") else "unavailable"


def _pct(value: Any) -> str:
    number = as_float(value)
    return f"{number:,.1f}%" if number is not None else "unavailable"


def _multiple(value: Any) -> str:
    number = as_float(value)
    return f"{number:,.2f}x" if number is not None else "unavailable"


def _score(value: Any) -> str:
    number = as_float(value)
    return f"{number:,.0f}/100" if number is not None else "unavailable"


def _money(value: Any, currency: str, compact: bool = False) -> str:
    number = as_float(value)
    if number is None:
        return "unavailable"
    if compact and abs(number) >= 1_000_000_000:
        return f"{currency} {number / 1_000_000_000:,.2f}B"
    if compact and abs(number) >= 1_000_000:
        return f"{currency} {number / 1_000_000:,.2f}M"
    return f"{currency} {number:,.2f}"


def _headline_summary(news: list[Any]) -> str:
    titles = [str(item.get("title")) for item in news if isinstance(item, dict) and item.get("title")]
    return " | ".join(titles[:2]) if titles else "unavailable"


def apply_ai_narrative(result: dict[str, Any], narrative: dict[str, Any]) -> dict[str, Any]:
    narrative_agent = narrative.get("agent") if isinstance(narrative.get("agent"), dict) else {}
    monthly_plan = _valid_agent_monthly_plan(
        result.get("monthlyMap"),
        narrative.get("monthlyPlan"),
        narrative_agent.get("id"),
        result.get("businessStructure"),
    )
    action = narrative.get("action") or result["action"]
    agent_fit = narrative.get("agentFit")
    # Company/philosophy fit and today's execution are separate concepts. An aligned company can
    # be a WAIT at today's price; collapsing it to neutral makes the thesis contradict the plan.
    if action == "BUY" and agent_fit == "against":
        agent_fit = "neutral"
    agent_backtest = _backtest_monthly_plan(
        result.get("monthlyHistory"), monthly_plan, narrative_agent.get("id")
    ) if monthly_plan else result.get("backtest")
    if isinstance(agent_backtest, dict) and monthly_plan:
        agent_backtest = {
            **agent_backtest,
            "battlefield": _evaluate_agent_battlefield(
                agent_backtest,
                narrative_agent.get("id"),
                result.get("businessStructure"),
                result.get("participationContext"),
            ),
        }
    return {
        **result,
        "headline": narrative.get("headline") or result["headline"],
        "summary": narrative.get("summary") or result["summary"],
        "strategyQuote": narrative.get("strategyQuote"),
        "action": action,
        "perspectiveScore": narrative.get("perspectiveScore"),
        "perspectiveReason": narrative.get("perspectiveReason"),
        "coreBelief": narrative.get("coreBelief"),
        "evidencePriority": narrative.get("evidencePriority"),
        "fitExplanation": narrative.get("fitExplanation"),
        "thesisBreaker": narrative.get("thesisBreaker"),
        "narrativeSource": narrative.get("source") or "openai",
        "model": narrative.get("model"),
        "recap": narrative.get("recap"),
        "agentFit": agent_fit,
        "agentFitReason": narrative.get("agentFitReason"),
        "todayInstruction": narrative.get("todayInstruction"),
        "nextMove": narrative.get("nextMove"),
        "nextMoveTiming": narrative.get("nextMoveTiming"),
        "buyCondition": narrative.get("buyCondition"),
        "reduceCondition": narrative.get("reduceCondition"),
        "agentMonthlyPlan": monthly_plan,
        "backtest": agent_backtest,
        "generatedAt": narrative.get("generatedAt"),
    }


def _valid_agent_monthly_plan(
    calculated: Any,
    proposed: Any,
    agent_id: str | None = None,
    business_structure: Any = None,
) -> list[dict[str, Any]] | None:
    if not isinstance(calculated, list) or not isinstance(proposed, list):
        return None
    evidence = {item.get("month"): item for item in calculated if isinstance(item, dict) and item.get("month") in MONTHS}
    decisions = {item.get("month"): item for item in proposed if isinstance(item, dict) and item.get("month") in MONTHS}
    if len(evidence) != 12 or len(decisions) != 12:
        return None
    plan: list[dict[str, Any]] = []
    for month in MONTHS:
        decision = decisions[month]
        action = decision.get("action")
        buy_pct = max(0, min(100, int(decision.get("buyBudgetPct") or 0)))
        trim_pct = max(0, min(100, int(decision.get("trimPositionPct") or 0)))
        if action in {"BUY", "ADD_SMALL"}:
            buy_pct = buy_pct or 25
            trim_pct = 0
        elif action in {"TRIM", "SELL"}:
            buy_pct = 0
            trim_pct = trim_pct or (100 if action == "SELL" else 25)
        else:
            buy_pct = 0
            trim_pct = 0
        plan.append({
            **evidence[month],
            "calculatedAction": evidence[month].get("action"),
            "action": action,
            "buyBudgetPct": buy_pct,
            "trimPositionPct": trim_pct,
            "reason": decision.get("reason"),
        })

    # Preserve the selected Agent's decision. Monthly-budget semantics are universal, while the
    # action and size must remain the result of that Agent's own evidence gates and character.
    return plan


def _business_structure(business: Any, company_structure: Any = None) -> dict[str, Any]:
    source = business if isinstance(business, dict) else {}
    profile = company_structure if isinstance(company_structure, dict) else classify_company_structure(source)
    archetype = str(profile.get("archetype") or "OPERATING_COMPANY")
    roe = as_float(source.get("roe"))
    margin = as_float(source.get("profitMargin"))
    revenue_growth = as_float(source.get("revenueGrowth"))
    debt_to_equity = as_float(source.get("debtToEquity"))
    available = [value for value in (roe, margin, revenue_growth, debt_to_equity) if value is not None]
    ordinary_debt_archetypes = {
        "OPERATING_COMPANY", "INDUSTRIAL", "CONSUMER_STAPLES",
        "CONSUMER_DISCRETIONARY", "GROWTH_TECH", "HEALTHCARE",
    }
    at_risk_reasons = [
        reason for condition, reason in (
            (margin is not None and margin < 0, "negative profit margin"),
            (roe is not None and roe < 0, "negative return on equity"),
            (archetype in ordinary_debt_archetypes and debt_to_equity is not None and debt_to_equity > 250, "very high debt to equity"),
            (archetype == "UTILITY" and debt_to_equity is not None and debt_to_equity > 500, "utility leverage above the broad structural guardrail"),
        ) if condition
    ]
    industry_native_archetype = archetype not in ordinary_debt_archetypes and archetype != "UTILITY"
    industry_native_positive = bool(
        industry_native_archetype
        and roe is not None and roe > 0
        and margin is not None and margin > 0
    )
    if industry_native_archetype:
        # Corporate leverage cutoffs are category errors for balance-sheet businesses and for
        # industry structures whose debt must be tested through coverage, assets, leases, backlog,
        # inventory, or mid-cycle cash flow.
        # Mark the limited snapshot intact only on positive economics; the profile tells the Agent
        # which specialist capital/coverage evidence is still required before conviction.
        # Positive snapshot economics prevent a false corporate-leverage veto, but specialist
        # capital/coverage evidence is still needed before calling the structure fully intact.
        intact = False
    elif archetype == "UTILITY":
        intact = margin is not None and margin > 0 and roe is not None and roe > 0 and (debt_to_equity is None or debt_to_equity <= 500)
    else:
        intact = margin is not None and margin > 0 and roe is not None and roe > 0 and (debt_to_equity is None or debt_to_equity <= 200)
    status = "AT_RISK" if at_risk_reasons else "INTACT" if intact else "MIXED" if available else "UNPROVEN"
    ownership_eligible = bool(not at_risk_reasons and (intact or industry_native_positive))
    return {
        "status": status,
        "archetype": archetype,
        "ownershipEligible": ownership_eligible,
        "industryNativeStatus": (
            "POSITIVE_BUT_SPECIALIST_METRICS_INCOMPLETE" if industry_native_positive
            else "SPECIALIST_METRICS_INCOMPLETE" if industry_native_archetype
            else "POSITIVE" if intact
            else status
        ),
        "genericLeverageIgnored": industry_native_archetype,
        "roe": roe,
        "profitMargin": margin,
        "revenueGrowth": revenue_growth,
        "debtToEquity": debt_to_equity,
        "reasons": at_risk_reasons,
        "companyStructureProfile": profile,
    }


def _participation_context(detail: dict[str, Any]) -> dict[str, Any]:
    technicals = detail.get("technicals") if isinstance(detail.get("technicals"), dict) else {}
    performance = detail.get("performance") if isinstance(detail.get("performance"), dict) else {}
    returns = performance.get("returns") if isinstance(performance.get("returns"), dict) else {}
    stock = detail.get("stock") if isinstance(detail.get("stock"), dict) else {}
    price = as_float(stock.get("price"))
    sma50 = as_float(technicals.get("sma50"))
    sma200 = as_float(technicals.get("sma200"))
    one_year = as_float(returns.get("1y"))
    momentum_score = as_float(performance.get("momentumScore"))
    bullish_signals = sum((
        bool(price is not None and sma50 is not None and price > sma50),
        bool(price is not None and sma200 is not None and price > sma200),
        bool(one_year is not None and one_year > 0),
        bool(momentum_score is not None and momentum_score >= 55),
    ))
    bearish_signals = sum((
        bool(price is not None and sma50 is not None and price < sma50),
        bool(price is not None and sma200 is not None and price < sma200),
        bool(one_year is not None and one_year < -15),
        bool(momentum_score is not None and momentum_score <= 40),
    ))
    regime = "BULL" if bullish_signals >= 3 else "BEAR" if bearish_signals >= 3 else "MIXED"
    return {
        "regime": regime,
        "bullishSignals": bullish_signals,
        "bearishSignals": bearish_signals,
        "priceAboveSma50": bool(price is not None and sma50 is not None and price > sma50),
        "priceAboveSma200": bool(price is not None and sma200 is not None and price > sma200),
        "oneYearReturnPct": one_year,
        "momentumScore": momentum_score,
        "instruction": "Balance permanent-loss risk against non-participation/cash-drag risk. A bull regime is a sizing tailwind, not an automatic buy.",
    }


def _dividend_events(closes: pd.Series, dividends: pd.Series) -> list[dict[str, Any]]:
    if closes.empty or dividends is None or dividends.empty:
        return []
    events: list[dict[str, Any]] = []
    for ex_index, amount in dividends.dropna().items():
        ex_date = _date(ex_index)
        before = closes[closes.index.date <= ex_date]
        after = closes[(closes.index.date > ex_date) & (closes.index.date <= ex_date + timedelta(days=10))]
        after_30 = closes[(closes.index.date > ex_date) & (closes.index.date <= ex_date + timedelta(days=45))]
        if before.empty or after.empty:
            continue
        pre_price = float(before.iloc[-1])
        if not pre_price:
            continue
        post_low = float(after.min())
        recovery_sessions = None
        recovered = after_30[after_30 >= pre_price]
        if not recovered.empty:
            recovery_sessions = int(after_30.index.get_loc(recovered.index[0]) + 1)
        events.append({"date": ex_date, "amount": as_float(amount), "dipPct": (post_low - pre_price) / pre_price * 100.0, "recoverySessions": recovery_sessions})
    return sorted(events, key=lambda event: event["date"])


def _monthly_returns(closes: pd.Series) -> list[dict[str, Any]]:
    if closes.empty:
        return [{"month": month, "returnPct": 0.0} for month in MONTHS]
    monthly = closes.resample("ME").last().pct_change().dropna() * 100.0
    return [{"month": month, "returnPct": round(float(monthly[monthly.index.month == index + 1].mean()) if not monthly[monthly.index.month == index + 1].empty else 0.0, 2)} for index, month in enumerate(MONTHS)]


def _monthly_close_history(closes: pd.Series, dividends: pd.Series | None = None) -> list[dict[str, Any]]:
    if closes.empty:
        return []
    monthly = closes.resample("ME").last().dropna().tail(61)
    monthly_dividends = dividends.resample("ME").sum() if dividends is not None and not dividends.empty else pd.Series(dtype="float64")
    return [{
        "date": index.date().isoformat(),
        "month": MONTHS[index.month - 1],
        "close": round(float(value), 6),
        "dividendPerShare": round(float(monthly_dividends.get(index, 0.0)), 6),
    } for index, value in monthly.items()]


def _backtest_monthly_plan(history: Any, plan: Any, agent_id: str | None = None) -> dict[str, Any] | None:
    if not isinstance(history, list) or len(history) < 13 or not isinstance(plan, list):
        return None
    decisions = {item.get("month"): item for item in plan if isinstance(item, dict)}
    strategy_shares = 0.0
    strategy_cash = 0.0
    benchmark_shares = 0.0
    strategy_no_div_shares = strategy_no_div_cash = benchmark_no_div_shares = 0.0
    invested_months = 0
    observed_months = 0
    monthly_contribution = 100.0
    ledger: list[dict[str, Any]] = []
    strategy_index = benchmark_index = 100.0
    strategy_peak = benchmark_peak = 100.0
    strategy_max_drawdown = benchmark_max_drawdown = 0.0
    previous_strategy_value = previous_benchmark_value = 0.0
    strategy_dividends_received = benchmark_dividends_reinvested = 0.0
    strategy_dividends_reinvested = 0.0
    agent = (agent_id or "").strip().lower()
    strategic_owner = agent in {"vera", "ben", "sam", "alphawolf"}
    tactical_agent = agent in {"rex", "kai"}
    reinvest_agent_dividends = strategic_owner
    for point in history:
        if not isinstance(point, dict):
            continue
        price = as_float(point.get("close"))
        month = point.get("month")
        if not price or month not in MONTHS:
            continue
        dividend_per_share = max(0.0, as_float(point.get("dividendPerShare")) or 0.0)
        strategy_dividend = strategy_shares * dividend_per_share
        benchmark_dividend = benchmark_shares * dividend_per_share
        if strategy_dividend > 0:
            strategy_dividends_received += strategy_dividend
            if reinvest_agent_dividends:
                strategy_shares += strategy_dividend / price
                strategy_dividends_reinvested += strategy_dividend
            else:
                strategy_cash += strategy_dividend
        if benchmark_dividend > 0:
            benchmark_shares += benchmark_dividend / price
            benchmark_dividends_reinvested += benchmark_dividend
        # Measure drawdown without letting a fresh monthly deposit mask a market loss. The
        # pre-contribution values capture only the return earned by last month's portfolio.
        strategy_value_before_flow = strategy_cash + strategy_shares * price
        benchmark_value_before_flow = benchmark_shares * price
        if previous_strategy_value > 0:
            strategy_index *= strategy_value_before_flow / previous_strategy_value
            strategy_peak = max(strategy_peak, strategy_index)
            strategy_max_drawdown = min(strategy_max_drawdown, (strategy_index / strategy_peak - 1.0) * 100.0)
        if previous_benchmark_value > 0:
            benchmark_index *= benchmark_value_before_flow / previous_benchmark_value
            benchmark_peak = max(benchmark_peak, benchmark_index)
            benchmark_max_drawdown = min(benchmark_max_drawdown, (benchmark_index / benchmark_peak - 1.0) * 100.0)
        observed_months += 1
        strategy_cash += monthly_contribution
        benchmark_shares += monthly_contribution / price
        strategy_no_div_cash += monthly_contribution
        benchmark_no_div_shares += monthly_contribution / price
        decision = decisions.get(month) or {}
        action = decision.get("action")
        fallback_pct = 100 if action in {"BUY", "ADD_SMALL"} else 0
        buy_pct = max(0.0, min(100.0, float(decision.get("buyBudgetPct", fallback_pct) or 0)))
        # Tactical sizing belongs to this month's DCA envelope. Strategic owners additionally put
        # accumulated reserve back to work as conviction rises: 75% redeploys half of prior reserve
        # and 100% redeploys all of it. This prevents a temporary HOLD/TRIM from becoming permanent
        # cash drag while keeping 25/50% starter sizes genuinely incremental.
        reserve_redeployment_pct = max(0.0, min(100.0, (buy_pct - 50.0) * 2.0)) if strategic_owner else 0.0
        prior_reserve = max(0.0, strategy_cash - monthly_contribution)
        buy_amount = (
            strategy_cash * buy_pct / 100.0
            if tactical_agent else
            min(
                strategy_cash,
                monthly_contribution * buy_pct / 100.0 + prior_reserve * reserve_redeployment_pct / 100.0,
            )
        )
        if buy_amount > 0:
            strategy_shares += buy_amount / price
            strategy_cash -= buy_amount
            invested_months += 1
        no_div_prior_reserve = max(0.0, strategy_no_div_cash - monthly_contribution)
        no_div_buy_amount = (
            strategy_no_div_cash * buy_pct / 100.0
            if tactical_agent else
            min(
                strategy_no_div_cash,
                monthly_contribution * buy_pct / 100.0 + no_div_prior_reserve * reserve_redeployment_pct / 100.0,
            )
        )
        if no_div_buy_amount > 0:
            strategy_no_div_shares += no_div_buy_amount / price
            strategy_no_div_cash -= no_div_buy_amount
        trim_pct = max(0.0, min(100.0, float(decision.get("trimPositionPct", 0) or 0)))
        if trim_pct > 0 and strategy_shares > 0:
            shares_sold = strategy_shares * trim_pct / 100.0
            strategy_shares -= shares_sold
            strategy_cash += shares_sold * price
        if trim_pct > 0 and strategy_no_div_shares > 0:
            no_div_shares_sold = strategy_no_div_shares * trim_pct / 100.0
            strategy_no_div_shares -= no_div_shares_sold
            strategy_no_div_cash += no_div_shares_sold * price
        contributed = observed_months * monthly_contribution
        stock_value = strategy_shares * price
        account_value = strategy_cash + stock_value
        previous_strategy_value = account_value
        previous_benchmark_value = benchmark_shares * price
        ledger.append({"date": point.get("date"), "month": month, "action": action, "buyBudgetPct": round(buy_pct), "trimPositionPct": round(trim_pct), "dividendIncome": round(strategy_dividend, 2), "contributed": round(contributed, 2), "cash": round(strategy_cash, 2), "stockValue": round(stock_value, 2), "accountValue": round(account_value, 2), "profitLoss": round(account_value - contributed, 2)})
    if not observed_months or not ledger:
        return None
    final_price = as_float(history[-1].get("close"))
    contributed = observed_months * monthly_contribution
    stock_value = strategy_shares * final_price
    account_value = strategy_cash + stock_value
    benchmark_value = benchmark_shares * final_price
    strategy_no_div_value = strategy_no_div_cash + strategy_no_div_shares * final_price
    benchmark_no_div_value = benchmark_no_div_shares * final_price
    exposure_samples = [
        float(item["stockValue"]) / float(item["accountValue"]) * 100.0
        for item in ledger
        if float(item.get("accountValue") or 0) > 0
    ]
    average_stock_exposure = sum(exposure_samples) / len(exposure_samples) if exposure_samples else 0.0
    strategy_return = (account_value / contributed - 1.0) * 100.0
    benchmark_return = (benchmark_value / contributed - 1.0) * 100.0
    strategy_no_div_return = (strategy_no_div_value / contributed - 1.0) * 100.0
    benchmark_no_div_return = (benchmark_no_div_value / contributed - 1.0) * 100.0
    contribution_flows = [
        (date.fromisoformat(str(item["date"])), -monthly_contribution)
        for item in ledger
    ]
    final_date = date.fromisoformat(str(ledger[-1]["date"]))
    strategy_xirr = _xirr([*contribution_flows, (final_date, account_value)])
    benchmark_xirr = _xirr([*contribution_flows, (final_date, benchmark_value)])
    exposure_normalized_return = (
        strategy_return / (average_stock_exposure / 100.0)
        if average_stock_exposure > 0 else None
    )
    matched_exposure_benchmark_return = benchmark_return * average_stock_exposure / 100.0
    return {
        "years": round(observed_months / 12.0, 1),
        "observedMonths": observed_months,
        "investedMonths": invested_months,
        "skippedMonths": observed_months - invested_months,
        "strategyReturnPct": round(strategy_return, 2),
        "alwaysBuyReturnPct": round(benchmark_return, 2),
        "strategyMoneyWeightedReturnPct": round(strategy_xirr * 100.0, 2) if strategy_xirr is not None else None,
        "alwaysBuyMoneyWeightedReturnPct": round(benchmark_xirr * 100.0, 2) if benchmark_xirr is not None else None,
        "exposureNormalizedReturnPct": round(exposure_normalized_return, 2) if exposure_normalized_return is not None else None,
        "matchedExposureBenchmarkReturnPct": round(matched_exposure_benchmark_return, 2),
        "strategyReturnWithoutDividendsPct": round(strategy_no_div_return, 2),
        "alwaysBuyReturnWithoutDividendsPct": round(benchmark_no_div_return, 2),
        "strategyDividendReturnBoostPct": round(strategy_return - strategy_no_div_return, 2),
        "alwaysBuyDividendReturnBoostPct": round(benchmark_return - benchmark_no_div_return, 2),
        "edgePct": round(strategy_return - benchmark_return, 2),
        "strategyMaxDrawdownPct": round(abs(strategy_max_drawdown), 2),
        "alwaysBuyMaxDrawdownPct": round(abs(benchmark_max_drawdown), 2),
        "averageStockExposurePct": round(average_stock_exposure, 2),
        "agentDividendsReceived": round(strategy_dividends_received, 2),
        "agentDividendsReinvested": round(strategy_dividends_reinvested, 2),
        "alwaysBuyDividendsReinvested": round(benchmark_dividends_reinvested, 2),
        "monthlyContribution": monthly_contribution,
        "totalContributed": round(contributed, 2),
        "endingValue": round(account_value, 2),
        "endingCash": round(strategy_cash, 2),
        "endingStockValue": round(stock_value, 2),
        "profitLoss": round(account_value - contributed, 2),
        "alwaysBuyEndingValue": round(benchmark_value, 2),
        "ledger": ledger,
        "method": (
            "Starts at 0 and delegates 100 each historical month. "
            + (
                "Each buy first deploys the stated percentage of that month's 100 budget; a later 75% buy "
                "redeploys half of accumulated reserve and a 100% buy redeploys all reserve. "
                if strategic_owner else
                "Each tactical buy deploys the stated percentage of all currently available strategy cash. "
                if tactical_agent else
                "Each buy deploys the stated percentage of that month's 100 budget only; unused monthly "
                "budget and trim proceeds remain reserve and are never swept automatically. "
            )
            +
            "Strategic long-horizon Agents reinvest received dividends; other Agents bank them as cash. "
            "Trims sell the stated share percentage. "
            "Normal DCA invests its full monthly contribution and reinvests dividends at that month-end "
            "close. Held shares revalue at actual unadjusted month-end closes."
        ),
        "inSample": True,
        "historicalClaimEligible": False,
        "validation": {
            "status": "NOT_VALIDATED",
            "method": "walk-forward / out-of-sample required",
            "reason": (
                "This plan was generated after the displayed history was known. Its replay is an "
                "in-sample diagnostic and cannot support a performance or skill claim."
            ),
        },
    }


def _evaluate_agent_battlefield(
    result: dict[str, Any], agent_id: str | None,
    business_structure: Any = None, participation_context: Any = None,
) -> dict[str, Any]:
    """Judge each persona on its declared objective without manufacturing a win."""
    agent = (agent_id or "vera").strip().lower()
    structure = business_structure if isinstance(business_structure, dict) else {}
    participation = participation_context if isinstance(participation_context, dict) else {}
    actual = float(result.get("strategyReturnPct") or 0)
    dca = float(result.get("alwaysBuyReturnPct") or 0)
    normalized = result.get("exposureNormalizedReturnPct")
    normalized = float(normalized) if normalized is not None else None
    exposure = float(result.get("averageStockExposurePct") or 0)
    agent_drawdown = float(result.get("strategyMaxDrawdownPct") or 0)
    dca_drawdown = float(result.get("alwaysBuyMaxDrawdownPct") or 0)
    matched = float(result.get("matchedExposureBenchmarkReturnPct") or 0)
    raw_edge = actual - dca
    normalized_edge = (normalized - dca) if normalized is not None else None
    drawdown_saved = dca_drawdown - agent_drawdown
    owner_favorable = bool(
        structure.get("ownershipEligible")
        and participation.get("regime") == "BULL"
    )

    if agent in {"vera", "ben", "sam"}:
        kind = "OWNER_COMPOUNDING"
        label = "ownership & compounding"
        objective = "Stay meaningfully invested in an ownable business and beat full DCA without relying on low exposure."
        primary_label, primary, benchmark_label, benchmark = "Owner return · 100% exposure", normalized, "Full DCA return", dca
        edge = normalized_edge
        if owner_favorable and exposure < 65:
            verdict = "LOSS"
            explanation = "Ownable structure plus a bull regime demanded participation; cash drag lost this battlefield."
        elif normalized_edge is not None and normalized_edge > 0.5 and exposure >= 65:
            verdict = "WIN"
            explanation = "The ownership plan added exposure-normalized edge while maintaining meaningful participation."
        elif normalized_edge is not None and normalized_edge >= -1.0 and exposure >= 70:
            verdict = "MATCH"
            explanation = "The owner core stayed close to full DCA after exposure; its next test is adding repeatable tilt edge."
        else:
            verdict = "LOSS"
            explanation = "The plan trailed full DCA after exposure or carried too little capital for an ownership mandate."
    elif agent in {"rex", "kai"}:
        kind = "TACTICAL_SWING"
        label = "swing capture"
        objective = "Use selective exposure to capture high-energy moves with better return per unit of exposure and controlled exits."
        primary_label, primary, benchmark_label, benchmark = "Exposure-normalized swing return", normalized, "Full DCA return", dca
        edge = normalized_edge
        if normalized_edge is not None and normalized_edge > 1.0 and drawdown_saved >= 0 and exposure >= 5:
            verdict = "WIN"
            explanation = "The tactical plan earned more per unit of exposure without a worse drawdown."
        elif normalized_edge is not None and abs(normalized_edge) <= 1.0 and drawdown_saved >= 0:
            verdict = "MATCH"
            explanation = "The swing plan roughly matched DCA efficiency while using a tactical exposure path."
        else:
            verdict = "LOSS"
            explanation = "The entries and exits failed to create enough exposure-normalized edge for a tactical mandate."
    elif agent == "nadia":
        kind = "RISK_EFFICIENCY"
        label = "risk-adjusted efficiency"
        objective = "Improve return per unit of drawdown and beat the return expected from the same average exposure."
        agent_efficiency = actual / max(agent_drawdown, 1.0)
        dca_efficiency = dca / max(dca_drawdown, 1.0)
        primary_label, primary, benchmark_label, benchmark = "AI return / drawdown", agent_efficiency, "DCA return / drawdown", dca_efficiency
        edge = agent_efficiency - dca_efficiency
        matched_edge = actual - matched
        if edge > 0.05 and drawdown_saved > 0 and matched_edge >= -0.5 and exposure >= 15:
            verdict = "WIN"
            explanation = "The quant plan improved return per drawdown and justified its risk reduction at matched exposure."
        elif abs(edge) <= 0.05 and drawdown_saved >= 0 and exposure >= 15:
            verdict = "MATCH"
            explanation = "The risk model roughly matched DCA efficiency; the lower drawdown did not yet create clear alpha."
        else:
            verdict = "LOSS"
            explanation = "Cash or risk reduction did not produce enough return efficiency to justify the foregone exposure."
    else:
        kind = "HYBRID_ALLOCATION"
        label = "hybrid allocation"
        objective = "Combine participation, timing, and downside control to beat DCA on exposure-normalized return without hiding in cash."
        primary_label, primary, benchmark_label, benchmark = "Hybrid return · normalized", normalized, "Full DCA return", dca
        edge = normalized_edge
        matched_edge = actual - matched
        if normalized_edge is not None and normalized_edge > 0.5 and matched_edge >= 0 and drawdown_saved >= 0 and exposure >= 25:
            verdict = "WIN"
            explanation = "Prime added normalized edge, beat matched exposure, and did not worsen drawdown."
        elif normalized_edge is not None and abs(normalized_edge) <= 0.5 and matched_edge >= -0.5 and exposure >= 25:
            verdict = "MATCH"
            explanation = "Prime roughly matched DCA after exposure; the hybrid council did not yet add decisive edge."
        else:
            verdict = "LOSS"
            explanation = "Prime failed to justify its allocation through return, exposure, and downside control together."

    unit = "ratio" if kind == "RISK_EFFICIENCY" else "percent"
    return {
        "kind": kind,
        "label": label,
        "objective": objective,
        "verdict": verdict,
        "primaryMetricLabel": primary_label,
        "primaryValue": round(primary, 2) if primary is not None else None,
        "benchmarkLabel": benchmark_label,
        "benchmarkValue": round(benchmark, 2),
        "edgeValue": round(edge, 2) if edge is not None else None,
        "unit": unit,
        "explanation": explanation,
        "expectedTailwind": owner_favorable,
    }


def _xirr(flows: list[tuple[date, float]]) -> float | None:
    """Annual money-weighted return for irregular dated deposits and one ending value."""
    if len(flows) < 2 or not any(value < 0 for _, value in flows) or not any(value > 0 for _, value in flows):
        return None
    start = min(flow_date for flow_date, _ in flows)

    def npv(rate: float) -> float:
        return sum(value / ((1.0 + rate) ** ((flow_date - start).days / 365.0)) for flow_date, value in flows)

    low = -0.9999
    high = 1.0
    low_value = npv(low)
    high_value = npv(high)
    while low_value * high_value > 0 and high < 1_000:
        high *= 2.0
        high_value = npv(high)
    if low_value * high_value > 0:
        return None
    for _ in range(120):
        middle = (low + high) / 2.0
        middle_value = npv(middle)
        if abs(middle_value) < 1e-8:
            return middle
        if low_value * middle_value <= 0:
            high = middle
        else:
            low = middle
            low_value = middle_value
    return (low + high) / 2.0


def _monthly_map(seasonality: list[dict[str, Any]], current_year_returns: dict[str, float], events: list[dict[str, Any]], cycle_days: int | None, next_ex: date | None, today: date) -> list[dict[str, Any]]:
    # Turn the two timing signals into one actionable per-calendar-month call: green = buy, red =
    # trim. Seasonality says which months are historically weak (accumulate) vs strong (lighten);
    # the dividend cycle says which months hold the post-ex dip (buy) vs the pre-ex run-up (trim).
    # We blend them 50/50 when a cycle exists, else fall back to seasonality alone.
    returns = [float(item.get("returnPct") or 0.0) for item in seasonality] if seasonality else [0.0] * 12
    max_abs = max((abs(value) for value in returns), default=0.0) or 1.0

    buy_months: set[int] = set()
    trim_months: set[int] = set()
    ex_months: set[int] = set()
    anchor = next_ex or (events[-1]["date"] if events else None)
    if anchor and cycle_days and cycle_days > 0:
        # Project ex-dates across a wide window so every calendar month is covered regardless of
        # cycle length (quarterly fills ~4 buy/4 trim months, semi-annual ~2 each).
        step = timedelta(days=cycle_days)
        event = anchor
        while event > today - timedelta(days=400):
            event -= step
        limit = today + timedelta(days=400)
        while event <= limit:
            # At month granularity: the ex month is the pre-dividend run-up (trim into strength),
            # the following month carries the post-ex dip + recovery (buy). A ±few-day split would
            # collapse both into the ex month and cancel out, so separate them by a month.
            ex_months.add(event.month - 1)
            trim_months.add(event.month - 1)
            buy_months.add((event + timedelta(days=20)).month - 1)
            event += step

    has_cycle = bool(buy_months or trim_months)
    w_season = 0.5 if has_cycle else 1.0
    w_cycle = 0.5 if has_cycle else 0.0

    result: list[dict[str, Any]] = []
    for index, month in enumerate(MONTHS):
        seasonal_unit = max(-1.0, min(1.0, -returns[index] / max_abs))  # weak month (drop) -> buy
        cycle_unit = 0.0
        in_buy = index in buy_months
        in_trim = index in trim_months
        if in_buy and not in_trim:
            cycle_unit = 1.0
        elif in_trim and not in_buy:
            cycle_unit = -1.0
        score = round((w_season * seasonal_unit + w_cycle * cycle_unit) * 100)
        action = "BUY" if score >= 20 else "TRIM" if score <= -20 else "HOLD"
        notes: list[str] = []
        if in_buy and not in_trim:
            notes.append("post-ex dip window")
        if in_trim and not in_buy:
            notes.append("pre-ex run-up")
        if seasonal_unit >= 0.35:
            notes.append("seasonally weak")
        elif seasonal_unit <= -0.35:
            notes.append("seasonally strong")
        result.append({
            "month": month,
            "score": score,
            "action": action,
            "returnPct": round(returns[index], 2),
            "currentYearReturnPct": current_year_returns.get(month),
            "isExMonth": index in ex_months,
            "isCurrent": index == today.month - 1,
            "note": ", ".join(notes) or "neutral",
        })
    return result


def _current_year_monthly_returns(closes: pd.Series, today: date, current_price: float | None = None) -> dict[str, float]:
    if closes.empty:
        return {}
    monthly = closes.resample("ME").last().dropna()
    returns = monthly.pct_change() * 100.0
    result = {
        MONTHS[index.month - 1]: round(float(value), 2)
        for index, value in returns.items()
        if index.year == today.year and index.month <= today.month and pd.notna(value)
    }
    # The current calendar month is still forming. Use the latest quote against the previous
    # completed month-end so Refresh updates MTD instead of freezing at Yahoo's last daily bar.
    if current_price is not None and current_price > 0:
        before_current_month = monthly[(monthly.index.year < today.year) | (monthly.index.month < today.month)]
        if not before_current_month.empty:
            previous_month_close = float(before_current_month.iloc[-1])
            if previous_month_close > 0:
                result[MONTHS[today.month - 1]] = round((current_price / previous_month_close - 1.0) * 100.0, 2)
    return result


def _price_context(closes: pd.Series, current_price: float | None) -> dict[str, Any] | None:
    if closes.empty or len(closes) < 30 or not current_price:
        return None
    low = float(closes.min())
    high = float(closes.max())
    avg = float(closes.mean())
    span = high - low
    current_pct = round((current_price - low) / span * 100.0, 1) if span > 0 else 50.0
    vs_avg = round((current_price - avg) / avg * 100.0, 1) if avg else None
    years = round((closes.index[-1] - closes.index[0]).days / 365.0, 1)
    return {
        "years": years,
        "samples": len(closes),
        "avgPrice": round(avg, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "currentPct": current_pct,
        "vsAvgPct": vs_avg,
    }


def _build_timeline(
    today: date,
    last_ex: date | None,
    next_ex: date | None,
    current_buy_start: date | None,
    current_buy_end: date | None,
    buy_start: date | None,
    buy_end: date | None,
    trim_start: date | None,
    trim_end: date | None,
) -> dict[str, Any] | None:
    # Frame one full cycle: the last ex-div (left) through the next post-ex reversal dip (right).
    # Trim zone lands just before the next ex-div (pre-dividend run-up); buy zone lands just after
    # it (the reversal dip) — that is where the actionable buy actually is, not the stale left edge.
    if not last_ex or not next_ex or not buy_end:
        return None
    start = last_ex
    end = buy_end
    total = (end - start).days
    if total <= 0:
        return None

    def pct(value: date | None) -> float | None:
        if value is None:
            return None
        return round(max(0.0, min(100.0, (value - start).days / total * 100.0)), 1)

    return {
        "start": _iso(start),
        "end": _iso(end),
        "todayPct": pct(today),
        "nextExPct": pct(next_ex),
        "buyZone": {
            "startPct": pct(buy_start),
            "endPct": pct(buy_end),
            "start": _iso(buy_start),
            "end": _iso(buy_end),
            "label": _window_label(buy_start, buy_end),
        },
        "trimZone": {
            "startPct": pct(trim_start),
            "endPct": pct(trim_end),
            "start": _iso(trim_start),
            "end": _iso(trim_end),
            "label": _window_label(trim_start, trim_end),
        },
    }


def _action(
    pattern_good: bool,
    today: date,
    current_buy_start: date | None,
    current_buy_end: date | None,
    trim_start: date | None,
    trim_end: date | None,
    current_price: float | None,
    deep: dict[str, Any],
    price_context: dict[str, Any] | None,
) -> str:
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    price_is_low_enough = current_price is not None and entry is not None and current_price <= entry * 1.005
    has_upside = current_price is not None and target is not None and target > current_price * 1.02
    in_buy_window = bool(current_buy_start and current_buy_end and current_buy_start <= today <= current_buy_end)
    in_trim_window = bool(trim_start and trim_end and trim_start <= today <= trim_end)
    # A 3-month "entry" can flag BUY even when price sits near a 5-year high; block that so we
    # only buy the reversal/cheap side of the multi-year range, not a local pullback at the top.
    overextended = bool(price_context and (price_context.get("currentPct") or 0) >= 85)
    if price_is_low_enough and has_upside and not overextended:
        return "BUY"
    if pattern_good and in_buy_window and (entry is None or price_is_low_enough) and (target is None or has_upside) and not overextended:
        return "BUY"
    if (in_trim_window or overextended) and not price_is_low_enough:
        return "TRIM"
    return "WAIT"


def _fallback_narrative(symbol: str, action: str, pattern_good: bool, current_price: float | None, deep: dict[str, Any], avg_dip: float | None, hit_rate: float | None, buy_start: date | None, buy_end: date | None) -> tuple[str, str]:
    dip = f"{abs(avg_dip):.1f}%" if avg_dip is not None else "no measured"
    hit = f"{hit_rate:.0f}%" if hit_rate is not None else "not enough"
    window = _window_label(buy_start, buy_end) or "the next confirmed ex-dividend window"
    entry = as_float(deep.get("entry"))
    target = as_float(deep.get("target"))
    price_note = _price_note(current_price, entry, target)
    if action == "BUY":
        return f"Buy the weakness, not the green candle.", f"{symbol} is at or below the entry zone with upside still left. {price_note}"
    if action == "TRIM":
        return f"Do not add while price is strong.", f"Wait for weakness instead. The next cleaner buy window is {window}, after the expected ex-dividend reset."
    if not pattern_good:
        return f"Wait for the price to come down.", f"The dividend dip pattern is not consistent enough yet ({hit} hit rate). Buy only if price reaches the entry zone with upside left."
    return f"Wait for the next dip, not the green move.", f"The next buy window is {window}. The usual post-ex dip is about {dip} and happened {hit} of the time."


def _price_note(current_price: float | None, entry: float | None, target: float | None) -> str:
    if current_price is None or entry is None:
        return "Use the entry band before adding."
    entry_gap = (entry - current_price) / current_price * 100.0 if current_price else 0.0
    if target is None:
        return f"Entry is {entry_gap:+.1f}% from the current price."
    upside = (target - current_price) / current_price * 100.0 if current_price else 0.0
    return f"Entry is {entry_gap:+.1f}% from now and target upside is {upside:+.1f}%."


def _close_series(history: pd.DataFrame) -> pd.Series:
    if history.empty or "Close" not in history.columns:
        return pd.Series(dtype="float64")
    closes = history["Close"].dropna().copy()
    # Yahoo/cache payloads can occasionally mix timezone-aware datetime objects from different
    # exchange offsets. Pandas refuses to combine those unless they are normalized through UTC.
    normalized_index = pd.to_datetime(closes.index, utc=True, errors="coerce")
    valid = ~normalized_index.isna()
    closes = closes[valid]
    closes.index = normalized_index[valid]
    return closes.sort_index()


def _dividend_series(history: pd.DataFrame) -> pd.Series:
    if history.empty or "Dividends" not in history.columns:
        return pd.Series(dtype="float64")
    dividends = history["Dividends"].fillna(0.0).astype(float).copy()
    normalized_index = pd.to_datetime(dividends.index, utc=True, errors="coerce")
    valid = ~normalized_index.isna()
    dividends = dividends[valid]
    dividends.index = normalized_index[valid]
    return dividends.sort_index()


def _latest_close(closes: pd.Series) -> float | None:
    return float(closes.iloc[-1]) if not closes.empty else None


def _event_intervals(events: list[dict[str, Any]]) -> list[int]:
    return [(events[index]["date"] - events[index - 1]["date"]).days for index in range(1, len(events)) if 20 <= (events[index]["date"] - events[index - 1]["date"]).days <= 370]


def _infer_next_ex_date(events: list[dict[str, Any]], cycle_days: int | None) -> date | None:
    if not events or cycle_days is None:
        return None
    next_date = events[-1]["date"] + timedelta(days=cycle_days)
    today = date.today()
    while next_date <= today:
        next_date += timedelta(days=cycle_days)
    return next_date


def _cycle_position(events: list[dict[str, Any]], cycle_days: int | None, today: date) -> float | None:
    if not events or not cycle_days:
        return None
    last = events[-1]["date"]
    while last + timedelta(days=cycle_days) <= today:
        last += timedelta(days=cycle_days)
    return round(max(0.0, min(100.0, ((today - last).days / cycle_days) * 100.0)), 1)


def _average(values: list[float | int | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return sum(clean) / len(clean) if clean else None


def _hit_rate(events: list[dict[str, Any]]) -> float | None:
    return sum(1 for event in events if event["dipPct"] < 0) / len(events) * 100.0 if events else None


def _average_random_dip(closes: pd.Series) -> float | None:
    if len(closes) < 60:
        return None
    dips: list[float] = []
    for index in range(0, len(closes) - 10, 21):
        price = float(closes.iloc[index])
        low = float(closes.iloc[index + 1 : index + 11].min())
        if price:
            dips.append((low - price) / price * 100.0)
    return _average(dips)


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.to_datetime(value).date()


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _days_until(value: date | None, today: date) -> int | None:
    return (value - today).days if value else None


def _window_label(start: date | None, end: date | None) -> str | None:
    if not start or not end:
        return None
    if start.month == end.month:
        return f"{start.strftime('%b')} {start.day} - {end.day}"
    return f"{start.strftime('%b')} {start.day} - {end.strftime('%b')} {end.day}"
