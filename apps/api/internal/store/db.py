from __future__ import annotations

import sqlite3
from pathlib import Path

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
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS market_universe_cache (
                region TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        db.execute("DROP TABLE IF EXISTS market_presets")
        db.execute("DROP TABLE IF EXISTS snapshots")
        db.execute("DROP TABLE IF EXISTS stocks")
        db.commit()
