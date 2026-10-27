"""AI Tutor tests use a mocked provider: no paid/network requests."""
import importlib
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

module = importlib.import_module("backend.app")


class FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return b'{"choices":[{"message":{"content":"Compare 9 with 8; the row survives. Practice WHERE predicates."}}]}'


class TutorTests(unittest.TestCase):
    def setUp(self):
        module._tutor_calls.clear()
        self.payload = module.TutorIn(question="Does score 9 pass score > 8?",
                                      user_answer="No", correct_answer="Yes",
                                      solution="Nine is greater than eight, so WHERE retains the row.",
                                      topic="WHERE")

    def test_unconfigured_never_calls_provider(self):
        with patch.dict(os.environ, {"SQLFLOW_AI_URL": "", "SQLFLOW_AI_API_KEY": "", "SQLFLOW_AI_MODEL": ""}):
            with patch.object(module.urllib.request, "urlopen") as provider:
                self.assertFalse(module.tutor_status()["configured"])
                with self.assertRaises(HTTPException) as error:
                    module.tutor_explain(self.payload)
                self.assertEqual(error.exception.status_code, 503)
                provider.assert_not_called()

    def test_configured_uses_mocked_provider_only(self):
        config = {"SQLFLOW_AI_URL": "https://provider.example/v1/chat/completions",
                  "SQLFLOW_AI_API_KEY": "test-only-placeholder", "SQLFLOW_AI_MODEL": "mock-model"}
        with patch.dict(os.environ, config):
            with patch.object(module.urllib.request, "urlopen", return_value=FakeResponse()) as provider:
                self.assertTrue(module.tutor_status()["configured"])
                response = module.tutor_explain(self.payload)
                self.assertIn("Practice WHERE", response["explanation"])
                self.assertEqual(response["verified_answer"], "Yes")
                self.assertIn("unchanged", response["notice"])
                self.assertEqual(provider.call_args.kwargs["timeout"], 12)

    def test_validation_and_rate_limit(self):
        with self.assertRaises(ValidationError):
            module.TutorIn(question="x", user_answer="No", correct_answer="Yes",
                           solution="too short", topic="WHERE")
        config = {"SQLFLOW_AI_URL": "https://provider.example/v1/chat/completions",
                  "SQLFLOW_AI_API_KEY": "test-only-placeholder", "SQLFLOW_AI_MODEL": "mock-model"}
        with patch.dict(os.environ, config):
            module._tutor_calls.extend([module.time.monotonic()] * 20)
            with patch.object(module.urllib.request, "urlopen") as provider:
                with self.assertRaises(HTTPException) as error:
                    module.tutor_explain(self.payload)
                self.assertEqual(error.exception.status_code, 429)
                provider.assert_not_called()


if __name__ == "__main__":
    unittest.main()
