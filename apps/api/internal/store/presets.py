from __future__ import annotations

import json
import sqlite3
from typing import Any

from internal.store.db import connect, load_snapshot_symbols
from internal.yahoo.seed import TH_SEED_SYMBOLS, US_SEED_SYMBOLS
from models import TickerPreset

PRESET_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_presets (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    region TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    symbols_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'snapshots'
)
"""


def ensure_market_presets() -> None:
    with connect() as db:
        db.execute("DROP TABLE IF EXISTS market_presets")
        db.execute(PRESET_TABLE_SQL)
        for preset in seed_market_presets():
            db.execute(
                """
                INSERT INTO market_presets (code, kind, region, label, sort_order, enabled, symbols_json, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    preset.code,
                    preset.kind,
                    preset.region,
                    preset.label,
                    preset.sortOrder,
                    1 if preset.enabled else 0,
                    json.dumps(preset.symbols),
                    preset.source,
                ),
            )
        db.commit()


def list_market_presets(kind: str | None = None, region: str | None = None) -> list[TickerPreset]:
    query = [
        "SELECT code, kind, region, label, sort_order, enabled, symbols_json, source",
        "FROM market_presets",
        "WHERE enabled = 1",
    ]
    params: list[Any] = []
    if kind:
        query.append("AND kind = ?")
        params.append(kind)
    if region:
        query.append("AND region = ?")
        params.append(region)
    query.append("ORDER BY kind, region, sort_order, label")

    with connect() as db:
        rows = db.execute(" ".join(query), params).fetchall()

    presets: list[TickerPreset] = []
    for row in rows:
        symbols = json.loads(row[6] or "[]")
        presets.append(
            TickerPreset(
                code=str(row[0]),
                kind=str(row[1]),
                region=str(row[2]),
                label=str(row[3]),
                sortOrder=int(row[4] or 0),
                enabled=bool(row[5]),
                symbols=[str(symbol).upper() for symbol in symbols if str(symbol).strip()],
                source=str(row[7] or "snapshots"),
            )
        )
    return presets


def seed_market_presets() -> list[TickerPreset]:
    # Snapshots are the live, accumulated universe; the static seed lists are
    # only a bootstrap so a fresh/wiped database has something to fetch on
    # its very first refresh instead of staying empty forever.
    us_symbols = load_snapshot_symbols(region="us") or list(US_SEED_SYMBOLS)
    th_symbols = load_snapshot_symbols(region="th") or list(TH_SEED_SYMBOLS)

    presets = [
        TickerPreset(
            code="stock_us_all",
            kind="stock",
            region="us",
            label="US Stocks",
            sortOrder=1,
            symbols=us_symbols,
        ),
        TickerPreset(
            code="stock_th_all",
            kind="stock",
            region="th",
            label="Thai Stocks",
            sortOrder=1,
            symbols=th_symbols,
        ),
    ]
    return [preset for preset in presets if preset.symbols]
