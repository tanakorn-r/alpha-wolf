from __future__ import annotations

"""Fallback universe used only when the snapshots table has nothing yet.

Presets used to be seeded exclusively from `snapshots`, which is itself
only populated *after* a refresh cycle runs against the universe built from
presets — a fresh or wiped database had no presets, so it never had a
universe, so it never refreshed, so it stayed empty forever. These lists
break that cycle: the very first boot has something real to fetch.
"""

US_SEED_SYMBOLS: tuple[str, ...] = (
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM",
    "V", "UNH", "JNJ", "XOM", "PG", "MA", "HD", "MRK", "ABBV", "COST", "AVGO",
    "PEP", "KO", "CSCO", "ADBE", "CRM", "NFLX", "AMD", "TMO", "WMT", "DIS",
)

TH_SEED_SYMBOLS: tuple[str, ...] = (
    "PTT.BK", "AOT.BK", "CPALL.BK", "SCB.BK", "KBANK.BK", "ADVANC.BK",
    "BBL.BK", "SCC.BK", "CPF.BK", "DELTA.BK",
)
