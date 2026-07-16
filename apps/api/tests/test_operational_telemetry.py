from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from internal.store import db as store_db
from internal.store.telemetry import list_operational_telemetry, record_operational_telemetry
from routes.telemetry import TelemetryBatch, TelemetryEvent, submit_telemetry, telemetry_summary


class OperationalTelemetryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(store_db, "DB_PATH", Path(self.tempdir.name) / "telemetry.sqlite3")
        self.url_patch = patch.object(store_db, "DATABASE_URL", None)
        self.db_patch.start()
        self.url_patch.start()
        store_db.migrate()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.db_patch.stop()
        self.tempdir.cleanup()

    def test_events_are_folded_into_daily_aggregates(self) -> None:
        record_operational_telemetry([
            {"name": "flow_completed", "dimension": "hunt_signals", "outcome": "success", "duration_ms": 1_200},
            {"name": "flow_completed", "dimension": "hunt_signals", "outcome": "success", "duration_ms": 2_400},
        ])

        rows = list_operational_telemetry(1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["eventCount"], 2)
        self.assertEqual(rows[0]["totalDurationMs"], 3_600)
        self.assertEqual(rows[0]["averageDurationMs"], 1_800)
        self.assertEqual(rows[0]["maxDurationMs"], 2_400)
        self.assertEqual(rows[0]["durationBucket"], "1_to_3s")

    def test_unknown_dimensions_are_rejected_before_storage(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryEvent(name="page_view", dimension="portfolio_AAPL_user_42")

    def test_summary_requires_server_only_token(self) -> None:
        with patch.dict("os.environ", {"TELEMETRY_ADMIN_TOKEN": "private-token"}):
            with self.assertRaises(HTTPException) as denied:
                telemetry_summary(days=30, admin_token="wrong-token")
            self.assertEqual(denied.exception.status_code, 403)
            self.assertEqual(telemetry_summary(days=30, admin_token="private-token")["aggregates"], [])

    def test_route_contract_accepts_the_browser_batch_shape(self) -> None:
        payload = TelemetryBatch.model_validate({"events": [{
            "name": "api_request",
            "dimension": "analysis",
            "outcome": "success",
            "method": "post",
            "status": 200,
            "durationMs": 850,
        }]})
        self.assertEqual(submit_telemetry(payload).status_code, 204)
        self.assertEqual(list_operational_telemetry(1)[0]["eventCount"], 1)

if __name__ == "__main__":
    unittest.main()
