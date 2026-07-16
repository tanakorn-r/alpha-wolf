from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from internal.store.db import connect


def record_operational_telemetry(events: list[dict[str, Any]]) -> None:
    """Fold a small validated batch directly into daily aggregates.

    No raw event, account/session identifier, IP address, user agent, URL, query,
    ticker, or payload content is retained by this application table.
    """
    if not events:
        return
    day = datetime.now(timezone.utc).date().isoformat()
    with connect() as db:
        for event in events:
            duration = event.get("duration_ms")
            duration_ms = int(duration) if duration is not None else 0
            status = int(event.get("status") or 0)
            db.execute(
                """
                INSERT INTO operational_telemetry_daily(
                    day, event, dimension, outcome, method, status_group,
                    duration_bucket, event_count, total_duration_ms, max_duration_ms
                ) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(day, event, dimension, outcome, method, status_group, duration_bucket)
                DO UPDATE SET
                    event_count = operational_telemetry_daily.event_count + 1,
                    total_duration_ms = operational_telemetry_daily.total_duration_ms + excluded.total_duration_ms,
                    max_duration_ms = CASE
                        WHEN excluded.max_duration_ms > operational_telemetry_daily.max_duration_ms
                        THEN excluded.max_duration_ms
                        ELSE operational_telemetry_daily.max_duration_ms
                    END
                """,
                (
                    day,
                    str(event["name"]),
                    str(event.get("dimension") or ""),
                    str(event.get("outcome") or ""),
                    str(event.get("method") or ""),
                    _status_group(status),
                    _duration_bucket(duration_ms) if duration is not None else "",
                    duration_ms,
                    duration_ms,
                ),
            )
        db.commit()


def list_operational_telemetry(days: int = 30) -> list[dict[str, Any]]:
    cutoff = (date.today() - timedelta(days=max(1, days) - 1)).isoformat()
    with connect() as db:
        rows = db.execute(
            """
            SELECT day, event, dimension, outcome, method, status_group,
                   duration_bucket, event_count, total_duration_ms, max_duration_ms
            FROM operational_telemetry_daily
            WHERE day >= ?
            ORDER BY day DESC, event, dimension, outcome, duration_bucket
            """,
            (cutoff,),
        ).fetchall()
    return [
        {
            "day": row[0],
            "event": row[1],
            "dimension": row[2],
            "outcome": row[3],
            "method": row[4],
            "statusGroup": row[5],
            "durationBucket": row[6],
            "eventCount": int(row[7]),
            "totalDurationMs": int(row[8]),
            "maxDurationMs": int(row[9]),
            "averageDurationMs": round(int(row[8]) / int(row[7])) if int(row[7]) else 0,
        }
        for row in rows
    ]


def _status_group(status: int) -> str:
    if status <= 0:
        return "network" if status == 0 else ""
    return f"{status // 100}xx"


def _duration_bucket(duration_ms: int) -> str:
    if duration_ms < 1_000:
        return "under_1s"
    if duration_ms < 3_000:
        return "1_to_3s"
    if duration_ms < 10_000:
        return "3_to_10s"
    if duration_ms < 30_000:
        return "10_to_30s"
    return "over_30s"
