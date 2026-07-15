from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect
from internal.store.utils import json_safe


def save_backtrade_job(job: dict[str, Any]) -> None:
    payload = json.dumps(json_safe(job), ensure_ascii=False, separators=(",", ":"))
    updated_at = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.execute(
            """INSERT INTO backtrade_jobs(id, account_scope, status, payload, updated_at)
               VALUES(?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET status=excluded.status, payload=excluded.payload, updated_at=excluded.updated_at""",
            (job["id"], job["accountScope"], str(job.get("status") or "queued"), payload, updated_at),
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


def account_has_active_backtrade(account_scope: str) -> bool:
    with connect() as db:
        row = db.execute(
            "SELECT id FROM backtrade_jobs WHERE account_scope = ? AND status IN ('queued','running') LIMIT 1",
            (account_scope,),
        ).fetchone()
    return bool(row)


def claim_backtrade_job(worker_id: str, lease_seconds: int = 120) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(seconds=max(30, lease_seconds))).isoformat()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """SELECT id, account_scope, payload FROM backtrade_jobs
               WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < ?)
               ORDER BY updated_at ASC LIMIT 1""",
            (now.isoformat(),),
        ).fetchone()
        if not row:
            db.commit()
            return None
        job_id = str(row["id"] if hasattr(row, "keys") else row[0])
        cursor = db.execute(
            """UPDATE backtrade_jobs SET status='running', lease_owner=?, lease_expires_at=?,
               attempts=attempts+1, updated_at=? WHERE id=? AND
               (status='queued' OR (status='running' AND lease_expires_at < ?))""",
            (worker_id, expires, now.isoformat(), job_id, now.isoformat()),
        )
        db.commit()
        if cursor.rowcount == 0:
            return None
        payload_text = row["payload"] if hasattr(row, "keys") else row[2]
        value = json.loads(str(payload_text))
        if not isinstance(value, dict):
            return None
        value["status"] = "running"
        value["accountScope"] = str(row["account_scope"] if hasattr(row, "keys") else row[1])
        return value


def renew_backtrade_lease(job_id: str, worker_id: str, lease_seconds: int = 120) -> None:
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute(
            "UPDATE backtrade_jobs SET lease_expires_at=?, updated_at=? WHERE id=? AND lease_owner=? AND status='running'",
            ((now + timedelta(seconds=lease_seconds)).isoformat(), now.isoformat(), job_id, worker_id),
        )
        db.commit()


def release_backtrade_lease(job_id: str) -> None:
    with connect() as db:
        db.execute("UPDATE backtrade_jobs SET lease_owner=NULL, lease_expires_at=NULL WHERE id=?", (job_id,))
        db.commit()
