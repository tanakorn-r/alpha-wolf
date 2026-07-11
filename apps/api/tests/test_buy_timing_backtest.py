from datetime import datetime, timezone

import pandas as pd

from internal.market.buy_timing import MONTHS, _backtest_monthly_plan, _close_series, _valid_agent_monthly_plan


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


def test_agent_monthly_plan_does_not_force_hold_months_into_dca_buys() -> None:
    calculated = [{"month": month, "action": "HOLD", "returnPct": 0.0} for month in MONTHS]
    proposed = [{"month": month, "action": "HOLD", "buyBudgetPct": 0, "trimPositionPct": 0, "reason": "My evidence gate failed"} for month in MONTHS]

    for agent_id in ("ben", "sam", "vera", "rex", "kai", "nadia", "alphawolf"):
        plan = _valid_agent_monthly_plan(calculated, proposed, agent_id, {"status": "MIXED"})
        assert plan is not None
        assert all(item["action"] == "HOLD" and item["buyBudgetPct"] == 0 for item in plan)


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
