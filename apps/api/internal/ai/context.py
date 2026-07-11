from __future__ import annotations

from typing import Any

from internal.store.utils import json_safe

MAX_PRICE_POINTS = 72


def build_analysis_context(
    bundle: dict[str, Any],
    *,
    financials: dict[str, Any] | None,
    market_comparison: dict[str, Any] | None,
    domain_insights: dict[str, Any] | None,
    position_context: dict[str, Any] | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    financials = _compact_financial_research(financials or {})
    market_comparison = _compact_market_comparison(market_comparison or {})
    domain_insights = _compact_domain_insights(domain_insights or {})
    context = {
        "stock": bundle.get("stock"),
        "selectedStrategy": bundle.get("strategy"),
        "positionContext": position_context or {"isHolding": False, "mode": "candidate", "question": "Should the user buy this stock or not?"},
        "agentInputPack": _agent_input_pack(agent_id, bundle, financials, market_comparison, domain_insights),
        "business": bundle.get("business"),
        "performance": bundle.get("performance"),
        "technicals": bundle.get("technicals"),
        "platformVerdict": bundle.get("verdict"),
        "platformOutlook": bundle.get("outlook"),
        "industryRanking": bundle.get("peerRank"),
        "dividendDipPattern": bundle.get("dividendPattern"),
        "recentNews": bundle.get("news"),
        "priceHistory": _compact_price_history(bundle.get("history") or []),
        "financialResearch": financials,
        "marketComparison": market_comparison,
        "sectorAndIndustryResearch": domain_insights,
        # This is the requested page/setup strategy, not the selected AI persona. Keeping the
        # concepts separate prevents every Agent from being overwritten by the same swing role.
        "strategyMandate": _strategy_mandate(bundle.get("strategy"), bundle.get("mode")),
        # Shared macro backdrop so every persona can weigh the market regime the stock trades in
        # (SET Index for Thai names, S&P 500 for US) through its own lens instead of judging the
        # ticker in a vacuum. Each Agent decides how much this matters — it is context, not a verdict.
        "marketBackdrop": _market_backdrop(bundle.get("stock") or {}, market_comparison),
        "quantScorecard": _build_quant_scorecard(bundle, market_comparison),
    }
    return json_safe(context)


def _compact_financial_research(value: dict[str, Any]) -> dict[str, Any]:
    compact: dict[str, Any] = {}
    for key, item in value.items():
        if isinstance(item, dict) and "history" in item:
            compact[key] = {
                **item,
                "history": (item.get("history") or [])[:3],
            }
        elif isinstance(item, list):
            compact[key] = item[-12:] if key == "dividends" else item[:6]
        else:
            compact[key] = item
    return compact


def _compact_market_comparison(value: dict[str, Any]) -> dict[str, Any]:
    if not value:
        return {}
    return {**value, "points": (value.get("points") or [])[-18:]}


def _compact_domain_insights(value: dict[str, Any]) -> dict[str, Any]:
    compact = dict(value)
    sector = dict(compact.get("sectorInsight") or {})
    industry = dict(compact.get("industryInsight") or {})
    if sector:
        sector["industries"] = (sector.get("industries") or [])[:5]
        sector["topEtfs"] = (sector.get("topEtfs") or [])[:5]
        sector["topMutualFunds"] = (sector.get("topMutualFunds") or [])[:5]
        compact["sectorInsight"] = sector
    if industry:
        industry["topPerformingCompanies"] = (industry.get("topPerformingCompanies") or [])[:5]
        industry["topGrowthCompanies"] = (industry.get("topGrowthCompanies") or [])[:5]
        compact["industryInsight"] = industry
    return compact


def _market_backdrop(stock: dict[str, Any], market_comparison: dict[str, Any] | None) -> dict[str, Any]:
    symbol = str(stock.get("symbol") or "")
    is_thai = symbol.upper().endswith(".BK")
    index_name = "SET Index (Thailand)" if is_thai else "S&P 500 (US)"
    region = "Thailand / SET" if is_thai else "US"
    comparison = market_comparison or {}
    benchmark = comparison.get("benchmark") or {}
    stock_side = comparison.get("stock") or {}
    points = comparison.get("points") or []

    benchmark_return = _num(benchmark.get("returnPct"))
    stock_return = _num(stock_side.get("returnPct"))
    relative_pct = (stock_return - benchmark_return) if stock_return is not None and benchmark_return is not None else None

    # Regime = slope of the last three monthly rebased benchmark points (100 = one year ago).
    trend = "unknown"
    if len(points) >= 3:
        recent = [_num(point.get("benchmark")) for point in points[-3:]]
        if all(value is not None for value in recent):
            change = recent[-1] - recent[0]
            trend = "rising" if change > 1.5 else "falling" if change < -1.5 else "flat"

    regime = "unknown"
    if benchmark_return is not None:
        regime = "bull" if benchmark_return >= 8 else "bear" if benchmark_return <= -8 else "range-bound"

    return {
        "index": index_name,
        "region": region,
        "indexOneYearReturnPct": benchmark_return,
        "indexRecentTrend": trend,
        "marketRegime": regime,
        "stockVsMarketPct": relative_pct,
        "note": "Backdrop only. Weigh it through your own lens — a strong market does not make a weak setup a buy, and a soft market does not veto a wonderful business.",
    }


def _agent_input_pack(
    agent_id: str | None,
    bundle: dict[str, Any],
    financials: dict[str, Any] | None,
    market_comparison: dict[str, Any] | None,
    domain_insights: dict[str, Any] | None,
) -> dict[str, Any]:
    agent = (agent_id or "vera").strip().lower()
    stock = bundle.get("stock") or {}
    business = bundle.get("business") or {}
    technicals = bundle.get("technicals") or {}
    performance = bundle.get("performance") or {}
    returns = performance.get("returns") or {}
    verdict = bundle.get("verdict") or {}
    peer_rank = bundle.get("peerRank") or {}
    dividend_pattern = bundle.get("dividendPattern") or {}
    history = _compact_price_history(bundle.get("history") or [])
    latest_history = history[-30:] if history else []
    news = (bundle.get("news") or [])[:5]

    price = _num(stock.get("price")) or _num(business.get("currentPrice"))
    support = _num(technicals.get("support"))
    resistance = _num(technicals.get("resistance"))
    dividend_yield = _num(business.get("dividendYield"))
    payout_ratio = _num(business.get("payoutRatio"))
    pe = _num(business.get("peRatio"))
    forward_pe = _num(business.get("forwardPE"))
    pbv = _num(business.get("priceToBook"))
    target = _num(business.get("targetMeanPrice"))
    volatility = _num(technicals.get("volatility"))
    volume_ratio = _num(technicals.get("volumeRatio"))
    avg_volume = _num(technicals.get("avgVolume"))
    current_volume = _num(technicals.get("currentVolume"))
    volume_surge_pct = ((current_volume - avg_volume) / avg_volume * 100) if avg_volume and current_volume else None
    rsi = _num(technicals.get("rsi14"))
    revenue_growth = _num(business.get("revenueGrowth"))
    earnings_growth = _num(business.get("earningsGrowth"))

    core = {
        "symbol": stock.get("symbol"),
        "name": stock.get("name"),
        "price": price,
        "currency": stock.get("currency"),
        "selectedStrategy": bundle.get("strategy"),
    }

    if agent == "rex":
        return {
            "agent": "rex",
            "inputPriority": ["live tape", "entry/stop/target", "momentum", "volume", "near-term catalyst", "fundamentals as veto only"],
            "primary": {
                **core,
                "technicals": _pick(
                    technicals,
                    "signal",
                    "rsi14",
                    "macd",
                    "macdSignal",
                    "macdHistogram",
                    "sma20",
                    "sma50",
                    "support",
                    "resistance",
                    "momentum",
                    "volatility",
                    "avgVolume",
                    "currentVolume",
                    "volumeRatio",
                ),
                "recentPriceAction": latest_history[-15:],
                "riskMap": _risk_map(price, support, resistance, target),
                "recentNews": news[:3],
            },
            "secondary": {
                "businessVeto": _pick(business, "marketCap", "beta", "analystRating", "targetMeanPrice", "peRatio"),
                "relativePerformance": {"returns": returns, "marketComparison": market_comparison},
            },
            "mustAnswer": ["Is there a trade now?", "Where is the stop?", "What invalidates the setup?", "Is the tape hot or cold?"],
        }

    if agent == "kai":
        return {
            "agent": "kai",
            "inputPriority": ["volume surge (is the crowd here today)", "breakout heat", "momentum acceleration", "quick flip target", "rug-pull risk", "hard exit"],
            "primary": {
                **core,
                "volumeCheck": {
                    "currentVolume": current_volume,
                    "avgVolume": avg_volume,
                    "volumeRatio": volume_ratio,
                    "volumeSurgePct": volume_surge_pct,
                    "read": "Volume IS the crowd. A breakout on thin volume is a trap; a move on >1.5x average volume is real chase fuel. No volume, no chase.",
                },
                "chaseSetup": {
                    "technicalSignal": technicals.get("signal"),
                    "momentum": technicals.get("momentum"),
                    "rsi14": rsi,
                    "macd": technicals.get("macd"),
                    "macdSignal": technicals.get("macdSignal"),
                    "volumeRatio": volume_ratio,
                    "volatility": volatility,
                    "support": support,
                    "resistance": resistance,
                    "recentReturns": {key: returns.get(key) for key in ("1d", "1w", "1m", "ytd", "1y")},
                },
                "recentPriceAction": latest_history[-12:],
                "quickFlipMap": _risk_map(price, support, resistance, target),
                "recentNews": news[:5],
            },
            "secondary": {
                "businessVetoOnly": _pick(business, "marketCap", "beta", "debtToEquity", "profitMargin", "analystRating", "targetMeanPrice"),
                "relativeHeat": {"peerRank": peer_rank, "marketComparison": market_comparison},
            },
            "mustAnswer": ["Is volume confirming the move or is it a thin-air fakeout?", "Is this chaseable now?", "Where does the fun stop?", "Where is the fast sell/trim?", "What rug-pull signal kills the trade?"],
        }

    if agent == "nadia":
        return {
            "agent": "nadia",
            "inputPriority": ["factor exposure", "relative strength", "volatility", "drawdown risk", "correlation/sector", "rebalance rule"],
            "primary": {
                **core,
                "factorProxy": {
                    "value": {"peRatio": pe, "priceToBook": pbv, "dividendYield": dividend_yield},
                    "quality": _pick(business, "roe", "roa", "profitMargin", "operatingMargin", "grossMargin", "debtToEquity"),
                    "growth": _pick(business, "revenueGrowth", "earningsGrowth"),
                    "momentum": {"returns": returns, "technicalSignal": technicals.get("signal"), "momentum": technicals.get("momentum")},
                    "risk": {"volatility": volatility, "beta": business.get("beta"), "volumeRatio": volume_ratio},
                },
                "quantScorecard": _build_quant_scorecard(bundle, market_comparison),
                "technicalCompatibility": _pick(
                    technicals,
                    "signal",
                    "rsi14",
                    "macd",
                    "macdSignal",
                    "macdHistogram",
                    "stochasticK",
                    "stochasticD",
                    "sma20",
                    "sma50",
                    "sma200",
                    "ema20",
                    "volumeRatio",
                    "volatility",
                ),
                "relativePerformance": {"peerRank": peer_rank, "marketComparison": market_comparison},
            },
            "secondary": {
                "priceHistorySample": latest_history,
                "sectorAndIndustryResearch": domain_insights,
            },
            "mustAnswer": ["Which factor is strongest?", "What is the risk flag?", "Is the signal strong enough by rule?", "What is the rebalance action?"],
        }

    if agent == "sam":
        return {
            "agent": "sam",
            "inputPriority": ["dividend safety", "yield-on-cost potential", "cash-flow durability", "moat/quality", "DCA/DRIP plan", "price noise last"],
            "primary": {
                **core,
                "income": {
                    "dividendYield": dividend_yield,
                    "payoutRatio": payout_ratio,
                    "dividendRate": business.get("dividendRate") or stock.get("dividendRate"),
                    "dividendDate": stock.get("dividendDate"),
                    "dividendDipPattern": dividend_pattern,
                },
                "durability": _pick(business, "marketCap", "sector", "industry", "roe", "profitMargin", "operatingMargin", "debtToEquity", "beta"),
                "longTermReturns": {key: returns.get(key) for key in ("1y", "2y", "3y", "4y", "ytd")},
                "valuationForDca": {"price": price, "peRatio": pe, "priceToBook": pbv, "targetMeanPrice": target},
            },
            "secondary": {
                "recentNews": news,
                "financialResearch": _pick(financials or {}, "cashFlow", "incomeStatement", "balanceSheet", "dividends"),
            },
            "mustAnswer": ["Is the income safe?", "Is this a DRIP/DCA add?", "What would make it a yield trap?", "Should short-term price action be ignored?"],
        }

    if agent == "ben":
        return {
            "agent": "ben",
            "inputPriority": ["moat durability", "5-year forward earnings power & reinvestment runway", "management and capital allocation", "owner earnings", "balance-sheet resilience", "price only after structure"],
            "primary": {
                **core,
                "businessStructure": {
                    "sector": business.get("sector"),
                    "industry": business.get("industry"),
                    "marketCap": business.get("marketCap"),
                    "roe": business.get("roe"),
                    "roa": business.get("roa"),
                    "grossMargin": business.get("grossMargin"),
                    "operatingMargin": business.get("operatingMargin"),
                    "profitMargin": business.get("profitMargin"),
                    "debtToEquity": business.get("debtToEquity"),
                    "revenueGrowth": business.get("revenueGrowth"),
                    "earningsGrowth": business.get("earningsGrowth"),
                },
                # The forward lens: is this business's earnings power likely bigger in 5 years?
                "forwardView": {
                    "forwardPE": forward_pe,
                    "trailingPE": pe,
                    "revenueGrowth": revenue_growth,
                    "earningsGrowth": earnings_growth,
                    "roe": business.get("roe"),
                    "reinvestmentRunway": "Judge whether high ROE + retained earnings + growth can compound owner earnings for years. Falling forwardPE vs trailingPE implies the market expects earnings to grow into the price.",
                    "horizon": "5 years",
                },
                "capitalAllocation": _pick(financials or {}, "cashFlow", "balanceSheet", "incomeStatement", "dividends"),
                "ownerEarningsAudit": _funding_quality_audit(financials or {}, business),
                "ownershipPriceCheck": {"price": price, "peRatio": pe, "forwardPE": forward_pe, "priceToBook": pbv, "targetMeanPrice": target, "dividendYield": dividend_yield},
                "longTermReturns": {key: returns.get(key) for key in ("1y", "2y", "3y", "4y", "ytd")},
            },
            "secondary": {
                "recentNews": news,
                "industryRanking": peer_rank,
                "sectorAndIndustryResearch": domain_insights,
                "technicalsAsNoiseCheck": _pick(technicals, "signal", "sma50", "sma200", "support", "resistance"),
            },
            "mustAnswer": ["Is this a wonderful business?", "Will its earnings power be materially larger in 5 years, and why?", "Can it reinvest at high returns?", "Would an owner ignore the price noise?", "What evidence would break the long-term thesis?"],
        }

    if agent == "alphawolf":
        return {
            "agent": "alphawolf",
            "inputPriority": ["price attractiveness", "business structure", "technical timing", "income/cash-flow risk", "relative strength", "portfolio fit", "downside control"],
            "primary": {
                **core,
                "fullCornerCheck": {
                    "valuation": {"peRatio": pe, "priceToBook": pbv, "targetMeanPrice": target, "dividendYield": dividend_yield},
                    "structure": _pick(business, "marketCap", "sector", "industry", "roe", "roa", "profitMargin", "operatingMargin", "grossMargin", "debtToEquity", "revenueGrowth", "earningsGrowth"),
                    "timing": _pick(technicals, "signal", "rsi14", "macd", "macdSignal", "sma20", "sma50", "sma200", "support", "resistance", "momentum", "volumeRatio", "volatility"),
                    "income": {"dividendYield": dividend_yield, "payoutRatio": payout_ratio, "dividendPattern": dividend_pattern},
                    "riskReward": _risk_map(price, support, resistance, target),
                    "relativePerformance": {"returns": returns, "peerRank": peer_rank, "marketComparison": market_comparison},
                },
                "quantScorecard": _build_quant_scorecard(bundle, market_comparison),
                "fundingQualityAudit": _funding_quality_audit(financials or {}, business),
                "recentNews": news,
            },
            "secondary": {
                "financialResearch": _pick(financials or {}, "incomeStatement", "balanceSheet", "cashFlow", "earnings", "calendar", "dividends"),
                "sectorAndIndustryResearch": domain_insights,
                "priceHistorySample": latest_history,
            },
            "mustAnswer": ["What does each corner say?", "Which corner is the bottleneck?", "Is the setup portfolio-worthy?", "What is the exact risk budget/action?"],
        }

    return {
        "agent": "vera",
        "inputPriority": ["would I buy it at this price now", "intrinsic value & margin of safety", "forward earnings vs price", "balance sheet", "multi-year track record", "technical timing last"],
        "primary": {
            **core,
            "valuation": {
                "peRatio": pe,
                "forwardPE": forward_pe,
                "priceToBook": pbv,
                "targetMeanPrice": target,
                "currentPrice": price,
                "dividendYield": dividend_yield,
                "analystRating": business.get("analystRating"),
            },
            "financialHealth": _pick(business, "roe", "roa", "profitMargin", "operatingMargin", "grossMargin", "debtToEquity", "payoutRatio"),
            "growthQuality": _pick(business, "revenueGrowth", "earningsGrowth"),
            # Track record so the call rests on years of evidence, not a single snapshot.
            "multiYearReturns": {key: returns.get(key) for key in ("1y", "2y", "3y", "4y", "ytd")},
            "financialResearch": _pick(financials or {}, "incomeStatement", "balanceSheet", "cashFlow", "earnings", "calendar"),
            "fundingQualityAudit": _funding_quality_audit(financials or {}, business),
            "marginOfSafety": _risk_map(price, support, resistance, target),
        },
        "secondary": {
            "technicals": _pick(technicals, "signal", "rsi14", "sma20", "sma50", "sma200", "support", "resistance"),
            "industryRanking": peer_rank,
            "sectorAndIndustryResearch": domain_insights,
            "recentNews": news,
        },
        "mustAnswer": ["Would I personally buy this at today's price — yes, no, or only below what?", "Is the margin of safety real given forward earnings?", "Does the multi-year record support the thesis?", "What single number would flip my call?"],
    }


def _pick(source: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {key: source.get(key) for key in keys if key in source}


def _funding_quality_audit(financials: dict[str, Any], business: dict[str, Any]) -> dict[str, Any]:
    def latest(statement: str) -> dict[str, Any]:
        value = financials.get(statement)
        return value.get("latest") if isinstance(value, dict) and isinstance(value.get("latest"), dict) else {}

    income = latest("incomeStatement")
    cash_flow = latest("cashFlow")
    balance = latest("balanceSheet")
    net_income = _num(income.get("Net Income"))
    operating_cash_flow = _num(cash_flow.get("Operating Cash Flow"))
    capital_expenditure = _num(cash_flow.get("Capital Expenditure"))
    supplied_free_cash_flow = _num(cash_flow.get("Free Cash Flow"))
    calculated_free_cash_flow = None
    if operating_cash_flow is not None and capital_expenditure is not None:
        calculated_free_cash_flow = operating_cash_flow + capital_expenditure if capital_expenditure < 0 else operating_cash_flow - capital_expenditure
    free_cash_flow = supplied_free_cash_flow if supplied_free_cash_flow is not None else calculated_free_cash_flow
    cash = _num(business.get("totalCash"))
    debt = _num(balance.get("Total Debt")) or _num(business.get("totalDebt"))
    total_assets = _num(balance.get("Total Assets"))
    total_liabilities = _num(balance.get("Total Liabilities"))
    cash_conversion = (operating_cash_flow / net_income) if operating_cash_flow is not None and net_income not in (None, 0) else None
    net_cash = (cash - debt) if cash is not None and debt is not None else None

    if free_cash_flow is None:
        funding_read = "UNPROVEN: free cash flow evidence is unavailable"
    elif free_cash_flow <= 0 and debt is not None and debt > 0:
        funding_read = "RISK: free cash flow is not funding reinvestment; debt dependence must be investigated"
    elif free_cash_flow > 0 and net_cash is not None and net_cash >= 0:
        funding_read = "SELF_FUNDED: positive free cash flow and net cash support reinvestment"
    elif free_cash_flow > 0:
        funding_read = "CASH_GENERATIVE_BUT_LEVERAGED: operations fund growth, but debt remains material"
    else:
        funding_read = "UNPROVEN: funding source cannot be classified from supplied evidence"

    return {
        "netIncome": net_income,
        "operatingCashFlow": operating_cash_flow,
        "capitalExpenditure": capital_expenditure,
        "freeCashFlow": free_cash_flow,
        "freeCashFlowSource": "reported" if supplied_free_cash_flow is not None else "calculated_operating_cash_flow_less_capex" if calculated_free_cash_flow is not None else "unavailable",
        "operatingCashFlowToNetIncome": cash_conversion,
        "cash": cash,
        "totalDebt": debt,
        "netCash": net_cash,
        "totalAssets": total_assets,
        "totalLiabilities": total_liabilities,
        "fundingRead": funding_read,
        "guardrail": "Total assets and market capitalization are not spendable budget. Classify reinvestment as internally funded only when operating/free cash flow supports it.",
    }


def _risk_map(price: float | None, support: float | None, resistance: float | None, target: float | None) -> dict[str, Any]:
    downside_pct = ((support - price) / price * 100) if price and support else None
    upside_to_resistance_pct = ((resistance - price) / price * 100) if price and resistance else None
    upside_to_target_pct = ((target - price) / price * 100) if price and target else None
    return {
        "support": support,
        "resistance": resistance,
        "targetMeanPrice": target,
        "downsideToSupportPct": downside_pct,
        "upsideToResistancePct": upside_to_resistance_pct,
        "upsideToTargetPct": upside_to_target_pct,
    }


def _compact_price_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(history) <= MAX_PRICE_POINTS:
        return history
    step = max(1, (len(history) + MAX_PRICE_POINTS - 1) // MAX_PRICE_POINTS)
    sampled = history[::step]
    if sampled[-1] != history[-1]:
        sampled.append(history[-1])
    return sampled


def _build_quant_scorecard(bundle: dict[str, Any], market_comparison: dict[str, Any] | None) -> dict[str, Any]:
    stock = bundle.get("stock") or {}
    business = bundle.get("business") or {}
    technicals = bundle.get("technicals") or {}
    performance = bundle.get("performance") or {}
    returns = performance.get("returns") or {}
    peer_rank = bundle.get("peerRank") or {}
    verdict = bundle.get("verdict") or {}

    price = _num(stock.get("price"))
    support = _num(technicals.get("support"))
    resistance = _num(technicals.get("resistance"))
    rsi = _num(technicals.get("rsi14"))
    volume_ratio = _num(technicals.get("volumeRatio"))
    macd = _num(technicals.get("macd"))
    macd_signal = _num(technicals.get("macdSignal"))
    sma20 = _num(technicals.get("sma20"))
    sma50 = _num(technicals.get("sma50"))
    sma200 = _num(technicals.get("sma200"))
    volatility = _num(technicals.get("volatility"))

    technical = 50.0
    if price and sma20 and sma50 and sma200:
        technical += 18 if price > sma20 > sma50 > sma200 else 8 if price > sma50 > sma200 else -14 if price < sma50 else 0
    if macd is not None and macd_signal is not None:
        technical += 10 if macd > macd_signal else -10
    if rsi is not None:
        technical += 10 if 45 <= rsi <= 64 else 3 if 65 <= rsi <= 70 else -8 if 71 <= rsi <= 78 else -22 if rsi > 78 else -10 if rsi < 32 else 0
    if volume_ratio is not None:
        technical += 10 if volume_ratio >= 1.25 else -10 if volume_ratio < 0.7 else 0
    if price and resistance:
        gap_to_resistance = ((resistance - price) / price) * 100
        technical += 8 if 4 <= gap_to_resistance <= 12 else -14 if gap_to_resistance < 2 else 0
    if price and support:
        gap_to_support = ((price - support) / price) * 100
        technical += 8 if 0 <= gap_to_support <= 5 else -12 if gap_to_support > 15 else 0

    business_score = 50.0
    revenue_growth = _num(business.get("revenueGrowth"))
    earnings_growth = _num(business.get("earningsGrowth"))
    profit_margin = _num(business.get("profitMargin"))
    roe = _num(business.get("roe"))
    pe = _num(business.get("peRatio"))
    pbv = _num(business.get("priceToBook"))
    target = _num(business.get("targetMeanPrice"))
    if revenue_growth is not None:
        business_score += 14 if revenue_growth >= 20 else 7 if revenue_growth >= 8 else -10 if revenue_growth < 0 else 0
    if earnings_growth is not None:
        business_score += 14 if earnings_growth >= 25 else 7 if earnings_growth >= 8 else -12 if earnings_growth < 0 else 0
    if profit_margin is not None:
        business_score += 8 if profit_margin >= 12 else -7 if profit_margin < 4 else 0
    if roe is not None:
        business_score += 7 if roe >= 15 else -5 if roe < 5 else 0
    if pe is not None and pe > 0:
        business_score += 5 if pe <= 22 else -8 if pe >= 60 else -3 if pe >= 35 else 0
    if pbv is not None and pbv > 0:
        business_score += 4 if pbv <= 3 else -6 if pbv >= 10 else 0
    if price and target:
        business_score += 10 if target >= price * 1.15 else -10 if target < price else 0

    relative = 50.0
    ytd = _num(returns.get("ytd"))
    one_year = _num(returns.get("1y"))
    if ytd is not None:
        relative += 12 if ytd >= 25 else 6 if ytd >= 8 else -8 if ytd < -10 else 0
    if one_year is not None:
        relative += 18 if one_year >= 40 else 10 if one_year >= 15 else -10 if one_year < -15 else 0
    rank = _num(peer_rank.get("rank"))
    count = _num(peer_rank.get("count"))
    if rank and count:
        percentile = rank / count
        relative += 10 if percentile <= 0.2 else -8 if percentile >= 0.75 else 0
    stock_return = _num((market_comparison or {}).get("stock", {}).get("returnPct"))
    benchmark_return = _num((market_comparison or {}).get("benchmark", {}).get("returnPct"))
    if stock_return is not None and benchmark_return is not None:
        gap = stock_return - benchmark_return
        relative += 10 if gap >= 15 else -8 if gap <= -10 else 0

    platform = _num(verdict.get("score")) or 50.0
    swing = _swing_entry_score(
        price=price,
        support=support,
        resistance=resistance,
        rsi=rsi,
        volume_ratio=volume_ratio,
        sma20=sma20,
        sma50=sma50,
        volatility=volatility,
        target=target,
    )
    score = round(_clamp(0.34 * swing + 0.24 * technical + 0.18 * business_score + 0.14 * relative + 0.10 * platform, 1, 100))
    positives: list[str] = []
    negatives: list[str] = []
    if one_year is not None and one_year >= 40:
        positives.append(f"1Y return is extreme at {one_year:.1f}%")
    if revenue_growth is not None and revenue_growth >= 20:
        positives.append(f"revenue growth is strong at {revenue_growth:.1f}%")
    if earnings_growth is not None and earnings_growth >= 25:
        positives.append(f"earnings growth is strong at {earnings_growth:.1f}%")
    if price and sma20 and sma50 and sma200 and price > sma20 > sma50 > sma200:
        positives.append("price is above rising key moving averages")
    if volume_ratio is not None and volume_ratio < 0.7:
        negatives.append(f"volume is weak at {volume_ratio:.2f}x average")
    if pe is not None and pe >= 60:
        negatives.append(f"valuation is stretched at {pe:.1f}x PE")
    if price and resistance and ((resistance - price) / price) * 100 < 5:
        negatives.append(f"price is close to resistance near {resistance:.2f}")
    if price and target and target < price:
        negatives.append("analyst mean target is below current price")
    if rsi is not None and rsi > 78:
        negatives.append(f"RSI is overextended at {rsi:.1f}, which is poor swing-entry timing")
    if price and support and resistance:
        risk = price - support
        reward = resistance - price
        if risk > 0 and reward > 0 and reward / risk < 0.7:
            negatives.append(f"reward/risk to resistance is weak at {reward / risk:.2f}x")
    return {
        "score": score,
        "bands": {
            "90-100": "rare: buy now only when technical timing, business quality, volume, and market context all agree",
            "75-89": "strong: high-quality setup, but one important risk may still need confirmation",
            "55-74": "watch/wait: enough positives to track, but not clean enough for aggressive deployment",
            "35-54": "weak/mixed: capital should wait for better evidence",
            "1-34": "avoid: broken trend, poor fundamentals, or risk overwhelms reward",
        },
        "componentScores": {
            "technicalTiming": round(_clamp(technical, 1, 100)),
            "swingEntry": round(_clamp(swing, 1, 100)),
            "businessQuality": round(_clamp(business_score, 1, 100)),
            "relativeStrength": round(_clamp(relative, 1, 100)),
            "platformSetup": round(_clamp(platform, 1, 100)),
        },
        "positives": positives[:5],
        "negatives": negatives[:5],
        "instruction": "Use this scorecard as numeric context only. Do not copy its wording. Write the investment thesis from the full supplied data.",
    }


def _strategy_mandate(strategy: Any, mode: Any = None) -> dict[str, Any]:
    selected = str(strategy or "").strip().lower()
    selected_mode = str(mode or "").strip().lower()
    if selected == "momentum" and selected_mode != "fomo":
        return {
            "name": "Momentum / swing setup requested by the page",
            "purpose": "Describe the setup being inspected. This is not the selected Agent's identity or decision method.",
            "decisionOrder": [
                "Classify the setup: support turn, pullback base, early reversal, failed reversal, extended breakout, exhaustion, or no-trade.",
                "Check swing entry quality: closeness to support/low zone, evidence that the turn has started, distance to resistance, volume confirmation, and reward/risk.",
                "Then check business/sector context as a tailwind or veto, not as a reason to chase a bad entry.",
                "Return BUY only when the entry is near the low/support zone or has just turned up from it. Return WATCH when the stock is good but already extended.",
                "Return AVOID when reward/risk, trend, or fundamentals are poor.",
            ],
            "biasControl": "Do not favor bull-market winners by default. A strong uptrend near resistance is a FOMO/Momentum setup, not a Swing Trade buy.",
            "buyNowRequirements": [
                "clear support nearby or price has just bounced from a low/base",
                "upside to resistance/target is larger than downside to invalidation",
                "volume confirms the turn or pullback risk is controlled",
                "RSI is not in exhaustion; the setup should feel early, not chased",
            ],
        }
    return {
        "name": "Selected page strategy",
        "purpose": "Describe the setup being inspected. This is not the selected Agent's identity or decision method.",
        "decisionOrder": [
            "Judge the current entry, not only company quality.",
            "Compare upside, downside, valuation, trend, and catalyst support.",
            "Separate good company from good buy.",
        ],
        "biasControl": "Do not reward winners automatically; demand a valid entry and reward/risk.",
    }


def _swing_entry_score(
    *,
    price: float | None,
    support: float | None,
    resistance: float | None,
    rsi: float | None,
    volume_ratio: float | None,
    sma20: float | None,
    sma50: float | None,
    volatility: float | None,
    target: float | None,
) -> float:
    score = 50.0
    if price and support and resistance:
        downside = max(price - support, 0.01)
        upside = max(resistance - price, 0.0)
        reward_risk = upside / downside
        score += 22 if reward_risk >= 1.6 else 10 if reward_risk >= 1.0 else -18 if reward_risk < 0.7 else -8
        gap_to_resistance = (resistance - price) / price * 100
        gap_to_support = (price - support) / price * 100
        score += 18 if 1 <= gap_to_support <= 6 else 8 if 0 <= gap_to_support < 1 else -16 if gap_to_support > 12 else 0
        score += 10 if gap_to_resistance >= 6 else -18 if gap_to_resistance < 2 else 0
    if rsi is not None:
        score += 16 if 40 <= rsi <= 58 else 7 if 58 < rsi <= 66 else -14 if 66 < rsi <= 75 else -30 if rsi > 75 else -8 if rsi < 32 else 0
    if volume_ratio is not None:
        score += 12 if volume_ratio >= 1.05 else -12 if volume_ratio < 0.7 else 0
    if price and sma20 and sma50:
        gap_to_sma20 = abs(price - sma20) / price * 100
        score += 10 if price >= sma20 and gap_to_sma20 <= 5 else 4 if price > sma50 else -12
    if price and target:
        upside_to_target = (target - price) / price * 100
        score += 10 if upside_to_target >= 12 else -14 if upside_to_target < 0 else -5 if upside_to_target < 5 else 0
    if volatility is not None and volatility > 6:
        score -= 4
    return _clamp(score, 1, 100)


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
