from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from internal.store.utils import as_float, json_safe


PROMPT_VERSIONS: dict[str, str] = {
    "stock-analysis": "stock-analysis/production-v1",
    "analyst-report": "analyst-report/production-v1",
    "quant": "quant/production-v1",
    "valuation": "valuation/production-v1",
    "today": "today/production-v1",
    "technical": "technical/production-v1",
    "buy-timing": "buy-timing/production-v1",
    "next-10": "next-10/production-v1",
    "strategy": "strategy/production-v1",
    "portfolio": "portfolio/production-v1",
}

_TACTICAL_WORDS = ("volume", "breakout", "pullback", "support", "resistance", "stop", "trim", "exit", "momentum", "trend")
_RISK_WORDS = ("volatility", "drawdown", "risk", "exposure", "hit rate", "edge", "probability", "position size")
_FORBIDDEN_PROMISES = ("always win", "guaranteed return", "cannot lose", "never lose", "risk-free profit")
_EVIDENCE_GROUPS = {
    "fundamentals": ("earnings", "cash flow", "margin", "roe", "business"),
    "valuation": ("valuation", "price/book", "p/b", "p/e", "fair value"),
    "tape": ("volume", "momentum", "trend", "support", "resistance", "breakout"),
    "risk": ("risk", "drawdown", "volatility", "stop", "downside"),
    "sector": ("sector", "industry", "peer", "cycle"),
    "allocation": ("exposure", "position", "size", "dca", "allocation"),
}


def attach_run_context(
    payload: dict[str, Any],
    *,
    feature: str,
    context: dict[str, Any] | None,
    data_trust: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attach private run inputs. save_ai_result strips these before returning/persisting the card."""
    safe_context = json_safe(context or {})
    state = build_decision_state(safe_context, data_trust=data_trust)
    return {
        **payload,
        "decisionState": state,
        "promptVersion": PROMPT_VERSIONS.get(feature, f"{feature}/production-v1"),
        "_runContext": safe_context,
        "_sourceTimestamps": _source_timestamps(data_trust or payload.get("dataTrust")),
    }


def build_decision_state(context: dict[str, Any], *, data_trust: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = context.get("canonicalDecisionState") if isinstance(context.get("canonicalDecisionState"), dict) else None
    if existing and existing.get("id"):
        return existing
    if isinstance(context.get("buyTiming"), dict):
        timing_context = context["buyTiming"]
        existing = timing_context.get("canonicalDecisionState") if isinstance(timing_context.get("canonicalDecisionState"), dict) else None
        if existing and existing.get("id"):
            return existing
        context = {
            **timing_context,
            "stock": {
                "symbol": timing_context.get("symbol"),
                "price": timing_context.get("price"),
                "currency": timing_context.get("currency"),
            },
            "technicals": timing_context.get("technicalContext") or {},
            "businessStructure": timing_context.get("businessStructure") or {},
            "companyStructureProfile": timing_context.get("companyStructureProfile") or {},
        }
    stock = context.get("stock") if isinstance(context.get("stock"), dict) else {}
    technicals = context.get("technicals") if isinstance(context.get("technicals"), dict) else {}
    today = context.get("today") if isinstance(context.get("today"), dict) else {}
    if isinstance(today.get("technicals"), dict):
        technicals = {**technicals, **today["technicals"]}
    business = context.get("business") if isinstance(context.get("business"), dict) else {}
    if not business and isinstance(context.get("structure"), dict):
        business = context["structure"]
    profile = context.get("companyStructureProfile") if isinstance(context.get("companyStructureProfile"), dict) else {}
    business_structure = context.get("businessStructure") if isinstance(context.get("businessStructure"), dict) else {}
    price = as_float(stock.get("price"))
    resistance = as_float(technicals.get("resistance"))
    support = as_float(technicals.get("support"))
    volume_ratio = as_float(technicals.get("volumeRatio"))

    timing = "WAIT"
    if price and resistance:
        gap = (price - resistance) / resistance * 100
        if gap < -0.75:
            timing = "BUILDING"
        elif gap <= 2 and (volume_ratio or 0) >= 1:
            timing = "BREAKOUT"
        elif gap > 2 or ((volume_ratio or 0) < 0.7 and gap >= -0.75):
            timing = "CHASE"
    elif price and support and price <= support * 1.04:
        timing = "BUILDING"

    roe = as_float(business.get("roe"))
    margin = as_float(business.get("profitMargin"))
    growth = as_float(business.get("revenueGrowth"))
    archetype = str(profile.get("archetype") or "OPERATING_COMPANY")
    # This is deliberately a permissive participation prior, not a buy recommendation. Sector-
    # native evidence and the selected Agent still decide size and timing.
    observed_fundamentals = sum(value is not None for value in (roe, margin, growth))
    structurally_sound = observed_fundamentals > 0 and (margin is None or margin > 0) and (growth is None or growth > -20)
    if archetype == "BANK":
        structurally_sound = (roe is None or roe >= 6) and structurally_sound
    elif roe is not None:
        structurally_sound = structurally_sound and roe >= 6
    if business_structure.get("ownershipEligible") is False or business_structure.get("status") == "AT_RISK":
        structurally_sound = False
    elif business_structure.get("ownershipEligible") is True:
        structurally_sound = True
    ownership = "PARTICIPATE" if structurally_sound else "WATCH"

    required = [str(item) for item in profile.get("primaryMetrics") or []]
    evidence_context = _without_contract_metadata(context)
    serialized = _normalized_text(json.dumps(evidence_context, ensure_ascii=False))
    available = [item for item in required if any(token in serialized for token in _metric_tokens(item))]
    missing = [item for item in required if item not in available]
    evidence_as_of = _latest_timestamp(data_trust)
    identity = {
        "symbol": str(stock.get("symbol") or ""),
        "evidenceAsOf": evidence_as_of,
        "price": price,
        "support": support,
        "resistance": resistance,
        "timing": timing,
        "ownership": ownership,
        "archetype": archetype,
    }
    state_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:20]
    return {
        "id": state_id,
        "symbol": identity["symbol"],
        "evidenceAsOf": evidence_as_of,
        "ownership": ownership,
        "timing": timing,
        "price": price,
        "support": support,
        "resistance": resistance,
        "volumeRatio": volume_ratio,
        "sectorEvidence": {
            "archetype": archetype,
            "required": required,
            "available": available,
            "missing": missing,
            "missingMeansUnknown": True,
        },
    }


def enforce_production_gate(feature: str, agent_id: str, payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Reject persona collapse and attach a guarded decision without inventing a trade."""
    checked = dict(payload)
    state = checked.get("decisionState") if isinstance(checked.get("decisionState"), dict) else {}
    checks: list[dict[str, Any]] = []
    public_output = {key: value for key, value in checked.items() if not key.startswith("_run") and key not in {"decisionState", "dataTrust"}}
    text = json.dumps(public_output, ensure_ascii=False).lower()

    if agent_id == "alphawolf" and any(phrase in text for phrase in _FORBIDDEN_PROMISES):
        raise ValueError("AlphaWolf Prime made a prohibited certainty/always-win promise")
    if agent_id == "alphawolf":
        groups = sorted(name for name, words in _EVIDENCE_GROUPS.items() if any(word in text for word in words))
        if len(groups) < 3:
            raise ValueError("AlphaWolf Prime did not blend at least three independent evidence groups")
        checks.append({"name": "hybrid_evidence_blend", "passed": True, "evidenceGroups": groups})
    checks.append({"name": "no_performance_promise", "passed": True})

    if agent_id in {"kai", "rex"}:
        used = sorted({word for word in _TACTICAL_WORDS if word in text})
        if len(used) < 2:
            raise ValueError("tactical Agent output lacks entry/exit or tape evidence")
        checks.append({"name": "tactical_evidence", "passed": True, "evidence": used})
    if agent_id == "nadia":
        used = sorted({word for word in _RISK_WORDS if word in text})
        if len(used) < 2:
            raise ValueError("Nadia output lacks risk-adjusted exposure evidence")
        checks.append({"name": "risk_adjusted_evidence", "passed": True, "evidence": used})

    plan = checked.get("agentMonthlyPlan")
    if isinstance(plan, list) and len(plan) == 12:
        actions = {str(item.get("action") or "") for item in plan if isinstance(item, dict)}
        sizes = {int(item.get("buyBudgetPct") or 0) for item in plan if isinstance(item, dict)}
        if agent_id in {"kai", "rex"} and not (actions & {"BUY", "ADD_SMALL"} and actions & {"TRIM", "SELL"}):
            raise ValueError("tactical monthly plan must contain both an entry and an exit/trim")
        if agent_id == "nadia" and sizes.issubset({0, 100}):
            raise ValueError("Nadia monthly plan is all-or-nothing instead of risk-scaled")
        if agent_id in {"ben", "vera"} and state.get("ownership") == "PARTICIPATE":
            funded = sum(1 for item in plan if isinstance(item, dict) and int(item.get("buyBudgetPct") or 0) > 0)
            if funded < 7:
                raise ValueError("long-term owner plan creates excessive cash drag in a sound company")
        checks.append({"name": "persona_plan_behavior", "passed": True})

    verdict = str(checked.get("verdict") or "").upper()
    timing = str(state.get("timing") or "")
    if timing == "BUILDING" and verdict == "CHASING":
        checked["verdict"] = "BUILDING"
        right_now = checked.get("rightNow") if isinstance(checked.get("rightNow"), dict) else {}
        checked["rightNow"] = {**right_now, "action": "WAIT"}
        checks.append({"name": "shared_state_consistency", "passed": True, "repaired": "CHASING->BUILDING"})
    else:
        checks.append({"name": "shared_state_consistency", "passed": True})
    signal = str(checked.get("signal") or "").upper()
    if timing == "BUILDING" and "CHASE" in signal:
        checked["signal"] = "WAIT" if feature == "technical" else "BUILDING · WAIT"
        checks[-1] = {"name": "shared_state_consistency", "passed": True, "repaired": "CHASE signal->BUILDING"}
    elif timing == "CHASE" and "BUILD" in signal:
        checked["signal"] = "WAIT" if feature == "technical" else "CHASE · PAUSE"
        checks[-1] = {"name": "shared_state_consistency", "passed": True, "repaired": "BUILDING signal->CHASE"}

    sector_evidence = state.get("sectorEvidence") if isinstance(state.get("sectorEvidence"), dict) else {}
    checks.append({
        "name": "sector_native_evidence",
        "passed": bool(sector_evidence.get("archetype")),
        "archetype": sector_evidence.get("archetype"),
        "available": sector_evidence.get("available") or [],
        "missing": sector_evidence.get("missing") or [],
    })

    checked["guardedDecision"] = {
        "stateId": state.get("id"),
        "ownership": state.get("ownership"),
        "timing": state.get("timing"),
        "feature": feature,
        "agentId": agent_id,
        "guardedAt": datetime.now(timezone.utc).isoformat(),
    }
    checked["qualityChecks"] = checks
    return checked, checks


def strip_private_run_fields(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if not key.startswith("_run") and key != "_sourceTimestamps"}


def _metric_tokens(metric: str) -> tuple[str, ...]:
    words = [_normalized_text(word) for word in metric.split()]
    ignored = {"versus", "through", "quality", "growth", "normalized", "direct", "position"}
    return tuple(word for word in words if len(word) >= 4 and word not in ignored)


def _without_contract_metadata(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_contract_metadata(item)
            for key, item in value.items()
            if key not in {"companyStructureProfile", "canonicalDecisionState", "strategyMandate"}
        }
    if isinstance(value, list):
        return [_without_contract_metadata(item) for item in value]
    return value


def _normalized_text(value: str) -> str:
    return "".join(character for character in value.lower() if character.isalnum())


def _source_timestamps(data_trust: Any) -> dict[str, Any]:
    if not isinstance(data_trust, dict):
        return {}
    return {
        key: data_trust.get(key)
        for key in ("provider", "marketTimestamp", "fetchedAt", "status", "stale")
        if data_trust.get(key) is not None
    }


def _latest_timestamp(data_trust: Any) -> str | None:
    if not isinstance(data_trust, dict):
        return None
    return str(data_trust.get("marketTimestamp") or data_trust.get("fetchedAt") or "") or None
