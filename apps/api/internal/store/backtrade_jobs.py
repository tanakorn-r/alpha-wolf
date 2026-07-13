from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe


def save_backtrade_job(job: dict[str, Any]) -> None:
    payload = json.dumps(json_safe(job), ensure_ascii=False, separators=(",", ":"))
    updated_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """INSERT INTO backtrade_jobs(id, account_scope, payload, updated_at)
               VALUES(?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
            (job["id"], job["accountScope"], payload, updated_at),
        )
        db.commit()


def load_backtrade_job(job_id: str, account_scope: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT payload FROM backtrade_jobs WHERE id = ? AND account_scope = ?", (job_id, account_scope)).fetchone()
    if not row:
        return None
    payload = row["payload"] if hasattr(row, "keys") else row[0]
    value = json.loads(str(payload))
    return value if isinstance(value, dict) else None
