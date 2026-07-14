from datetime import datetime, timezone

import pandas as pd

from internal.market.buy_timing import MONTHS, _backtest_monthly_plan, _close_series, _evaluate_agent_battlefield, _valid_agent_monthly_plan


def test_backtest_reports_flow_adjusted_drawdown_for_dca_and_plan() -> None:
    prices = [100, 120, 72, 90, 110, 105, 125, 115, 130, 128, 140, 135, 150]
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index % 12], "close": price}
        for index, price in enumerate(prices[:12])
    ] + [{"date": "2026-01-28", "month": "Jan", "close": prices[-1]}]
    plan = [
        {"month": month, "action": "BUY" if month in {"Jan", "Jul"} else "HOLD", "buyBudgetPct": 100 if month in {"Jan", "Jul"} else 0}
        for month in MONTHS
    ]

    result = _backtest_monthly_plan(history, plan)

    assert result is not None
    assert result["alwaysBuyMaxDrawdownPct"] > 0
    assert result["strategyMaxDrawdownPct"] >= 0
    assert result["alwaysBuyMaxDrawdownPct"] > result["strategyMaxDrawdownPct"]
    assert 0 < result["averageStockExposurePct"] < 100


def test_close_series_normalizes_mixed_timezone_aware_index() -> None:
    history = pd.DataFrame(
        {"Close": [10.0, 11.0]},
        index=[
            datetime(2026, 1, 2, tzinfo=timezone.utc),
            pd.Timestamp("2026-01-03 07:00:00+07:00").to_pydatetime(),
        ],
    )

    closes = _close_series(history)

    assert list(closes) == [10.0, 11.0]
    assert str(closes.index.tz) == "UTC"


def test_backtest_accumulates_agent_dividends_and_reinvests_dca_dividends() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0, "dividendPerShare": 1.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0, "dividendPerShare": 1.0}]
    plan = [{"month": month, "action": "BUY", "buyBudgetPct": 100} for month in MONTHS]

    result = _backtest_monthly_plan(history, plan)

    assert result is not None
    assert result["agentDividendsReceived"] > 0
    assert result["alwaysBuyDividendsReinvested"] > 0
    assert result["profitLoss"] > 0
    assert result["strategyDividendReturnBoostPct"] > 0
    assert result["alwaysBuyDividendReturnBoostPct"] > 0
    assert result["strategyReturnPct"] > result["strategyReturnWithoutDividendsPct"]


def test_long_term_agent_reinvests_dividends_instead_of_structurally_losing_to_dca() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0, "dividendPerShare": 1.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0, "dividendPerShare": 1.0}]
    plan = [{"month": month, "action": "BUY", "buyBudgetPct": 100} for month in MONTHS]

    sam = _backtest_monthly_plan(history, plan, "sam")

    assert sam is not None
    assert sam["agentDividendsReinvested"] > 0
    assert abs(sam["strategyReturnPct"] - sam["alwaysBuyReturnPct"]) < 0.01


def test_battlefields_judge_personas_on_their_actual_mandates() -> None:
    base = {
        "strategyReturnPct": 8.0,
        "alwaysBuyReturnPct": 10.0,
        "exposureNormalizedReturnPct": 12.0,
        "matchedExposureBenchmarkReturnPct": 4.0,
        "averageStockExposurePct": 40.0,
        "strategyMaxDrawdownPct": 5.0,
        "alwaysBuyMaxDrawdownPct": 12.0,
    }
    structure = {"ownershipEligible": True}
    bull = {"regime": "BULL"}

    owner = _evaluate_agent_battlefield(base, "ben", structure, bull)
    tactical = _evaluate_agent_battlefield(base, "rex", structure, bull)
    quant = _evaluate_agent_battlefield(base, "nadia", structure, bull)

    assert owner["kind"] == "OWNER_COMPOUNDING"
    assert owner["verdict"] == "LOSS"  # 40% exposure is cash drag in an ownable bull structure.
    assert tactical["kind"] == "TACTICAL_SWING"
    assert tactical["verdict"] == "WIN"  # +2 normalized points with lower drawdown.
    assert quant["kind"] == "RISK_EFFICIENCY"
    assert quant["verdict"] == "WIN"  # Better return/drawdown and better than matched exposure.


def test_calibration_ben_wins_a_stable_compounder_with_repeatable_valuation_resets() -> None:
    seasonal_shape = [1.08, 1.03, 0.96, 0.92, 0.98, 1.02, 1.08, 1.12, 1.04, 0.95, 0.90, 0.98]
    history = [
        {
            "date": f"{2021 + index // 12}-{index % 12 + 1:02d}-28",
            "month": MONTHS[index % 12],
            "close": 100 * (1.012 ** index) * (1 + (seasonal_shape[index % 12] - 1) * 1.25),
            "dividendPerShare": 0.2 if index % 12 in {3, 9} else 0.0,
        }
        for index in range(61)
    ]
    value_reset_months = {"Mar", "Apr", "May", "Oct", "Nov", "Dec"}
    plan = [
        {
            "month": month,
            "action": "BUY",
            "buyBudgetPct": 100 if month in value_reset_months else 75,
            "trimPositionPct": 0,
        }
        for month in MONTHS
    ]

    result = _backtest_monthly_plan(history, plan, "ben")
    battlefield = _evaluate_agent_battlefield(
        result, "ben", {"ownershipEligible": True}, {"regime": "BULL"},
    )

    assert result is not None
    assert result["averageStockExposurePct"] >= 80
    assert battlefield["verdict"] == "WIN"
    assert battlefield["primaryMetricLabel"] == "Owner return · 100% exposure"


def test_calibration_rex_wins_a_repeating_swing_with_complete_exits() -> None:
    swing_shape = [80, 85, 105, 120, 100, 80, 85, 105, 120, 80, 85, 120]
    history = [
        {
            "date": f"{2021 + index // 12}-{index % 12 + 1:02d}-28",
            "month": MONTHS[index % 12],
            "close": swing_shape[index % 12] * (1.01 ** (index // 12)),
        }
        for index in range(61)
    ]
    entry_months = {"Jan", "Feb", "Jun", "Jul", "Oct", "Nov"}
    exit_months = {"Apr", "Sep", "Dec"}
    plan = [
        {
            "month": month,
            "action": "BUY" if month in entry_months else "SELL" if month in exit_months else "HOLD",
            "buyBudgetPct": 100 if month in entry_months else 0,
            "trimPositionPct": 100 if month in exit_months else 0,
        }
        for month in MONTHS
    ]

    result = _backtest_monthly_plan(history, plan, "rex")
    battlefield = _evaluate_agent_battlefield(result, "rex")

    assert result is not None
    assert result["strategyReturnPct"] > 0
    assert result["strategyMaxDrawdownPct"] < result["alwaysBuyMaxDrawdownPct"]
    assert battlefield["verdict"] == "WIN"


def test_agent_monthly_plan_does_not_force_hold_months_into_dca_buys() -> None:
    calculated = [{"month": month, "action": "HOLD", "returnPct": 0.0} for month in MONTHS]
    proposed = [{"month": month, "action": "HOLD", "buyBudgetPct": 0, "trimPositionPct": 0, "reason": "My evidence gate failed"} for month in MONTHS]

    for agent_id in ("ben", "sam", "vera", "rex", "kai", "nadia", "alphawolf"):
        plan = _valid_agent_monthly_plan(calculated, proposed, agent_id, {"status": "MIXED"})
        assert plan is not None
        assert all(item["action"] == "HOLD" and item["buyBudgetPct"] == 0 for item in plan)


def test_monthly_plan_does_not_force_actions_for_any_persona() -> None:
    calculated = [{"month": month, "action": "HOLD", "returnPct": 1.0} for month in MONTHS]
    proposed = [{"month": month, "action": "HOLD", "buyBudgetPct": 0, "trimPositionPct": 0, "reason": "My persona gate failed"} for month in MONTHS]

    for agent_id in ("ben", "sam", "vera", "rex", "kai", "nadia", "alphawolf"):
        plan = _valid_agent_monthly_plan(calculated, proposed, agent_id, {"status": "INTACT"})
        assert plan is not None
        assert all(item["action"] == "HOLD" and item["buyBudgetPct"] == 0 for item in plan)


def test_backtest_buy_percentage_applies_only_to_current_month_contribution() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0}]
    plan = [
        {"month": month, "action": "BUY" if month == "Feb" else "HOLD", "buyBudgetPct": 50 if month == "Feb" else 0}
        for month in MONTHS
    ]

    result = _backtest_monthly_plan(history, plan)

    assert result is not None
    february = result["ledger"][1]
    assert february["stockValue"] == 50.0
    assert february["cash"] == 150.0
    assert "that month's 100 budget only" in result["method"]


def test_strategic_owner_redeploys_reserve_after_a_temporary_hold() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0}]
    plan = [
        {
            "month": month,
            "action": "HOLD" if month == "Jan" else "BUY",
            "buyBudgetPct": 0 if month == "Jan" else 100,
            "trimPositionPct": 0,
        }
        for month in MONTHS
    ]

    owner = _backtest_monthly_plan(history, plan, "ben")
    monthly_envelope = _backtest_monthly_plan(history, plan, "nadia")

    assert owner is not None and monthly_envelope is not None
    assert owner["ledger"][1]["cash"] == 0
    assert monthly_envelope["ledger"][1]["cash"] == 100
    assert "100% buy redeploys all reserve" in owner["method"]


def test_tactical_entry_sizes_available_strategy_cash() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0}]
    plan = [
        {
            "month": month,
            "action": "BUY" if month == "Feb" else "HOLD",
            "buyBudgetPct": 50 if month == "Feb" else 0,
            "trimPositionPct": 0,
        }
        for month in MONTHS
    ]

    tactical = _backtest_monthly_plan(history, plan, "rex")
    monthly_envelope = _backtest_monthly_plan(history, plan, "nadia")

    assert tactical is not None and monthly_envelope is not None
    assert tactical["ledger"][1]["stockValue"] == 100
    assert monthly_envelope["ledger"][1]["stockValue"] == 50
    assert "available strategy cash" in tactical["method"]


def test_backtest_money_weighting_tracks_accumulated_shares_through_a_drop() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 95.0}]
    plan = [{"month": month, "action": "BUY", "buyBudgetPct": 100} for month in MONTHS]

    result = _backtest_monthly_plan(history, plan)

    assert result is not None
    # Twelve accumulated 100-unit purchases lose 5% (=60) before month 13's new contribution.
    assert result["profitLoss"] == -60.0
    assert result["endingValue"] == 1_240.0
    assert result["strategyMoneyWeightedReturnPct"] < 0


def test_backtest_exposes_small_fair_comparison_metrics() -> None:
    history = [
        {"date": f"2025-{index + 1:02d}-28", "month": MONTHS[index], "close": 100.0}
        for index in range(12)
    ] + [{"date": "2026-01-28", "month": "Jan", "close": 100.0}]
    plan = [{"month": month, "action": "BUY", "buyBudgetPct": 50} for month in MONTHS]

    result = _backtest_monthly_plan(history, plan)

    assert result is not None
    assert abs(result["strategyMoneyWeightedReturnPct"]) < 0.01
    assert abs(result["exposureNormalizedReturnPct"]) < 0.01
    assert abs(result["matchedExposureBenchmarkReturnPct"]) < 0.01


def test_agent_monthly_plan_preserves_character_trim_sizing() -> None:
    calculated = [{"month": month, "action": "HOLD", "returnPct": 0.0} for month in MONTHS]
    proposed = [
        {"month": month, "action": "TRIM" if month == "Jun" else "HOLD", "buyBudgetPct": 0, "trimPositionPct": 25 if month == "Jun" else 0, "reason": "My risk rule fired"}
        for month in MONTHS
    ]

    for agent_id in ("ben", "sam", "vera", "rex", "kai", "nadia", "alphawolf"):
        plan = _valid_agent_monthly_plan(calculated, proposed, agent_id, {"status": "INTACT"})
        assert plan is not None
        june = next(item for item in plan if item["month"] == "Jun")
        assert june["action"] == "TRIM"
        assert june["trimPositionPct"] == 25
