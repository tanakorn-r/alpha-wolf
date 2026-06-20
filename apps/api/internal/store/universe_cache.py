from __future__ import annotations

import json

from internal.store.db import connect
from models import MarketUniverseCache


def load_market_universe(region: str) -> MarketUniverseCache | None:
    with connect() as db:
        row = db.execute(
            "SELECT region, payload, fetched_at, expires_at FROM market_universe_cache WHERE region = ?",
            (region,),
        ).fetchone()
    if not row:
        return None
    return MarketUniverseCache(
        region=str(row[0]),
        records=json.loads(row[1] or "[]"),
        fetchedAt=str(row[2]),
        expiresAt=str(row[3]),
    )


def save_market_universe(value: MarketUniverseCache) -> None:
    with connect() as db:
        db.execute(
            """INSERT INTO market_universe_cache(region, payload, fetched_at, expires_at)
               VALUES(?, ?, ?, ?)
               ON CONFLICT(region) DO UPDATE SET payload=excluded.payload,
                 fetched_at=excluded.fetched_at, expires_at=excluded.expires_at""",
            (value.region, json.dumps(value.records), value.fetchedAt, value.expiresAt),
        )
        db.commit()
