from __future__ import annotations

from internal.market.catalog import get_market_catalog
from models import TickerPreset


COMMODITY_PRESETS = [
    TickerPreset(
        code="commodity_core",
        kind="commodity",
        region="global",
        label="Core Commodities",
        sortOrder=1,
        symbols=["GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F"],
        source="yfinance-commodity-preset",
    ),
    TickerPreset(
        code="commodity_metals",
        kind="commodity",
        region="global",
        label="Metals",
        sortOrder=2,
        symbols=["GC=F", "SI=F", "HG=F", "PL=F", "PA=F"],
        source="yfinance-commodity-preset",
    ),
    TickerPreset(
        code="commodity_energy",
        kind="commodity",
        region="global",
        label="Energy",
        sortOrder=3,
        symbols=["CL=F", "BZ=F", "NG=F", "RB=F", "HO=F"],
        source="yfinance-commodity-preset",
    ),
    TickerPreset(
        code="commodity_etf_proxy",
        kind="commodity",
        region="us",
        label="Commodity ETF Proxies",
        sortOrder=4,
        symbols=["GLD", "SLV", "USO", "UNG", "DBC", "CPER"],
        source="yfinance-commodity-preset",
    ),
]


def list_market_presets(kind: str | None = None, region: str | None = None) -> list[TickerPreset]:
    normalized_kind = (kind or "").strip().lower() or None
    normalized_region = (region or "").strip().lower() or None
    results: list[TickerPreset] = []

    if normalized_kind in {None, "stock"}:
        grouped: dict[str, list[str]] = {"us": [], "th": []}
        for record in get_market_catalog():
            record_region = "th" if "th" in record.get("indexes", []) else "us"
            grouped[record_region].append(str(record["symbol"]))

        labels = {"us": "US Stocks", "th": "Thai Stocks"}
        regions = (normalized_region,) if normalized_region in grouped else ("us", "th")
        results.extend(
            TickerPreset(
                code=f"stock_{item_region}_all",
                kind="stock",
                region=item_region,
                label=labels[item_region],
                sortOrder=1,
                symbols=grouped[item_region],
                source="yfinance-screen-24h-cache",
            )
            for item_region in regions
            if grouped[item_region]
        )

    if normalized_kind in {None, "commodity", "future"}:
        results.extend(
            preset
            for preset in COMMODITY_PRESETS
            if normalized_region in {None, "all", "global"} or preset.region == normalized_region or preset.region == "global"
        )

    return sorted(results, key=lambda item: (item.sortOrder, item.label))
