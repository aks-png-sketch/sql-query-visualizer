"""Focused integration tests against the isolated local v1.5 API and PostgreSQL."""

import json
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from sqlalchemy import func, select

from backend.app import QuizAnswer, QuizAttempt, SessionLocal


BASE = "http://127.0.0.1:8001"


def call(method, path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(BASE + path, data=body, method=method,
                      headers={"Content-Type": "application/json"} if body else {})
    try:
        with urlopen(request, timeout=5) as response:
            data = response.read()
            return response.status, json.loads(data) if data else None
    except HTTPError as error:
        return error.code, json.loads(error.read())


class QuizApiTests(unittest.TestCase):
    def test_health_and_private_files(self):
        code, body = call("GET", "/api/health")
        self.assertEqual((code, body["database"]), (200, "postgresql"))
        self.assertEqual(call("GET", "/backend/app.py")[0], 404)
        self.assertEqual(call("GET", "/backend/.pgdata/postgresql.conf")[0], 404)

    def test_saved_attempt_answers_idempotency_and_sql(self):
        now = int(time.time() * 1000)
        attempt_id = f"attempt-api-test-{now}"
        snapshot = {"id": attempt_id, "seed": 7, "ids": ["basics-01"],
                    "answers": {"basics-01": [1]}, "checked": {}, "mode": "practice",
                    "index": 0, "startedAt": now - 2000, "deadline": None,
                    "finished": True, "finishedAt": now}
        payload = {"id": attempt_id, "mode": "practice", "seed": 7,
                   "started_at_ms": now - 2000, "finished_at_ms": now,
                   "score": 1, "total": 1, "correct": 1, "incorrect": 0, "skipped": 0,
                   "question_ids": ["basics-01"],
                   "answers": [{"question_id": "basics-01", "topic": "basics",
                                "answer": [1], "is_correct": True, "skipped": False}],
                   "snapshot": snapshot}
        code, saved = call("POST", "/api/quiz-attempts", payload)
        self.assertEqual((code, saved["id"], saved["score"]), (201, attempt_id, 1))
        self.assertEqual(call("POST", "/api/quiz-attempts", payload)[0], 201)
        self.assertEqual(call("GET", f"/api/quiz-attempts/{attempt_id}")[1]["answers"][0]["answer"], [1])
        self.assertTrue(any(row["id"] == attempt_id for row in call("GET", "/api/quiz-attempts")[1]))
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(QuizAttempt).where(QuizAttempt.id == attempt_id)), 1)
            self.assertEqual(db.scalar(select(func.count()).select_from(QuizAnswer).where(QuizAnswer.attempt_id == attempt_id)), 1)
        changed = dict(payload, snapshot=dict(snapshot, checked={"basics-01": True}))
        self.assertEqual(call("POST", "/api/quiz-attempts", changed)[0], 409)

    def test_validation_and_missing_attempt(self):
        self.assertEqual(call("GET", "/api/quiz-attempts/attempt-does-not-exist")[0], 404)
        self.assertEqual(call("POST", "/api/quiz-attempts", {"score": -1})[0], 422)


if __name__ == "__main__":
    unittest.main()
