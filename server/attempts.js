// attempts.js — one test = one sitting per student. Tracks progress so a test
// cannot be restarted for a fresh timer, and records the best score per question.
const { db } = require('./db');

const row = (r) => r ? { id: r.id, userId: r.user_id, testId: r.test_id, status: r.status,
  answers: JSON.parse(r.answers || '{}'), score: r.score, total: r.total,
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

// Close the attempt and compute the overall percentage (each question max 100).
function finish(userId, testId) {
  const a = get(userId, testId);
  if (!a || a.status === 'done') return a;
  const vals = Object.values(a.answers);
  const score = a.total ? Math.round(vals.reduce((x, y) => x + y, 0) / (a.total * 100) * 100) : 0;
  db.prepare('UPDATE test_attempts SET status=?, score=?, submitted_at=? WHERE user_id=? AND test_id=?')
    .run('done', score, Date.now(), userId, testId);
  return get(userId, testId);
}

const listForUser = (userId) => db.prepare('SELECT * FROM test_attempts WHERE user_id=? ORDER BY started_at DESC').all(userId).map(row);

module.exports = { get, start, recordAnswer, finish, listForUser };
