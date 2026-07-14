from __future__ import annotations

from typing import Any

from internal.store.utils import as_float

THAI_BANK_SYMBOLS = {"BAY", "BBL", "CIMBT", "KBANK", "KKP", "KTB", "LHFG", "SCB", "TISCO", "TTB"}


def classify_company_structure(business: dict[str, Any] | None, stock: dict[str, Any] | None = None) -> dict[str, Any]:
    """Describe the economic structure that should govern metric interpretation."""
    business = business or {}
    stock = stock or {}
    sector = str(business.get("sector") or stock.get("sector") or "Unknown")
    industry = str(business.get("industry") or sector or "Unknown")
    text = f"{sector} {industry} {business.get('name') or stock.get('name') or ''}".lower()
    currency = str(stock.get("currency") or business.get("currency") or "USD").upper()
    market_cap = as_float(business.get("marketCap") or stock.get("marketCap"))

    symbol_root = str(stock.get("symbol") or business.get("symbol") or "").upper().split(".")[0]
    if symbol_root in THAI_BANK_SYMBOLS or any(token in text for token in ("bank", "credit services", "financial conglomerate")):
        archetype = "BANK"
        label = "Deposit-funded bank / lender"
        primary = ["price-to-book versus bank peers", "ROE versus cost of equity", "asset quality/NPL trend", "capital adequacy", "net-interest margin and loan growth"]
        avoid = ["generic corporate debt/equity limits", "industrial free-cash-flow conversion", "raw debt totals without separating deposits and funding liabilities"]
        valuation = "Normalize primarily against bank peers and the bank's own P/B-ROE history; low P/E alone is not enough."
        leverage = "A bank's leverage is its operating model. Do not apply the platform's ordinary-company 200% debt/equity ceiling; require capital, liquidity, and asset-quality evidence instead."
    elif "insurance" in text:
        archetype = "INSURER"
        label = "Insurance balance-sheet business"
        primary = ["price-to-book and ROE", "underwriting/combined ratio", "reserve adequacy", "solvency capital", "investment-portfolio quality"]
        avoid = ["generic industrial debt/equity limits", "revenue growth without underwriting quality", "ordinary free-cash-flow rules"]
        valuation = "Use P/B, normalized ROE, reserve quality, and underwriting-cycle peers."
        leverage = "Policy liabilities are not ordinary corporate borrowings; judge solvency and reserve adequacy instead."
    elif any(token in text for token in ("reit", "real estate investment trust")):
        archetype = "REIT"
        label = "Property income trust"
        primary = ["FFO/AFFO per unit", "distribution coverage", "occupancy and rent growth", "net debt/EBITDA", "debt maturity and interest coverage", "NAV discount/premium"]
        avoid = ["ordinary EPS P/E as the main valuation", "generic free cash flow after property investment", "revenue growth without occupancy/rent context"]
        valuation = "Use FFO/AFFO yield, NAV, distribution coverage, and REIT peers."
        leverage = "Leverage is structural but must be tested through coverage and maturities, not a universal corporate D/E cutoff."
    elif any(token in text for token in ("real estate", "property developer", "residential construction")):
        archetype = "REAL_ESTATE_DEVELOPER"
        label = "Property developer / owner"
        primary = ["presales and backlog conversion", "NAV and land-bank quality", "inventory turns", "operating cash flow", "net debt/equity and interest coverage"]
        avoid = ["treating appraisal gains as recurring cash earnings", "P/E without project-cycle context", "ignoring inventory and refinancing risk"]
        valuation = "Use NAV discount/premium, normalized project margins, backlog quality, and direct property-development peers."
        leverage = "Judge debt against realizable inventory, presales/backlog, operating cash conversion, coverage, and maturity timing."
    elif any(token in text for token in ("utility", "regulated electric", "independent power")):
        archetype = "UTILITY"
        label = "Capital-intensive utility"
        primary = ["regulated/contracted cash flow", "interest coverage", "net debt/EBITDA", "capex funding", "dividend coverage", "allowed return or contract tenor"]
        avoid = ["low leverage as a universal requirement", "growth-company margin rules", "short-term free cash flow without capex context"]
        valuation = "Normalize yield and enterprise multiples against regulated or contracted utility peers."
        leverage = "Higher leverage can be normal when cash flow is regulated or contracted; judge coverage, tenor, and refinancing risk."
    elif any(token in text for token in ("hotel", "lodging", "resort", "hospitality", "restaurant", "travel services")):
        archetype = "HOSPITALITY_RESTAURANT"
        label = "Seasonal hospitality / restaurant operator"
        primary = ["RevPAR/ADR and occupancy by geography", "same-store restaurant sales and outlet economics", "normalized EBITDA margin", "lease-adjusted net debt/EBITDA and interest coverage", "free cash flow through the full travel cycle"]
        avoid = ["treating one weak calendar month as a broken thesis", "using bank leverage rules", "extrapolating one peak travel quarter", "assuming Thailand seasonality represents a global portfolio"]
        valuation = "Use normalized EV/EBITDA, free-cash-flow yield, and sum-of-parts or direct hospitality/restaurant peers across a full seasonal cycle."
        leverage = "Hotels and restaurants can carry property, lease, and acquisition debt. Judge lease-adjusted net debt/EBITDA, coverage, maturities, and deleveraging—not debt/equity alone."
    elif any(token in text for token in ("healthcare", "medical", "hospital", "biotechnology", "pharmaceutical", "drug manufacturer")):
        archetype = "HEALTHCARE"
        label = "Healthcare / life-sciences operator"
        primary = ["patient volume or product demand", "pricing and reimbursement mix", "pipeline/regulatory evidence", "normalized margin", "cash runway or free cash flow"]
        avoid = ["valuing an unapproved pipeline as certain", "one clinical outcome without probability/risk context", "generic revenue growth without reimbursement or capacity quality"]
        valuation = "Use the relevant hospital capacity/EBITDA, profitable pharma cash flow, or risk-adjusted pipeline framework and direct healthcare peers."
        leverage = "For profitable operators judge coverage and capex; for pre-profit biotech judge cash runway, dilution, and milestone funding."
    elif any(token in text for token in ("consumer defensive", "consumer staples", "packaged foods", "beverages", "household products", "tobacco")):
        archetype = "CONSUMER_STAPLES"
        label = "Defensive branded-consumer business"
        primary = ["organic volume and pricing", "gross-margin resilience", "market share", "free-cash-flow conversion", "ROIC and brand investment"]
        avoid = ["calling price-led revenue growth durable without volume", "paying any multiple for defensiveness", "ignoring input-cost and channel pressure"]
        valuation = "Use normalized cash earnings, ROIC, organic growth, and branded-staples peers; defensiveness can justify a premium only when per-share economics support it."
        leverage = "Stable demand may support moderate leverage, but require cash conversion, coverage, and no erosion from buybacks or acquisitions."
    elif any(token in text for token in ("consumer cyclical", "consumer discretionary", "retail", "apparel", "footwear", "auto manufacturer", "automotive", "leisure", "entertainment")):
        archetype = "CONSUMER_DISCRETIONARY"
        label = "Consumer-discretionary operator"
        primary = ["same-store/unit sales", "traffic and ticket", "inventory turns", "gross and operating margin", "consumer-cycle cash conversion"]
        avoid = ["extrapolating promotion-led growth", "ignoring inventory markdowns", "treating a holiday quarter as a normal run rate"]
        valuation = "Use normalized through-cycle earnings/cash flow, unit economics, and direct format/category peers."
        leverage = "Test leases and debt against trough sales, inventory liquidity, fixed-charge coverage, and refinancing needs."
    elif any(token in text for token in ("telecom", "wireless", "broadband")):
        archetype = "TELECOM"
        label = "Network / telecom operator"
        primary = ["subscriber and ARPU quality", "churn", "network capex", "spectrum obligations", "free cash flow after capex", "net debt/EBITDA"]
        avoid = ["EBITDA without capex", "subscriber growth bought through uneconomic promotions", "dividend yield without spectrum and debt funding"]
        valuation = "Use EV/EBITDA together with post-capex free cash flow, subscriber quality, spectrum liabilities, and telecom peers."
        leverage = "Network leverage can be structural; judge post-capex coverage, spectrum payments, maturities, and pricing power."
    elif any(token in text for token in ("airline", "transportation", "logistics", "shipping", "railroad", "trucking")):
        archetype = "TRANSPORTATION"
        label = "Transportation / logistics operator"
        primary = ["load factor or utilization", "yield/rates", "unit cost", "fleet or asset commitments", "mid-cycle free cash flow", "net debt/EBITDA"]
        avoid = ["capitalizing peak freight or travel rates forever", "revenue growth without utilization and yield", "ignoring fuel and fleet obligations"]
        valuation = "Use normalized mid-cycle earnings, asset value where relevant, and mode-specific transportation peers."
        leverage = "Stress debt, leases, and fleet commitments against trough utilization, fuel/rate shocks, coverage, and refinancing."
    elif any(token in text for token in ("asset management", "capital markets", "brokerage", "financial services")):
        archetype = "FINANCIAL_SERVICES"
        label = "Fee / market-sensitive financial business"
        primary = ["assets or client balances", "net flows", "fee rate and mix", "capital/liquidity", "normalized ROE", "credit or market exposure"]
        avoid = ["industrial free-cash-flow rules", "revenue growth without market-beta separation", "raw leverage without regulatory or funding context"]
        valuation = "Use normalized ROE, earnings through the market cycle, book value where relevant, and direct financial-services peers."
        leverage = "Separate operating funding, client balances, and regulatory capital from ordinary corporate debt; judge liquidity and loss absorption."
    elif any(token in text for token in ("oil", "gas", "energy", "mining", "metals", "commodity", "chemicals", "basic materials")):
        archetype = "CYCLICAL"
        label = "Commodity / cyclical producer"
        primary = ["mid-cycle margin and earnings", "cost-curve position", "net debt through the cycle", "reserve/resource life", "capital discipline"]
        avoid = ["valuing peak earnings as permanent", "one-year growth extrapolation", "spot-price margins without a cycle case"]
        valuation = "Use normalized mid-cycle earnings, NAV/enterprise metrics, and same-commodity peers."
        leverage = "Require balance-sheet survival at trough-cycle prices, not merely acceptable leverage at the peak."
    elif any(token in text for token in ("software", "internet content", "semiconductor", "technology")):
        archetype = "GROWTH_TECH"
        label = "Scalable growth / technology business"
        primary = ["revenue durability", "gross margin", "operating leverage", "free-cash-flow margin", "retention or adoption", "valuation versus growth"]
        avoid = ["P/B as a central valuation rule", "mature-company growth floors", "ignoring dilution or stock compensation"]
        valuation = "Judge valuation versus durable growth and cash-flow conversion, with software/technology peers."
        leverage = "Low leverage is helpful, but cash runway, dilution, and conversion to free cash flow are usually more decision-relevant."
    elif any(token in text for token in ("industrial", "machinery", "aerospace", "construction", "engineering", "business equipment")):
        archetype = "INDUSTRIAL"
        label = "Industrial / project-cycle operator"
        primary = ["organic orders", "backlog quality and conversion", "book-to-bill", "normalized margin", "ROIC", "free-cash-flow conversion"]
        avoid = ["revenue growth without order quality", "margin peaks without cycle normalization", "backlog totals without cancellation and cash terms"]
        valuation = "Use normalized cycle earnings, ROIC, backlog quality, and direct industrial peers."
        leverage = "Judge leverage against backlog cash quality, working-capital swings, coverage, and trough-cycle earnings."
    else:
        archetype = "OPERATING_COMPANY"
        label = "General operating company"
        primary = ["normalized margins", "ROE/ROIC", "free-cash-flow conversion", "debt capacity", "growth durability", "peer-relative valuation"]
        avoid = ["one universal sector multiple", "a single-year snapshot", "size-blind growth expectations"]
        valuation = "Use normalized earnings/cash flow and compare with direct industry peers and the company's own history."
        leverage = "Use debt/equity together with interest coverage, cash generation, and cyclicality."

    size_bucket = _size_bucket(market_cap, currency)
    if size_bucket in {"MEGA_CAP", "LARGE_CAP"}:
        size_rule = "Do not demand small-cap growth from a mature large company. Reward resilience, funding access, liquidity, and stable per-share economics; compare it with large peers."
    elif size_bucket in {"SMALL_CAP", "MICRO_CAP"}:
        size_rule = "Require extra margin of safety for liquidity, funding, governance, and earnings volatility. Growth may be higher, but evidence quality and position size must be stricter."
    else:
        size_rule = "Use peer-relative expectations for growth, liquidity, and funding rather than mega-cap or micro-cap assumptions."

    company_name = str(business.get("name") or stock.get("name") or symbol_root or "This company")
    company_specific_bias = _company_specific_bias(symbol_root, text, archetype, company_name, industry)
    seasonality_rule = _seasonality_rule(archetype)
    trim_rule = _trim_rule(archetype)

    return {
        "reasoningMode": "SOFT_BIAS",
        "biasInstruction": "Use this profile as a starting expectation, not a verdict or hard scoring override. Update it with company-specific evidence, direct peers, and the company's own history.",
        "archetype": archetype,
        "label": label,
        "sector": sector,
        "industry": industry,
        "marketCap": market_cap,
        "currency": currency,
        "sizeBucket": size_bucket,
        "primaryMetrics": primary,
        "doNotUseAsPrimary": avoid,
        "valuationRule": valuation,
        "leverageRule": leverage,
        "seasonalityRule": seasonality_rule,
        "trimRule": trim_rule,
        "companySpecificBias": company_specific_bias,
        "sizeRule": size_rule,
        "peerRule": f"Compare with {industry} peers of similar size before declaring a metric strong or weak.",
    }


def _seasonality_rule(archetype: str) -> str:
    if archetype == "HOSPITALITY_RESTAURANT":
        return "Seasonality is an operating-cycle and position-sizing input. Judge a month against the relevant hotel geographies and restaurant mix; do not convert an ordinary low season or a historically weak share-price month into a sell signal."
    if archetype == "CYCLICAL":
        return "Use the economic cycle to normalize earnings and size exposure; calendar seasonality alone is not a thesis or exit signal."
    if archetype in {"CONSUMER_DISCRETIONARY", "TRANSPORTATION", "REAL_ESTATE_DEVELOPER"}:
        return "Separate repeatable operating seasonality from changes in demand, pricing, inventory/utilization, and financing. Use normal seasonality for sizing; sell only when normalized economics or the active Agent's exit evidence deteriorates."
    return "Use calendar seasonality as secondary execution evidence unless the industry profile makes the operating cycle decision-relevant."


def _trim_rule(archetype: str) -> str:
    if archetype == "HOSPITALITY_RESTAURANT":
        return "A strategic trim requires excessive normalized valuation, weakening RevPAR/occupancy or same-store sales, margin deterioration, worsening lease-adjusted leverage/coverage, or a broken cash-flow thesis. Seasonal strength or weakness alone may change new-money sizing but does not justify selling owned shares."
    return "Trim only when the active Agent's controlling valuation, business, income, risk, or technical exit rule is actually triggered; calendar position alone is insufficient."


def _company_specific_bias(symbol_root: str, text: str, archetype: str, company_name: str, industry: str) -> str:
    if symbol_root == "MINT" or "minor international" in text:
        return "Treat MINT as a diversified global hotel-and-restaurant group, not a Thai hotel proxy. Separate hotel geography and ownership model, restaurant same-store/outlet economics, FX translation, and lease/debt burden before updating the industry prior."
    return f"For {company_name}, start from the {industry} / {archetype.lower().replace('_', ' ')} prior, then update it with this company's segment mix, geography, funding model, management execution, direct peers, and own history."


def _size_bucket(market_cap: float | None, currency: str) -> str:
    if market_cap is None:
        return "UNKNOWN"
    if currency == "THB":
        if market_cap >= 1_000_000_000_000:
            return "MEGA_CAP"
        if market_cap >= 100_000_000_000:
            return "LARGE_CAP"
        if market_cap >= 20_000_000_000:
            return "MID_CAP"
        if market_cap >= 5_000_000_000:
            return "SMALL_CAP"
        return "MICRO_CAP"
    if market_cap >= 200_000_000_000:
        return "MEGA_CAP"
    if market_cap >= 10_000_000_000:
        return "LARGE_CAP"
    if market_cap >= 2_000_000_000:
        return "MID_CAP"
    if market_cap >= 300_000_000:
        return "SMALL_CAP"
    return "MICRO_CAP"
