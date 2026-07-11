from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any
from uuid import uuid4

import pandas as pd

from internal.ai.agents import agent_badge, normalize_agent_id
from internal.ai.openai_client import OpenAIAnalysisError, decide_backtrade_with_openai
from internal.store.cache import cache_compute_lock
from internal.store.yahoo_cache import load_yahoo_data, save_yahoo_data
from internal.yahoo.client import fetch_history, ticker as make_ticker


_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = Lock()
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="backtrade")
# Statements only change a handful of times a year; a replay re-run for the same symbol minutes
# or hours later (a different agent, years, or contribution amount) should never re-hit Yahoo.
_FINANCIAL_TIMELINE_TTL_SECONDS = 86_400


def create_backtrade_job(account_scope: str, payload: dict[str, Any]) -> dict[str, Any]:
    symbol = str(payload.get("symbol") or "").strip().upper()
    if not symbol:
        raise ValueError("A symbol is required")
    agent_id = normalize_agent_id(str(payload.get("agent") or "vera"))
    years = max(1, min(5, int(payload.get("years") or 5)))
    contribution = max(1.0, min(1_000_000.0, float(payload.get("monthlyContribution") or 100.0)))
    # Replay decisions are monthly by design: analyze the prior month-end and execute at the
    # first session of the new month. This bounds a five-year run to roughly 60 AI calls.
    mode = "monthly"
    with _LOCK:
        for job in _JOBS.values():
            if job["accountScope"] == account_scope and job["status"] in {"queued", "running"}:
                raise RuntimeError("A replay is already running for this account")
        job_id = uuid4().hex
        _JOBS[job_id] = {
            "id": job_id,
            "accountScope": account_scope,
            "status": "queued",
            "progress": 0,
            "stage": "Queued",
            "symbol": symbol,
            "agent": agent_badge(agent_id),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "config": {"years": years, "monthlyContribution": contribution, "mode": mode},
            "result": None,
            "error": None,
        }
    _EXECUTOR.submit(_run_job, job_id, symbol, agent_id, years, contribution, mode)
    return _public_job(_JOBS[job_id])


def get_backtrade_job(account_scope: str, job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job or job["accountScope"] != account_scope:
            return None
        return _public_job(job)


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key != "accountScope"}


def _update(job_id: str, **values: Any) -> None:
    with _LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(values)


def _run_job(job_id: str, symbol: str, agent_id: str, years: int, contribution: float, mode: str) -> None:
    try:
        _update(job_id, status="running", stage="Loading historical evidence", progress=2)
        # Fundamentals are fetched once for the whole job, never once per replay month. Statement
        # periods become visible only after a conservative reporting lag in _financial_as_of.
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="backtrade-data") as loader:
            # auto_adjust=False: Close stays split-adjusted but keeps real ex-dividend price drops,
            # and Yahoo hands back the actual per-share cash Dividends paid on each date. The default
            # adjusted Close bakes continuous dividend reinvestment into the price itself, which would
            # double-count dividends once the simulation below also books them as cash.
            history_future = loader.submit(fetch_history, make_ticker(symbol), "10y", False)
            financials_future = loader.submit(_load_financial_timeline, symbol)
            history = history_future.result()
            financial_timeline = financials_future.result()
        if history.empty or "Close" not in history.columns or len(history) < 260:
            raise ValueError("Not enough historical price data for replay")
        frame = history.copy().sort_index()
        for column in ("Open", "Close", "Volume", "Dividends"):
            if column not in frame.columns:
                frame[column] = frame["Close"] if column == "Open" else 0.0
        frame = frame[["Open", "Close", "Volume", "Dividends"]].dropna(subset=["Close"])
        replay_sessions = min(len(frame) - 1, years * 252)
        start_index = max(200, len(frame) - replay_sessions)
        event_indices = _event_indices(frame, start_index, mode)
        _update(job_id, stage="Replaying point-in-time decisions", progress=5)
        result = _simulate(job_id, frame, event_indices, start_index, contribution, agent_id, mode, financial_timeline)
        _update(job_id, status="complete", stage="Complete", progress=100, result=result)
    except Exception as exc:
        _update(job_id, status="failed", stage="Failed", error=str(exc), progress=100)


def _event_indices(frame: pd.DataFrame, start: int, mode: str) -> list[int]:
    if mode == "weekly":
        return list(range(start, len(frame) - 1, 5))
    months = frame.index.to_period("M")
    month_ends = {index for index in range(start, len(frame) - 1) if months[index] != months[index + 1]}
    if mode == "monthly":
        return sorted(month_ends)
    closes = frame["Close"].astype(float)
    sma20 = closes.rolling(20).mean()
    sma50 = closes.rolling(50).mean()
    events = set(month_ends)
    for index in range(start, len(frame) - 1):
        five_day = closes.iloc[index] / closes.iloc[index - 5] - 1.0
        crossed = (sma20.iloc[index] - sma50.iloc[index]) * (sma20.iloc[index - 1] - sma50.iloc[index - 1]) < 0
        if abs(five_day) >= 0.05 or crossed:
            events.add(index)
    ordered = sorted(events)
    if len(ordered) > 160:
        step = len(ordered) / 160
        ordered = [ordered[min(len(ordered) - 1, int(position * step))] for position in range(160)]
    return sorted(set(ordered))


def _simulate(job_id: str, frame: pd.DataFrame, events: list[int], start: int, contribution: float, agent_id: str, mode: str, financial_timeline: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    cash = shares = benchmark_shares = contributed = 0.0
    agent_dividends_received = dca_dividends_reinvested = 0.0
    decisions: list[dict[str, Any]] = []
    equity: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    event_set = set(events)
    last_month: tuple[int, int] | None = None
    ai_failures = ai_calls = 0
    disable_ai = False

    # Seed the first order from the last session before the replay window so the first monthly
    # contribution can be traded at the first open, exactly like every later month.
    initial_snapshot = _snapshot(frame, start - 1, cash, shares, contributed, contribution, agent_id, financial_timeline)
    try:
        initial_decision = decide_backtrade_with_openai(initial_snapshot, agent_id)
        ai_calls += 1
        initial_source = "ai"
    except OpenAIAnalysisError:
        ai_failures += 1
        initial_decision = _fallback_decision(initial_snapshot, agent_id)
        initial_source = "calculated_fallback"
    initial_decision = _normalize_decision(initial_decision, cash + contribution, shares, agent_id, initial_snapshot)
    initial_audit = {**initial_decision, "date": frame.index[start - 1].date().isoformat(), "source": initial_source, "evidenceFocus": _evidence_focus(initial_snapshot), "close": round(float(frame.iloc[start - 1]["Close"]), 4), "cashBefore": round(cash + contribution, 2), "sharesBefore": round(shares, 6), "executedPrice": None, "executedValue": 0.0}
    decisions.append(initial_audit)
    pending = initial_audit

    for index in range(start, len(frame)):
        row = frame.iloc[index]
        opened = float(row["Open"] or row["Close"])
        closed = float(row["Close"])
        stamp = frame.index[index]
        dividend_per_share = float(row.get("Dividends", 0.0) or 0.0)
        if dividend_per_share > 0:
            # Credited against shares held coming into the ex-date, before today's own contribution
            # or trade. The Agent banks it as cash it must actively choose to redeploy; normal DCA
            # is modeled as auto-reinvesting, which is the standard "total return" DCA assumption.
            if shares > 0:
                agent_dividend = shares * dividend_per_share
                cash += agent_dividend
                agent_dividends_received += agent_dividend
            if benchmark_shares > 0:
                dca_dividend = benchmark_shares * dividend_per_share
                benchmark_shares += dca_dividend / opened
                dca_dividends_reinvested += dca_dividend
        month_key = (stamp.year, stamp.month)
        if month_key != last_month:
            cash += contribution
            contributed += contribution
            benchmark_shares += contribution / opened
            last_month = month_key
        if pending:
            action = pending["action"]
            if action == "BUY" and cash > 0:
                spend = cash * pending["buyCashPct"] / 100.0
                shares += spend / opened
                cash -= spend
                pending["executedPrice"] = round(opened, 4)
                pending["executedValue"] = round(spend, 2)
            elif action in {"TRIM", "SELL"} and shares > 0:
                sold = shares * pending["trimPositionPct"] / 100.0
                shares -= sold
                proceeds = sold * opened
                cash += proceeds
                pending["executedPrice"] = round(opened, 4)
                pending["executedValue"] = round(proceeds, 2)
            pending = None
        point = _equity_point(stamp, closed, cash, shares, benchmark_shares, contributed)
        account_value = point["agent"]
        equity.append(point)
        if index not in event_set or index >= len(frame) - 1:
            continue
        snapshot = _snapshot(frame, index, cash, shares, contributed, contribution, agent_id, financial_timeline)
        source = "ai"
        try:
            if disable_ai:
                raise OpenAIAnalysisError("AI disabled after repeated failures")
            decision = decide_backtrade_with_openai(snapshot, agent_id)
            ai_calls += 1
        except OpenAIAnalysisError:
            ai_failures += 1
            if ai_failures >= 3 and ai_calls == 0:
                disable_ai = True
            decision = _fallback_decision(snapshot, agent_id)
            source = "calculated_fallback"
        # The next contribution lands before this pending order executes, so validation and sizing
        # must use the same next-open cash shown to the model. Using today's cash here incorrectly
        # erased BUY decisions whenever the current month's cash had already been deployed.
        decision = _normalize_decision(decision, cash + contribution, shares, agent_id, snapshot)
        audit = {**decision, "date": stamp.date().isoformat(), "source": source, "evidenceFocus": _evidence_focus(snapshot), "close": round(closed, 4), "cashBefore": round(cash + contribution, 2), "sharesBefore": round(shares, 6), "executedPrice": None, "executedValue": 0.0}
        decisions.append(audit)
        pending = audit
        total_decisions = len(events) + 1
        _update(job_id, progress=min(96, 5 + round(len(decisions) / max(1, total_decisions) * 91)), stage=f"Replaying decision {len(decisions)} of {total_decisions}")

    final_agent = equity[-1]["agent"]
    final_dca = equity[-1]["dca"]
    return {
        "symbol": _JOBS[job_id]["symbol"],
        "agent": agent_badge(agent_id),
        "mode": mode,
        "sessions": len(equity),
        "decisionCount": len(decisions),
        "aiDecisionCount": sum(1 for item in decisions if item["source"] == "ai"),
        "fallbackDecisionCount": sum(1 for item in decisions if item["source"] != "ai"),
        "totalContributed": round(contributed, 2),
        "endingValue": final_agent,
        "dcaEndingValue": final_dca,
        "returnPct": round((final_agent / contributed - 1.0) * 100.0, 2) if contributed else 0.0,
        "dcaReturnPct": round((final_dca / contributed - 1.0) * 100.0, 2) if contributed else 0.0,
        "maxDrawdownPct": _max_drawdown(equity, "agent"),
        "dcaMaxDrawdownPct": _max_drawdown(equity, "dca"),
        "endingCash": round(cash, 2),
        "endingShares": round(shares, 6),
        "agentDividendsReceived": round(agent_dividends_received, 2),
        "dcaDividendsReinvested": round(dca_dividends_reinvested, 2),
        "equity": equity,
        "decisions": decisions,
        "limitations": ["Financial statements appear only after a conservative 60-day reporting lag", "Historical statement coverage varies by symbol", "Orders execute at the next session open", "Prices are split-adjusted but not dividend-adjusted; the Agent banks real per-share cash dividends while normal DCA auto-reinvests them", "Historical results do not predict future returns"],
    }


def _snapshot(frame: pd.DataFrame, index: int, cash: float, shares: float, contributed: float, next_contribution: float = 0.0, agent_id: str = "vera", financial_timeline: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    closes = frame["Close"].astype(float).iloc[: index + 1]
    volumes = frame["Volume"].astype(float).iloc[: index + 1]
    price = float(closes.iloc[-1])
    sma20 = float(closes.tail(20).mean())
    sma50 = float(closes.tail(50).mean())
    sma200 = float(closes.tail(200).mean())
    high52 = float(closes.tail(252).max())
    low52 = float(closes.tail(252).min())
    volume20 = float(volumes.tail(20).mean()) if float(volumes.tail(20).mean()) > 0 else 1.0
    structure = _financial_as_of(financial_timeline or [], frame.index[index])
    dividend_context = _dividend_context(frame, index, price)
    technical = {
        "kind": "technical",
        "price": round(price, 4),
        "sma20": round(sma20, 4),
        "sma50": round(sma50, 4),
        "sma200": round(sma200, 4),
        "aboveSma20": price >= sma20,
        "aboveSma50": price >= sma50,
        "fiveDayReturnPct": round((price / float(closes.iloc[-6]) - 1) * 100, 2),
        "volumeVs20d": round(float(volumes.iloc[-1]) / volume20, 2),
        "trendRegime": "UP" if sma20 > sma50 > sma200 else "DOWN" if sma20 < sma50 < sma200 else "MIXED",
    }
    price_context = {
        "kind": "price_context_only",
        "price": round(price, 4),
        "drawdownFrom52wHighPct": round((price / high52 - 1) * 100, 2),
        "range52wPct": round((price - low52) / max(0.000001, high52 - low52) * 100, 1),
        "oneYearReturnPct": round((price / float(closes.iloc[-min(252, len(closes))]) - 1) * 100, 2),
        **dividend_context,
    }
    decision_order = {
        "ben": ["ANALYST", "BUY_TIMING", "SIGNAL"],
        "sam": ["ANALYST", "BUY_TIMING", "SIGNAL"],
        "vera": ["ANALYST", "BUY_TIMING", "SIGNAL"],
        "rex": ["SIGNAL", "BUY_TIMING", "ANALYST"],
        "kai": ["SIGNAL", "BUY_TIMING", "ANALYST"],
        "nadia": ["SIGNAL", "ANALYST", "BUY_TIMING"],
        "alphawolf": ["ANALYST", "SIGNAL", "BUY_TIMING"],
    }.get(agent_id, ["ANALYST", "BUY_TIMING", "SIGNAL"])
    deployment_policy = {
        "ben": {"style": "recurring_owner", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "AT_RISK structure, clearly excessive price, or evidence too weak to own even a starter"},
        "sam": {"style": "recurring_income", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "income/funding danger, yield-trap evidence, or evidence too weak to support income ownership"},
        "vera": {"style": "valuation_installments", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "failed financial hurdle, inadequate margin of safety, or genuinely unavailable valuation evidence"},
        "alphawolf": {"style": "balanced_installments", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "a named full-corner bottleneck that blocks new capital"},
        "nadia": {"style": "rule_based", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "the measured signal/risk rule fails"},
        "rex": {"style": "tactical", "normalInstallmentPct": 0, "strongInstallmentPct": 25, "holdRequires": "no immediate trade edge"},
        "kai": {"style": "tactical", "normalInstallmentPct": 0, "strongInstallmentPct": 25, "holdRequires": "no live acceleration or volume-backed setup"},
    }.get(agent_id, {"style": "selective", "normalInstallmentPct": 25, "strongInstallmentPct": 50, "holdRequires": "a concrete Agent-specific blocker"})
    return {
        "date": frame.index[index].date().isoformat(),
        "agentId": agent_id,
        "agentDecisionOrder": decision_order,
        "deploymentPolicy": deployment_policy,
        "portfolio": {"cash": round(cash, 2), "shares": round(shares, 6), "marketValue": round(shares * price, 2), "contributed": round(contributed, 2), "nextMonthlyContribution": round(next_contribution, 2), "cashAvailableAtNextOpen": round(cash + next_contribution, 2), "idleCashInMonthlyContributions": round((cash + next_contribution) / next_contribution, 1) if next_contribution > 0 else 0.0},
        # These are the same three desks used by Hunt AI, reconstructed only from evidence that
        # existed at this replay date. One Agent call resolves them; there are not three extra AI
        # requests per month.
        "signalEvidence": technical,
        "buyTimingEvidence": price_context,
        "analystEvidence": structure,
    }


def _dividend_context(frame: pd.DataFrame, index: int, price: float) -> dict[str, Any]:
    if "Dividends" not in frame.columns:
        return {"trailingDividendPerShare": 0.0, "trailingDividendYieldPct": 0.0, "sessionsSinceLastExDividend": None}
    dividends = frame["Dividends"].astype(float).iloc[: index + 1]
    trailing = dividends.tail(252)
    trailing_sum = float(trailing[trailing > 0].sum())
    paid = dividends[dividends > 0]
    sessions_since = int(len(dividends) - 1 - dividends.index.get_loc(paid.index[-1])) if not paid.empty else None
    return {
        "trailingDividendPerShare": round(trailing_sum, 4),
        "trailingDividendYieldPct": round(trailing_sum / price * 100, 2) if price > 0 else 0.0,
        "sessionsSinceLastExDividend": sessions_since,
    }


def _fallback_decision(snapshot: dict[str, Any], agent_id: str = "vera") -> dict[str, Any]:
    price = snapshot["buyTimingEvidence"]
    signal = snapshot["signalEvidence"]
    structure = snapshot["analystEvidence"]
    if agent_id in {"ben", "sam", "vera"} and structure.get("thesisStatus") == "INTACT":
        return {"action": "BUY", "buyCashPct": 25, "trimPositionPct": 0, "conviction": 65, "signalRead": "Signal is a secondary execution check", "timingRead": "Use a partial monthly installment", "analystRead": "Reported cash generation remains intact", "decisionBasis": "ANALYST", "reason": "Reported cash generation remains intact; continue a measured monthly allocation", "invalidation": "Cash generation or balance-sheet resilience deteriorates"}
    if price["drawdownFrom52wHighPct"] <= -15:
        return {"action": "BUY", "buyCashPct": 50, "trimPositionPct": 0, "conviction": 70, "signalRead": "Signal is not the controlling input", "timingRead": "Price is in a deep historical drawdown", "analystRead": "No structural claim is added by fallback", "decisionBasis": "BUY_TIMING", "reason": "Deep drawdown timing rule supports a partial purchase", "invalidation": "The controlling Agent risk rule fails"}
    if signal["aboveSma50"] and signal["fiveDayReturnPct"] > 3:
        return {"action": "BUY", "buyCashPct": 25, "trimPositionPct": 0, "conviction": 65, "signalRead": "Positive trend and short-window strength", "timingRead": "Use a small installment", "analystRead": "No structural claim is added by fallback", "decisionBasis": "SIGNAL", "reason": "Positive signal supports a small next-open purchase", "invalidation": "Price closes below SMA50"}
    return {"action": "HOLD", "buyCashPct": 0, "trimPositionPct": 0, "conviction": 30, "signalRead": "No signal trigger", "timingRead": "No timing edge", "analystRead": "No decisive structural trigger", "decisionBasis": "BLENDED", "reason": "No desk produced a valid fallback trigger", "invalidation": "A point-in-time desk trigger appears"}


def _normalize_decision(decision: dict[str, Any], cash: float, shares: float, agent_id: str = "vera", snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    action = str(decision.get("action") or "HOLD")
    buy_pct = max(0, min(100, int(decision.get("buyCashPct") or 0)))
    trim_pct = max(0, min(100, int(decision.get("trimPositionPct") or 0)))
    if action == "BUY" and cash <= 0:
        action, buy_pct = "HOLD", 0
    elif action == "BUY":
        buy_pct = buy_pct or 25
        trim_pct = 0
    elif action in {"TRIM", "SELL"} and shares <= 0:
        action, trim_pct = "HOLD", 0
    elif action in {"TRIM", "SELL"}:
        buy_pct = 0
        trim_pct = trim_pct or (100 if action == "SELL" else 25)
    else:
        action, buy_pct, trim_pct = "HOLD", 0, 0
    return {"action": action, "buyCashPct": buy_pct, "trimPositionPct": trim_pct, "conviction": int(decision.get("conviction") or 30), "signalRead": str(decision.get("signalRead") or "Signal desk did not control the decision"), "timingRead": str(decision.get("timingRead") or "Buy Timing did not control the decision"), "analystRead": str(decision.get("analystRead") or "Analyst evidence was unavailable or non-controlling"), "decisionBasis": str(decision.get("decisionBasis") or "BLENDED"), "reason": str(decision.get("reason") or "No reason supplied"), "invalidation": str(decision.get("invalidation") or "No invalidation supplied")}


def _load_financial_timeline(symbol: str) -> list[dict[str, Any]]:
    """Load a compact statement history once; failures leave an honest unavailable packet."""
    cached = load_yahoo_data(symbol, "financial_timeline")
    if cached and cached.is_fresh and isinstance(cached.payload, list):
        return cached.payload

    with cache_compute_lock("yahoo_financial_timeline", symbol.upper().strip()):
        current = load_yahoo_data(symbol, "financial_timeline")
        if current and current.is_fresh and isinstance(current.payload, list):
            return current.payload
        timeline = _fetch_financial_timeline(symbol)
        if timeline:
            save_yahoo_data(symbol, "financial_timeline", timeline, ttl_seconds=_FINANCIAL_TIMELINE_TTL_SECONDS)
            return timeline
        return current.payload if current and isinstance(current.payload, list) else []


def _fetch_financial_timeline(symbol: str) -> list[dict[str, Any]]:
    stock = make_ticker(symbol)
    try:
        # Quarterly data keeps recent decisions fresh; annual columns extend coverage through the
        # older replay. Duplicate period ends prefer the quarterly packet. The 6 statement calls
        # are independent Yahoo requests, so they run in parallel instead of one-after-another.
        with ThreadPoolExecutor(max_workers=6, thread_name_prefix="backtrade-statements") as pool:
            income_q = pool.submit(_safe_statement, stock, "get_income_stmt", "quarterly")
            income_y = pool.submit(_safe_statement, stock, "get_income_stmt", "yearly")
            cashflow_q = pool.submit(_safe_statement, stock, "get_cash_flow", "quarterly")
            cashflow_y = pool.submit(_safe_statement, stock, "get_cash_flow", "yearly")
            balance_q = pool.submit(_safe_statement, stock, "get_balance_sheet", "quarterly")
            balance_y = pool.submit(_safe_statement, stock, "get_balance_sheet", "yearly")
            income = _combine_statements(income_q.result(), income_y.result())
            cashflow = _combine_statements(cashflow_q.result(), cashflow_y.result())
            balance = _combine_statements(balance_q.result(), balance_y.result())
    except Exception:
        return []
    periods: set[pd.Timestamp] = set()
    for statement in (income, cashflow, balance):
        if statement is not None and not statement.empty:
            periods.update(pd.Timestamp(column).tz_localize(None) for column in statement.columns)
    timeline: list[dict[str, Any]] = []
    for period in sorted(periods):
        revenue = _statement_value(income, period, "Total Revenue", "Operating Revenue")
        net_income = _statement_value(income, period, "Net Income", "Net Income Common Stockholders")
        operating_cash = _statement_value(cashflow, period, "Operating Cash Flow", "Total Cash From Operating Activities")
        free_cash = _statement_value(cashflow, period, "Free Cash Flow")
        capex = _statement_value(cashflow, period, "Capital Expenditure", "Capital Expenditures")
        if free_cash is None and operating_cash is not None and capex is not None:
            free_cash = operating_cash + capex
        debt = _statement_value(balance, period, "Total Debt")
        cash = _statement_value(balance, period, "Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents")
        equity = _statement_value(balance, period, "Stockholders Equity", "Total Stockholder Equity")
        if not any(value is not None for value in (revenue, net_income, operating_cash, free_cash, debt, cash, equity)):
            continue
        timeline.append({
            "periodEnd": period.date().isoformat(),
            "availableFrom": (period + timedelta(days=60)).date().isoformat(),
            "revenue": _rounded_money(revenue), "netIncome": _rounded_money(net_income),
            "operatingCashFlow": _rounded_money(operating_cash), "freeCashFlow": _rounded_money(free_cash),
            "totalDebt": _rounded_money(debt), "cash": _rounded_money(cash), "equity": _rounded_money(equity),
        })
    return timeline


def _safe_statement(stock: Any, method_name: str, frequency: str) -> pd.DataFrame:
    try:
        statement = getattr(stock, method_name)(pretty=True, freq=frequency)
        return statement if statement is not None else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


def _combine_statements(recent: pd.DataFrame | None, older: pd.DataFrame | None) -> pd.DataFrame:
    frames = [frame for frame in (recent, older) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, axis=1)
    return combined.loc[:, ~combined.columns.duplicated()]


def _statement_value(statement: pd.DataFrame | None, period: pd.Timestamp, *aliases: str) -> float | None:
    if statement is None or statement.empty:
        return None
    columns = {pd.Timestamp(column).tz_localize(None): column for column in statement.columns}
    column = columns.get(period)
    if column is None:
        return None
    rows = {"".join(character for character in str(row).lower() if character.isalnum()): row for row in statement.index}
    for alias in aliases:
        row = rows.get("".join(character for character in alias.lower() if character.isalnum()))
        if row is not None:
            value = statement.at[row, column]
            if pd.notna(value):
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return None
    return None


def _rounded_money(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def _financial_as_of(timeline: list[dict[str, Any]], replay_date: pd.Timestamp) -> dict[str, Any]:
    available = [item for item in timeline if pd.Timestamp(item["availableFrom"]) <= pd.Timestamp(replay_date).tz_localize(None)]
    if not available:
        return {"kind": "reported_structure", "coverage": "UNAVAILABLE", "thesisStatus": "UNPROVEN", "reportingLagDays": 60, "note": "No historical statement was available by this replay date"}
    item = available[-1]
    ocf, fcf, net_income = item.get("operatingCashFlow"), item.get("freeCashFlow"), item.get("netIncome")
    debt, cash, equity = item.get("totalDebt"), item.get("cash"), item.get("equity")
    severe = (equity is not None and equity < 0) or (ocf is not None and fcf is not None and ocf < 0 and fcf < 0)
    intact = ocf is not None and ocf > 0 and (fcf is None or fcf >= 0) and (equity is None or equity > 0)
    status = "AT_RISK" if severe else "INTACT" if intact else "MIXED"
    return {
        "kind": "reported_structure", "coverage": "AVAILABLE", "thesisStatus": status,
        "statementPeriodEnd": item["periodEnd"], "availableFrom": item["availableFrom"], "reportingLagDays": 60,
        "revenue": item.get("revenue"), "netIncome": net_income, "operatingCashFlow": ocf,
        "freeCashFlow": fcf, "totalDebt": debt, "cash": cash, "netCash": _rounded_money(cash - debt) if cash is not None and debt is not None else None,
        "equity": equity,
        "cashConversion": round(ocf / net_income, 2) if ocf is not None and net_income not in (None, 0) else None,
        "evidenceLimits": ["Moat and management quality are not proven by statements alone", "No data published after the replay date is used"],
    }


def _evidence_focus(snapshot: dict[str, Any]) -> str:
    first = (snapshot.get("agentDecisionOrder") or ["BLENDED"])[0]
    return f"{first} LED"


def _max_drawdown(equity: list[dict[str, Any]], key: str) -> float:
    peak = 0.0
    worst = 0.0
    for point in equity:
        value = float(point[key])
        peak = max(peak, value)
        if peak > 0:
            worst = min(worst, (value / peak - 1.0) * 100.0)
    return round(worst, 2)


def _equity_point(stamp: pd.Timestamp, closed: float, cash: float, shares: float, benchmark_shares: float, contributed: float) -> dict[str, Any]:
    invested = shares * closed
    account = cash + invested
    return {
        "date": stamp.date().isoformat(), "price": round(closed, 4),
        "agent": round(account, 2), "dca": round(benchmark_shares * closed, 2), "contributed": round(contributed, 2),
        "cash": round(cash, 2), "invested": round(invested, 2), "shares": round(shares, 6),
        "stockExposurePct": round(invested / account * 100.0, 2) if account > 0 else 0.0,
    }
