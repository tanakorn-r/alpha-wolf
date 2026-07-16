from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import Request

from internal.observability import build_exception_log


class ExceptionLoggingTests(unittest.TestCase):
    def test_exception_log_is_trace_correlated_and_contains_diagnostics(self) -> None:
        trace_id = "023b2b8de978f78ae34a7622e538d815"
        request = Request({
            "type": "http",
            "method": "GET",
            "scheme": "https",
            "path": "/api/ai/results/latest",
            "raw_path": b"/api/ai/results/latest",
            "query_string": b"session=must-not-appear",
            "headers": [(b"x-cloud-trace-context", f"{trace_id}/123;o=1".encode())],
            "server": ("alpha-wolf-api.example", 443),
            "client": ("127.0.0.1", 12345),
            "root_path": "",
            "route": SimpleNamespace(path="/api/ai/results/latest"),
        })

        with patch.dict("os.environ", {
            "GOOGLE_CLOUD_PROJECT": "alpha-wolf-501716",
            "K_SERVICE": "alpha-wolf-api",
            "K_REVISION": "alpha-wolf-api-00006-7f6",
        }):
            payload, error_id = build_exception_log(request, ValueError("Hrana: stream not found"))

        self.assertEqual(error_id, trace_id)
        self.assertEqual(payload["severity"], "ERROR")
        self.assertEqual(payload["exceptionType"], "ValueError")
        self.assertIn("Hrana: stream not found", payload["message"])
        self.assertEqual(payload["route"], "/api/ai/results/latest")
        self.assertEqual(
            payload["logging.googleapis.com/trace"],
            f"projects/alpha-wolf-501716/traces/{trace_id}",
        )
        self.assertTrue(payload["logging.googleapis.com/trace_sampled"])
        self.assertNotIn("must-not-appear", json.dumps(payload))

    def test_invalid_trace_header_gets_searchable_generated_error_id(self) -> None:
        request = Request({
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/api/test",
            "raw_path": b"/api/test",
            "query_string": b"",
            "headers": [(b"x-cloud-trace-context", b"invalid")],
            "server": ("example", 443),
            "client": ("127.0.0.1", 1),
            "root_path": "",
        })

        payload, error_id = build_exception_log(request, RuntimeError("boom"))

        self.assertEqual(len(error_id), 32)
        self.assertEqual(payload["errorId"], error_id)
        self.assertNotIn("logging.googleapis.com/trace", payload)


if __name__ == "__main__":
    unittest.main()
