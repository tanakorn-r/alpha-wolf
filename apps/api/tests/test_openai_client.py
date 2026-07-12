from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from internal.ai.openai_client import OPENAI_MAX_RETRIES, _SESSION


class OpenAIClientTests(unittest.TestCase):
    def test_session_retries_transient_post_failures(self) -> None:
        retries = _SESSION.get_adapter("https://").max_retries

        self.assertEqual(retries.total, OPENAI_MAX_RETRIES)
        self.assertEqual(retries.connect, OPENAI_MAX_RETRIES)
        self.assertEqual(retries.read, OPENAI_MAX_RETRIES)
        self.assertIn("POST", retries.allowed_methods)
        self.assertEqual(
            set(retries.status_forcelist),
            {408, 429, 500, 502, 503, 504},
        )
        self.assertTrue(retries.respect_retry_after_header)


if __name__ == "__main__":
    unittest.main()
