from __future__ import annotations

from internal.market.catalog import get_market_catalog
from models import TickerPreset


def list_market_presets(kind: str | None = None, region: str | None = None) -> list[TickerPreset]:
    if kind and kind != "stock":
        return []
    grouped: dict[str, list[str]] = {"us": [], "th": []}
    for record in get_market_catalog():
        record_region = "th" if "th" in record.get("indexes", []) else "us"
        grouped[record_region].append(str(record["symbol"]))

    labels = {"us": "US Stocks", "th": "Thai Stocks"}
    regions = (region,) if region in grouped else ("us", "th")
    return [
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
    ]
