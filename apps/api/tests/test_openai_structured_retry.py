from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai import openai_client


class _Result(BaseModel):
    value: str


class _Response:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class OpenAiStructuredRetryTests(unittest.TestCase):
    def test_retries_once_when_first_http_response_has_no_structured_output(self) -> None:
        responses = [
            _Response({"status": "incomplete", "output": []}),
            _Response({"output_text": '{"value":"ok"}'}),
        ]
        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}),
            patch.object(openai_client._SESSION, "post", side_effect=responses) as post,
        ):
            result = openai_client._run_openai_structured_request(
                context={"symbol": "TEST"},
                schema_model=_Result,
                schema_name="test_result",
                instructions="Return the result.",
                max_output_tokens=100,
            )

        self.assertEqual(result.value, "ok")
        self.assertEqual(post.call_count, 2)
        retry_payload = post.call_args_list[1].kwargs["json"]
        self.assertGreaterEqual(retry_payload["max_output_tokens"], 2000)
        self.assertIn("complete JSON object", retry_payload["instructions"])


if __name__ == "__main__":
    unittest.main()
