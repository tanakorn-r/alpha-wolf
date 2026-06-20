from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "alpha_wolf.sqlite3"


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    # WAL lets readers (e.g. preset queries) proceed while a batch write commits,
    # instead of every connection blocking on the same file lock.
    db.execute("PRAGMA journal_mode=WAL")
    return db


def migrate() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                symbol TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                shares REAL NOT NULL,
                average_cost REAL NOT NULL,
                strategy TEXT NOT NULL,
                monthly_dca REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS dca_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                amount REAL NOT NULL,
                scheduled_for TEXT NOT NULL,
                strategy TEXT NOT NULL,
                status TEXT NOT NULL,
                executed_price REAL,
                shares REAL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.commit()


def store_records(records: list[dict[str, Any]]) -> None:
    """Persist many records in one connection/transaction.

    Each record used to be written from inside its own worker thread via a
    fresh sqlite3.connect() call, which meant up to 8 threads fighting over
    the same file lock per refresh cycle. Collecting them and writing once
    avoids that contention entirely.
    """
    if not records:
        return
    rows = [
        (
            record["symbol"],
            json.dumps(record),
            record.get("updatedAt") or datetime.now(timezone.utc).isoformat(),
        )
        for record in records
    ]
    with connect() as db:
        db.executemany(
            """
            INSERT INTO snapshots(symbol, payload, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
              payload = excluded.payload,
              updated_at = excluded.updated_at
            """,
            rows,
        )
        db.commit()


def load_snapshot_symbols(region: str | None = None) -> list[str]:
    query = "SELECT symbol FROM snapshots"
    params: list[str] = []
    if region == "us":
        query += " WHERE symbol NOT LIKE ?"
        params.append("%.BK")
    elif region == "th":
        query += " WHERE symbol LIKE ?"
        params.append("%.BK")
    query += " ORDER BY symbol"

    with connect() as db:
        rows = db.execute(query, params).fetchall()

    symbols = []
    seen: set[str] = set()
    for row in rows:
        symbol = str(row[0] or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        symbols.append(symbol)
    return symbols


def load_snapshot_records(limit: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
    query = [
        "SELECT payload",
        "FROM snapshots",
        "ORDER BY symbol",
    ]
    params: list[Any] = []
    if limit is not None:
        query.append("LIMIT ? OFFSET ?")
        params.extend([max(limit, 0), max(offset, 0)])

    with connect() as db:
        rows = db.execute(" ".join(query), params).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(row[0] or "{}")
        except Exception:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return records


def count_snapshots() -> int:
    with connect() as db:
        row = db.execute("SELECT COUNT(*) FROM snapshots").fetchone()
    return int(row[0] or 0)
