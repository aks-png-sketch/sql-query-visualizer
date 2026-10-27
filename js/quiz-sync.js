(function (global) {
  'use strict';

  function available(location) {
    const current = location || global.location;
    return !!current && (current.hostname === '127.0.0.1' || current.hostname === 'localhost') &&
      (current.port === '8001' || current.port === '8002');
  }

  async function request(path, options) {
    if (!available()) { return null; }
    const controller = new AbortController();
    const timeout = global.setTimeout(function () { controller.abort(); }, 2500);
    try {
      const response = await global.fetch(path, Object.assign({ signal: controller.signal, cache: 'no-store' }, options || {}));
      if (!response.ok) { return null; }
      return await response.json();
    } catch (_) { return null; }
    finally { global.clearTimeout(timeout); }
  }

  function payload(attempt, result) {
    return {
      id: attempt.id, mode: attempt.mode, seed: attempt.seed,
      started_at_ms: attempt.startedAt, finished_at_ms: attempt.finishedAt,
      score: result.correct, total: result.total, correct: result.correct,
      incorrect: result.incorrect, skipped: result.skipped,
      question_ids: attempt.ids,
      answers: result.answers.map(function (item) {
        return {
          question_id: item.id,
          topic: global.SqlFlow.quizEngine.question(item.id).topic,
          answer: Object.prototype.hasOwnProperty.call(attempt.answers, item.id) ? attempt.answers[item.id] : null,
          is_correct: item.evaluation.correct,
          skipped: item.evaluation.skipped
        };
      }),
      snapshot: attempt
    };
  }

  async function save(attempt, result) {
    const response = await request('/api/quiz-attempts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(attempt, result))
    });
    return !!(response && response.id === attempt.id);
  }

  async function load() {
    const rows = await request('/api/quiz-attempts');
    return Array.isArray(rows) ? rows : null;
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.quizSync = { save: save, load: load, payload: payload, available: available };
})(typeof window !== 'undefined' ? window : globalThis);
