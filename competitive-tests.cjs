// Dependency-free structural and real SQLFlow-executor oracles for original exam practice.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { console }; context.globalThis = context; vm.createContext(context);
for (const file of ['js/parser.js', 'js/executor.js', 'js/competitive-bank.js', 'js/quiz-sync.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
assert.equal(context.SqlFlow.quizSync.available({ hostname: 'aks-png-sketch.github.io', port: '' }), false);
assert.equal(context.SqlFlow.quizSync.available({ hostname: '127.0.0.1', port: '5545' }), false);
assert.equal(context.SqlFlow.quizSync.available({ hostname: '127.0.0.1', port: '8001' }), true);
const questions = context.SqlFlow.competitiveBank.questions;
assert.equal(questions.length, 75);
assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
assert.equal(new Set(questions.map(q => q.prompt.trim().toLowerCase())).size, questions.length);
const terms = text => new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 2));
for (let i = 0; i < questions.length; i++) for (let j = i + 1; j < questions.length; j++) {
  const a = terms(questions[i].prompt), b = terms(questions[j].prompt);
  const similarity = [...a].filter(word => b.has(word)).length / new Set([...a, ...b]).size;
  assert.ok(similarity <= 0.72, questions[i].id + ' and ' + questions[j].id + ' have near-duplicate stems');
}
for (const q of questions) {
  assert.ok(q.prompt.length > 30 && q.solution.length > 55, q.id + ': complete statement and solution');
  assert.ok(['beginner', 'intermediate', 'advanced'].includes(q.difficulty), q.id);
  assert.ok(['GATE-style practice', 'PSU-style practice', 'Original practice'].includes(q.category), q.id);
  assert.ok(q.reference.startsWith('https://'), q.id + ': credible further-reading URL');
  assert.equal(q.choices.length, 4, q.id);
  assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, q.id);
  assert.equal(new Set(q.choices).size, 4, q.id);
}
assert.deepEqual([40, 20, 15], ['GATE-style practice', 'PSU-style practice', 'Original practice'].map(c => questions.filter(q => q.category === c).length));
for (const topic of context.SqlFlow.competitiveBank.topics) assert.ok(questions.filter(q => q.topic === topic).length >= 7, topic);
function run(sql, tables) {
  const db = { resolveTable(name) { const rows = tables[name.toLowerCase()]; assert.ok(rows, name); const columns = Object.keys(rows[0]); return { name, columns, rows, schema: columns.map(column => ({ name: column, type: typeof rows.find(row => row[column] != null)?.[column] === 'number' ? 'NUMBER' : 'TEXT' })) }; } };
  return context.SqlFlow.executor.executeQuery(sql, db).result;
}
const oracles = [
  ['exam-01-01', 'SELECT id FROM R WHERE score > 8;', { r: [{ id: 1, score: 9 }, { id: 2, score: 7 }, { id: 3, score: null }] }, rows => rows.length === 1 && rows[0].id === 1],
  ['exam-01-02', 'SELECT COUNT(DISTINCT v) FROM R;', { r: [{ v: 2 }, { v: 2 }, { v: 5 }, { v: null }] }, rows => Object.values(rows[0])[0] === 2],
  ['exam-01-03', 'SELECT id FROM R ORDER BY v DESC, id ASC LIMIT 2;', { r: [{ id: 1, v: 4 }, { id: 2, v: 4 }, { id: 3, v: 9 }] }, rows => rows.map(r => r.id).join(',') === '3,1'],
  ['exam-01-04', 'SELECT v FROM R WHERE v NOT IN (2, NULL);', { r: [{ v: 1 }, { v: null }, { v: 3 }] }, rows => rows.length === 0],
  ['exam-01-06', 'SELECT v FROM R WHERE v IS NOT NULL ORDER BY v DESC;', { r: [{ v: 5 }, { v: null }, { v: 8 }] }, rows => rows.map(r => r.v).join(',') === '8,5'],
  ['exam-01-07', 'SELECT DISTINCT a FROM R;', { r: [{ a: 1, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 2 }] }, rows => rows.length === 2],
  ['exam-01-08', 'SELECT SUM(v), COUNT(v), AVG(v) FROM R;', { r: [{ v: 2 }, { v: null }, { v: 8 }] }, rows => Object.values(rows[0]).join(',') === '10,2,5'],
  ['exam-03-01', 'SELECT L.id FROM L INNER JOIN R ON L.id=R.id;', { l: [{ id: 1 }, { id: 2 }], r: [{ id: 2 }, { id: 3 }] }, rows => rows.length === 1],
  ['exam-03-02', 'SELECT L.id FROM L LEFT JOIN R ON L.id=R.id;', { l: [{ id: 1 }, { id: 2 }], r: [{ id: 2 }, { id: 3 }] }, rows => rows.length === 2],
  ['exam-03-03', 'SELECT L.id FROM L INNER JOIN R ON L.id=R.id;', { l: [{ id: null }], r: [{ id: null }] }, rows => rows.length === 0],
  ['exam-03-04', 'SELECT L.id FROM L INNER JOIN R ON L.id=R.id;', { l: [{ id: 1 }, { id: 1 }], r: [{ id: 1 }, { id: 1 }, { id: 1 }] }, rows => rows.length === 6],
  ['exam-04-01', 'SELECT COUNT(*),COUNT(v) FROM R;', { r: [{ v: 4 }, { v: null }, { v: 6 }] }, rows => Object.values(rows[0]).join(',') === '3,2'],
  ['exam-04-02', 'SELECT team FROM R GROUP BY team HAVING SUM(v)>5;', { r: [{ team: 'A', v: 2 }, { team: 'A', v: 4 }, { team: 'B', v: 9 }] }, rows => rows.length === 2],
  ['exam-04-03', 'SELECT team,AVG(v) FROM R GROUP BY team;', { r: [{ team: 'A', v: 2 }, { team: 'A', v: null }, { team: 'B', v: 8 }] }, rows => rows.find(r => r.team === 'A')['AVG(v)'] === 2],
  ['exam-04-04', 'SELECT team FROM R GROUP BY team HAVING COUNT(v)=1;', { r: [{ team: 'A', v: 2 }, { team: 'A', v: 8 }, { team: 'B', v: 6 }, { team: 'B', v: null }] }, rows => rows.length === 1 && rows[0].team === 'B'],
  ['exam-04-06', 'SELECT COUNT(*),SUM(v) FROM R WHERE v>10;', { r: [{ v: 2 }] }, rows => rows.length === 1 && Object.values(rows[0])[0] === 0 && Object.values(rows[0])[1] === null],
  ['exam-04-07', 'SELECT team,COUNT(*) FROM R WHERE v>5 GROUP BY team;', { r: [{ team: 'A', v: 1 }, { team: 'A', v: 9 }, { team: 'B', v: 7 }] }, rows => rows.length === 2 && rows.every(r => r['COUNT(*)'] === 1)],
  ['exam-04-08', 'SELECT SUM(v),COUNT(DISTINCT v) FROM R;', { r: [{ v: 2 }, { v: 2 }, { v: null }, { v: 4 }] }, rows => Object.values(rows[0]).join(',') === '8,2']
];
let passed = 0;
const answerLabels = {
  'exam-01-01': '1 only', 'exam-01-02': '2', 'exam-01-03': '3, 1', 'exam-01-04': 'No rows',
  'exam-01-06': '8, 5', 'exam-01-07': '2', 'exam-01-08': 'Both equal 5',
  'exam-03-01': '1', 'exam-03-02': '2', 'exam-03-03': 'No, equality is UNKNOWN',
  'exam-03-04': '6', 'exam-04-01': '3 and 2', 'exam-04-02': 'A and B',
  'exam-04-03': '2', 'exam-04-04': '1', 'exam-04-06': 'One row containing 0 and NULL',
  'exam-04-07': 'A:1, B:1', 'exam-04-08': '4'
};
for (const [id, sql, fixture, check] of oracles) { const q = questions.find(item => item.id === id); assert.ok(q, id); assert.ok(check(run(sql, fixture)), id + ' executor oracle'); assert.equal(q.choices[q.correct], answerLabels[id], id + ' answer key'); passed++; }
console.log('Competitive bank: ' + questions.length + '/75 structural checks, ' + passed + '/' + oracles.length + ' SQLFlow executor oracles passed.');
