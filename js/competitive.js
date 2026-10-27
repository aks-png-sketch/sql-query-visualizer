(function (global) {
  'use strict';
  const bank = global.SqlFlow.competitiveBank;
  const key = 'sqlflow.competitive.v1';
  let state = { attempt: null, history: [] };
  let filters = { topic: 'all', difficulty: 'all', category: 'all', search: '' };
  let view = 'browse';
  const byId = new Map(bank.questions.map(function (q) { return [q.id, q]; }));
  function host() { return global.document.getElementById('competitiveSection'); }
  function el(parent, tag, value, className) { const n = global.document.createElement(tag); if (value != null) n.textContent = value; if (className) n.className = className; parent.appendChild(n); return n; }
  function btn(parent, label, action) { const b = el(parent, 'button', label); b.type = 'button'; b.addEventListener('click', action); return b; }
  function store() { try { global.localStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* Continue in memory. */ } }
  function restore() {
    try {
      const saved = JSON.parse(global.localStorage.getItem(key) || '{}');
      if (Array.isArray(saved.history)) state.history = saved.history.filter(validAttempt).slice(-20);
      if (validAttempt(saved.attempt) && !saved.attempt.finished) state.attempt = saved.attempt;
    } catch (_) { state = { attempt: null, history: [] }; }
  }
  function validAttempt(a) { return !!(a && /^attempt-exam-[\w-]+$/.test(a.id) && Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 75 && new Set(a.ids).size === a.ids.length && a.ids.every(function (id) { return byId.has(id); }) && a.answers && typeof a.answers === 'object' && Number.isFinite(a.startedAt)); }
  function filtered() { return bank.questions.filter(function (q) { return (filters.topic === 'all' || q.topic === filters.topic) && (filters.difficulty === 'all' || q.difficulty === filters.difficulty) && (filters.category === 'all' || q.category === filters.category) && (q.prompt + ' ' + q.solution + ' ' + q.topic).toLowerCase().includes(filters.search.toLowerCase()); }); }
  function selector(parent, label, values, current, changed) { const wrap = el(parent, 'label', label); const select = el(wrap, 'select'); values.forEach(function (value) { const option = el(select, 'option', value); option.value = value; select.value = current; }); select.addEventListener('change', function () { changed(select.value); }); return select; }
  function menu(parent) { const bar = el(parent, 'div', null, 'simulation-controls'); btn(bar, 'Browse Questions', function () { view = 'browse'; render(); }); btn(bar, 'Practice / Test', function () { view = state.attempt && !state.attempt.finished ? 'attempt' : 'setup'; render(); }); btn(bar, 'Results History', function () { view = 'history'; render(); }); }
  function questionCard(parent, q, options) {
    const card = el(parent, 'article', null, 'competitive-card');
    el(card, 'p', q.id + ' · ' + q.topic + ' · ' + q.difficulty + ' · ' + q.category, 'competitive-meta');
    el(card, 'h4', q.prompt);
    if (!options || !options.hideReveal) q.choices.forEach(function (choice, index) { el(card, 'p', String.fromCharCode(65 + index) + '. ' + choice, 'competitive-choice'); });
    if (options && options.showSolution) { el(card, 'p', 'Correct answer: ' + String.fromCharCode(65 + q.correct) + '. ' + q.choices[q.correct], 'competitive-answer'); el(card, 'p', q.solution); }
    else if (!options || !options.hideReveal) { const reveal = btn(card, 'Show Answer and Solution', function () { reveal.remove(); el(card, 'p', 'Correct answer: ' + String.fromCharCode(65 + q.correct) + '. ' + q.choices[q.correct], 'competitive-answer'); el(card, 'p', q.solution); }); reveal.setAttribute('aria-expanded', 'false'); }
    if (!options || !options.hideReveal) { const link = el(card, 'a', 'Further reading'); link.href = q.reference; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    return card;
  }
  function browse(root) {
    el(root, 'h3', 'Competitive Examination Practice');
    el(root, 'p', bank.questions.length + ' original, fully solved questions. GATE-style and PSU-style labels describe practice format, not historical exam provenance.');
    const panel = el(root, 'div', null, 'competitive-filters');
    selector(panel, 'Topic', ['all'].concat(bank.topics), filters.topic, function (v) { filters.topic = v; render(); });
    selector(panel, 'Difficulty', ['all', 'beginner', 'intermediate', 'advanced'], filters.difficulty, function (v) { filters.difficulty = v; render(); });
    selector(panel, 'Exam category', ['all', 'GATE-style practice', 'PSU-style practice', 'Original practice'], filters.category, function (v) { filters.category = v; render(); });
    const searchLabel = el(panel, 'label', 'Search questions'); const search = el(searchLabel, 'input'); search.type = 'search'; search.value = filters.search; search.placeholder = 'SQL, keys, serializability…'; search.addEventListener('input', function () { filters.search = search.value; updateList(); });
    const count = el(root, 'p', '', 'competitive-count'); const list = el(root, 'div', null, 'competitive-list');
    function updateList() { const rows = filtered(); count.textContent = rows.length + ' matching questions'; list.replaceChildren(); if (!rows.length) el(list, 'p', 'No questions match these filters.'); rows.forEach(function (q) { questionCard(list, q); }); }
    updateList();
  }
  function setup(root) {
    el(root, 'h3', 'Start an exam practice attempt');
    el(root, 'p', 'The topic, difficulty, category, and search filters from Browse Questions select the pool. Practice reveals feedback after each answer; Test waits until submission. One point per correct answer; unanswered items score zero.');
    const pool = filtered(); el(root, 'p', pool.length + ' questions match your current filters.');
    const controls = el(root, 'div', null, 'competitive-filters');
    const mode = selector(controls, 'Mode', ['practice', 'test'], 'practice', function () {});
    const count = selector(controls, 'Question count', ['5', '10', '20', '75'], '10', function () {});
    const start = btn(root, 'Start Attempt', function () {
      if (!pool.length) return;
      const ids = pool.slice(0, Math.min(Number(count.value), pool.length)).map(function (q) { return q.id; });
      state.attempt = { id: 'attempt-exam-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10), kind: 'competitive', ids: ids, answers: {}, checked: {}, index: 0, mode: mode.value, startedAt: Date.now(), finished: false };
      store(); view = 'attempt'; render();
    }); start.disabled = !pool.length;
    if (!pool.length) el(root, 'p', 'Broaden your Browse Questions filters to start.');
  }
  function attempt(root) {
    const a = state.attempt; if (!validAttempt(a)) { view = 'setup'; render(); return; }
    const q = byId.get(a.ids[a.index]); el(root, 'h3', a.mode === 'test' ? 'Test Attempt' : 'Practice Attempt');
    el(root, 'p', 'Question ' + (a.index + 1) + ' of ' + a.ids.length + ' · ' + Object.keys(a.answers).length + ' answered');
    const progress = el(root, 'progress'); progress.max = a.ids.length; progress.value = Object.keys(a.answers).length;
    const card = questionCard(root, q, { hideReveal: true });
    const field = el(card, 'fieldset'); el(field, 'legend', 'Choose one answer');
    q.choices.forEach(function (choice, index) { const label = el(field, 'label', null, 'competitive-option'); const input = el(label, 'input'); input.type = 'radio'; input.name = 'competitiveAnswer'; input.value = String(index); input.checked = a.answers[q.id] === index; input.addEventListener('change', function () { a.answers[q.id] = index; delete a.checked[q.id]; store(); render(); }); el(label, 'span', choice); });
    if (a.mode === 'practice') { btn(card, 'Check Answer', function () { if (a.answers[q.id] == null) return; a.checked[q.id] = true; store(); render(); }).disabled = a.answers[q.id] == null; if (a.checked[q.id]) { el(card, 'p', a.answers[q.id] === q.correct ? 'Correct.' : 'Incorrect. Correct answer: ' + q.choices[q.correct], a.answers[q.id] === q.correct ? 'competitive-correct' : 'competitive-incorrect'); el(card, 'p', q.solution); aiButton(card, q, a.answers[q.id]); } }
    const nav = el(root, 'div', null, 'simulation-controls'); btn(nav, 'Previous', function () { a.index--; store(); render(); }).disabled = a.index === 0; btn(nav, 'Next', function () { a.index++; store(); render(); }).disabled = a.index === a.ids.length - 1;
    btn(nav, 'Submit Attempt', function () { const skipped = a.ids.filter(function (id) { return a.answers[id] == null; }).length; if (!global.confirm('Submit? ' + skipped + ' unanswered question(s) will score zero.')) return; a.finished = true; a.finishedAt = Date.now(); state.history = state.history.filter(function (old) { return old.id !== a.id; }).concat(a).slice(-20); state.attempt = null; store(); saveRemote(a); view = 'results'; resultAttempt = a; render(); });
    btn(nav, 'Save and Return', function () { view = 'browse'; store(); render(); });
    const jump = el(root, 'nav', null, 'quiz-question-nav'); jump.setAttribute('aria-label', 'Question navigator'); a.ids.forEach(function (id, index) { const b = btn(jump, String(index + 1) + (a.answers[id] == null ? '' : ' ✓'), function () { a.index = index; store(); render(); }); b.setAttribute('aria-current', String(index === a.index)); });
  }
  let resultAttempt = null;
  function score(a) { const correct = a.ids.filter(function (id) { return a.answers[id] === byId.get(id).correct; }).length; const skipped = a.ids.filter(function (id) { return a.answers[id] == null; }).length; return { correct: correct, skipped: skipped, incorrect: a.ids.length - correct - skipped }; }
  function results(root) {
    const a = resultAttempt; if (!validAttempt(a) || !a.finished) { view = 'history'; render(); return; }
    const s = score(a); el(root, 'h3', 'Exam Practice Result'); el(root, 'p', Math.round(100 * s.correct / a.ids.length) + '% · ' + s.correct + ' correct · ' + s.incorrect + ' incorrect · ' + s.skipped + ' skipped');
    el(root, 'p', 'Duration: ' + Math.round((a.finishedAt - a.startedAt) / 1000) + ' seconds. Verified grading is deterministic; AI explanations, if configured, never change this score.');
    const remote = el(root, 'p', global.SqlFlow.quizSync && global.SqlFlow.quizSync.available() ? (a.remoteStatus || 'Result saved locally.') : 'Saved in this browser only.', 'competitive-remote'); remote.id = 'competitiveRemoteStatus';
    btn(root, 'Review Answers', function () { view = 'review'; render(); }); btn(root, 'Results History', function () { view = 'history'; render(); });
  }
  function review(root) { const a = resultAttempt; if (!validAttempt(a) || !a.finished) { view = 'history'; render(); return; } el(root, 'h3', 'Answer Review'); a.ids.forEach(function (id) { const q = byId.get(id), answer = a.answers[id], card = questionCard(root, q, { showSolution: true }); el(card, 'p', answer == null ? 'Your answer: skipped' : 'Your answer: ' + String.fromCharCode(65 + answer) + '. ' + q.choices[answer], answer === q.correct ? 'competitive-correct' : 'competitive-incorrect'); if (answer !== q.correct) aiButton(card, q, answer); }); btn(root, 'Back to Results', function () { view = 'results'; render(); }); }
  function history(root) { el(root, 'h3', 'Competitive Exam History'); if (!state.history.length) el(root, 'p', 'No completed exam attempts yet.'); state.history.slice().reverse().forEach(function (a) { const s = score(a); btn(root, new Date(a.finishedAt).toLocaleString() + ' · ' + s.correct + '/' + a.ids.length, function () { resultAttempt = a; view = 'results'; render(); }); }); if (state.attempt) btn(root, 'Resume Unfinished Attempt', function () { view = 'attempt'; render(); }); }
  function aiButton(parent, q, answer) { if (global.SqlFlow.aiTutor) global.SqlFlow.aiTutor.button(parent, { question: q.prompt, user_answer: answer == null ? 'Skipped' : q.choices[answer], correct_answer: q.choices[q.correct], solution: q.solution, topic: q.topic }); }
  async function saveRemote(a) {
    if (!global.SqlFlow.quizSync || !global.SqlFlow.quizSync.available()) return;
    const s = score(a), payload = { id: a.id, mode: a.mode, seed: 0, started_at_ms: a.startedAt, finished_at_ms: a.finishedAt, score: s.correct, total: a.ids.length, correct: s.correct, incorrect: s.incorrect, skipped: s.skipped, question_ids: a.ids, answers: a.ids.map(function (id) { const q = byId.get(id); return { question_id: id, topic: q.topic, answer: a.answers[id] == null ? null : a.answers[id], is_correct: a.answers[id] === q.correct, skipped: a.answers[id] == null }; }), snapshot: a };
    const controller = new AbortController(), timeout = global.setTimeout(function () { controller.abort(); }, 3500);
    try { const response = await global.fetch('/api/quiz-attempts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }); a.remoteStatus = response.ok ? 'Saved in PostgreSQL.' : 'Database unavailable; result remains saved locally.'; }
    catch (_) { a.remoteStatus = 'Database unavailable; result remains saved locally.'; }
    finally { global.clearTimeout(timeout); store(); const label = global.document.getElementById('competitiveRemoteStatus'); if (label && resultAttempt === a) label.textContent = a.remoteStatus; }
  }
  async function loadRemote() { if (!global.SqlFlow.quizSync || !global.SqlFlow.quizSync.available()) return; const rows = await global.SqlFlow.quizSync.load(); if (!rows) return; const map = new Map(state.history.map(function (a) { return [a.id, a]; })); rows.forEach(function (row) { const a = row.attempt; if (a && a.kind === 'competitive' && a.finished && validAttempt(a)) map.set(a.id, a); }); state.history = Array.from(map.values()).sort(function (a, b) { return a.finishedAt - b.finishedAt; }).slice(-20); store(); if (view === 'history') render(); }
  function render() { const root = host(); if (!root) return; root.replaceChildren(); menu(root); if (view === 'browse') browse(root); else if (view === 'setup') setup(root); else if (view === 'attempt') attempt(root); else if (view === 'results') results(root); else if (view === 'review') review(root); else history(root); }
  function open() { global.SqlFlow.academic.open('competitive'); render(); loadRemote(); }
  restore();
  global.SqlFlow.competitive = { open: open, render: render, filtered: filtered, score: score, getState: function () { return state; } };
})(typeof window !== 'undefined' ? window : globalThis);
