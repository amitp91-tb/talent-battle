// tests.js — named tests / challenges, backed by SQLite (db.js).
const { db, J, P } = require('./db');
const rowToTest = (r) => r ? { id: r.id, title: r.title, description: r.description,
  questionIds: P(r.question_ids), batchIds: P(r.batch_ids),
  durationMin: r.duration_min == null ? 0 : r.duration_min,
  availability: r.availability || 'open',              // 'open' | 'scheduled'
  startAt: r.start_at || 0,                             // scheduled start (ms)
  openHours: r.open_hours == null ? 0 : r.open_hours,   // window length in hours (0 = never closes)
  showScore: r.show_score == null ? 1 : r.show_score,
  showAnswers: r.show_answers == null ? 0 : r.show_answers,
  showSolutions: r.show_solutions == null ? 0 : r.show_solutions,
  marks: (() => { try { return JSON.parse(r.marks || '{}'); } catch (e) { return {}; } })(),
  createdAt: r.created_at } : null;
// Sum of per-question marks (0 if the test doesn't use question-wise marks).
const marksMax = (t) => Object.values(t.marks || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const list = () => db.prepare('SELECT * FROM tests ORDER BY created_at').all().map(rowToTest);
const getById = (id) => rowToTest(db.prepare('SELECT * FROM tests WHERE id=?').get(id));

function create({ title, description, questionIds, batchIds, durationMin, availability, startAt, openHours, showScore, showAnswers, showSolutions, marks }) {
  title = (title || '').trim();
  if (!title) throw new Error('Test title is required.');
  const avail = availability === 'scheduled' ? 'scheduled' : 'open';
  const qids = Array.isArray(questionIds) ? questionIds : [];
  // Keep only positive marks for questions actually in this test.
  const cleanMarks = {}; const mIn = (marks && typeof marks === 'object') ? marks : {};
  for (const qid of qids) { const v = Number(mIn[qid]); if (v > 0) cleanMarks[qid] = v; }
  const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, description: (description || '').trim(),
    questionIds: qids, batchIds: Array.isArray(batchIds) ? batchIds : [],
    durationMin: Math.max(0, parseInt(durationMin, 10) || 0),
    availability: avail, startAt: avail === 'scheduled' ? (Number(startAt) || 0) : 0,
    openHours: Math.max(0, parseInt(openHours, 10) || 0),
    showScore: showScore === false || showScore === 0 ? 0 : 1,
    showAnswers: showAnswers ? 1 : 0, showSolutions: showSolutions ? 1 : 0,
    marks: cleanMarks, createdAt: Date.now() };
  db.prepare(`INSERT INTO tests (id,title,description,question_ids,batch_ids,duration_min,availability,start_at,open_hours,show_score,show_answers,show_solutions,marks,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(t.id, t.title, t.description, J(t.questionIds), J(t.batchIds), t.durationMin,
      t.availability, t.startAt, t.openHours, t.showScore, t.showAnswers, t.showSolutions, JSON.stringify(t.marks), t.createdAt);
  return t;
}
const remove = (id) => db.prepare('DELETE FROM tests WHERE id=?').run(id).changes > 0;
const forBatch = (batchId) => list().filter((t) => t.batchIds.length === 0 || t.batchIds.includes(batchId));

// When can this test be taken?  Returns { state:'upcoming'|'open'|'closed', opensAt, closesAt }.
function windowStatus(t, now = Date.now()) {
  const opensAt = t.availability === 'scheduled' ? (t.startAt || 0) : (t.createdAt || 0);
  const closesAt = t.openHours > 0 ? opensAt + t.openHours * 3600000 : 0;
  let state = 'open';
  if (opensAt && now < opensAt) state = 'upcoming';
  else if (closesAt && now > closesAt) state = 'closed';
  return { state, opensAt, closesAt };
}

module.exports = { list, getById, create, remove, forBatch, windowStatus, marksMax };
