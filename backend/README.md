# SQLFlow v1.5 local PostgreSQL prototype

SQL execution and animation remain in JavaScript. This optional localhost service saves completed quiz and competitive-exam attempts, scores, answers, and history in PostgreSQL. The public GitHub Pages frontend does not connect to this service; public history stays in each visitor's browser.

## Start on Windows PowerShell

From `C:\Users\aksha\Projects\sql-query-visualizer-v15`:

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
initdb -D backend\.pgdata -U sqlflow_local --auth-local=trust --auth-host=trust -E UTF8
pg_ctl -D backend\.pgdata -l backend\postgres.log -o "-p 5545 -h 127.0.0.1" start
createdb -h 127.0.0.1 -p 5545 -U sqlflow_local sqlflow_v15
backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Run `initdb` and `createdb` **only once** for a fresh experimental worktree. On later sessions, start the existing cluster with `pg_ctl` and then start Uvicorn. Open <http://127.0.0.1:8001/>. The API creates missing tables without deleting existing data. Data files live in ignored `backend/.pgdata/`; no database password is stored in the repository. The trusted local authentication and unauthenticated API are suitable **only for a localhost classroom prototype**. Do not expose port 5545 or 8001 to a network or deploy this backend as-is.

## Demonstrate persistence

Complete a quiz in the browser. The results page should say “Saved in PostgreSQL.” In another PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/health
Invoke-RestMethod http://127.0.0.1:8001/api/quiz-attempts
psql -h 127.0.0.1 -p 5545 -U sqlflow_local -d sqlflow_v15 -c 'SELECT id, score, total, correct, incorrect, skipped, finished_at FROM quiz_attempts ORDER BY finished_at DESC LIMIT 5;'
psql -h 127.0.0.1 -p 5545 -U sqlflow_local -d sqlflow_v15 -c 'SELECT a.id, a.score, q.question_id, q.topic, q.answer_value, q.is_correct FROM quiz_attempts a JOIN quiz_answers q ON q.attempt_id = a.id ORDER BY a.finished_at DESC LIMIT 10;'
```

Refresh the browser: history is loaded from PostgreSQL. Restart Uvicorn and repeat the GET or SQL query to show persistence. `GET /api/quiz-attempts/{id}` returns one attempt and its answers. `POST /api/quiz-attempts` saves a completed attempt idempotently; repeated IDs with different content return 409. If the API is unavailable, quizzes continue using localStorage.

## Focused checks

```powershell
backend\.venv\Scripts\python.exe -m unittest backend.test_api -v
$env:SQLFLOW_TEST_URL='http://127.0.0.1:8001/'
node browser-learning-tests.cjs --v15-smoke
```

Known limitations: no login or multi-user separation; scores are calculated in the browser and submitted to the API rather than independently graded server-side; there is no migration framework or deployed hosted PostgreSQL service. Keep this branch local until those concerns are addressed.

## Competitive Exam and optional AI Tutor

Competitive Exam attempts reuse `quiz_attempts` and `quiz_answers` with `snapshot.kind = "competitive"`; the existing schema and quiz history remain unchanged. The 75-question bank is original practice, not a reproduction of historical GATE/PSU papers. Results remain in browser storage when this local API is unavailable.

AI Tutor is **off by default**. To enable it, set `SQLFLOW_AI_URL` to a trusted HTTPS chat-completions endpoint, `SQLFLOW_AI_MODEL` to its model ID, and `SQLFLOW_AI_API_KEY` privately in the backend process environment before starting Uvicorn. Do not put keys in repository files or the browser. No provider request occurs until a student clicks **Ask AI Tutor (optional)**. `GET /api/ai-tutor/status` reports availability without exposing settings; `POST /api/ai-tutor/explain` has input limits, a 12-second provider timeout, and a per-process 20-request/hour cap. AI text is supplementary and never changes verified grading. The local API has no user authentication, so do not expose it beyond `127.0.0.1` or enable a paid provider on an untrusted machine.
