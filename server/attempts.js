// attempts.js — one test = one sitting per student. Tracks progress so a test
// cannot be restarted for a fresh timer, and records the best score per question.
const { db } = require('./db');

const row = (r) => r ? { id: r.id, userId: r.user_id, testId: r.test_id, status: r.status,
  answers: JSON.parse(r.answers || '{}'), score: r.score, total: r.total,
  tabSwitches: r.tab_switches || 0, forced: r.forced ? 1 : 0,
  startedAt: r.started_at, submittedAt: r.submitted_at } : null;

const get = (userId, testId) => row(db.prepare('SELECT * FROM test_attempts WHERE user_id=? AND test_id=?').get(userId, testId));

// Create the attempt on first entry; return the existing one otherwise (never restarts).
function start(userId, testId, total) {
  const a = get(userId, testId);
  if (a) return a;
  db.prepare('INSERT INTO test_attempts (user_id,test_id,status,answers,score,total,started_at,submitted_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, testId, 'in_progress', '{}', 0, total, Date.now(), 0);
  return get(userId, testId);
}

// Record a question's best score inside an in-progress attempt.
function recordAnswer(userId, testId, qid, score) {
  const a = get(userId, testId);
  if (!a || a.status === 'done') return a;
  a.answers[qid] = Math.max(a.answers[qid] || 0, Number(score) || 0);
  db.prepare('UPDATE test_attempts SET answers=? WHERE user_id=? AND test_id=?').run(JSON.stringify(a.answers), userId, testId);
  return get(userId, testId);
}

// Close the attempt and compute the overall percentage. If `marks` (a {qid:maxMarks}
// map) is given, questions are weighted by their marks; otherwise every question is
// weighted equally out of 100.
function finish(userId, testId, marks, meta) {
  const a = get(userId, testId);
  if (!a || a.status === 'done') return a;
  meta = meta || {};
  let score;
  if (marks && Object.keys(marks).length) {
    const totalMax = Object.values(marks).reduce((x, y) => x + (Number(y) || 0), 0);
    const earned = Object.entries(a.answers).reduce((s, [qid, pct]) => s + ((Number(pct) || 0) / 100) * (Number(marks[qid]) || 0), 0);
    score = totalMax ? Math.round(earned / totalMax * 100) : 0;
  } else {
    const vals = Object.values(a.answers);
    score = a.total ? Math.round(vals.reduce((x, y) => x + y, 0) / (a.total * 100) * 100) : 0;
  }
  const tabs = Number(meta.tabSwitches); const forced = meta.forced ? 1 : 0;
  db.prepare('UPDATE test_attempts SET status=?, score=?, submitted_at=?, tab_switches=?, forced=? WHERE user_id=? AND test_id=?')
    .run('done', score, Date.now(), Number.isFinite(tabs) ? tabs : (a.tabSwitches || 0), forced, userId, testId);
  return get(userId, testId);
}
// Marks a student earned so far (from best-per-question percentages × per-question marks).
function marksEarned(answers, marks) {
  if (!marks || !Object.keys(marks).length) return null;
  return Math.round(Object.entries(answers || {}).reduce((s, [qid, pct]) => s + ((Number(pct) || 0) / 100) * (Number(marks[qid]) || 0), 0));
}

const listForUser = (userId) => db.prepare('SELECT * FROM test_attempts WHERE user_id=? ORDER BY started_at DESC').all(userId).map(row);
const listForTest = (testId) => db.prepare('SELECT * FROM test_attempts WHERE test_id=? ORDER BY started_at').all(testId).map(row);
// Reset a student's attempt so they can take the test from scratch.
const remove = (userId, testId) => db.prepare('DELETE FROM test_attempts WHERE user_id=? AND test_id=?').run(userId, testId).changes > 0;

module.exports = { get, start, recordAnswer, finish, marksEarned, listForUser, listForTest, remove };
