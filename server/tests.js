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
  requireCamera: r.require_camera == null ? 1 : r.require_camera,
  createdAt: r.created_at } : null;
// Sum of per-question marks (0 if the test doesn't use question-wise marks).
const marksMax = (t) => Object.values(t.marks || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const list = () => db.prepare('SELECT * FROM tests ORDER BY created_at').all().map(rowToTest);
const getById = (id) => rowToTest(db.prepare('SELECT * FROM tests WHERE id=?').get(id));

// Normalise all editable fields from a create/update payload (falling back to
// `ex` for an update where a field is omitted).
function normalize(input, ex) {
  ex = ex || {};
  const avail = input.availability === 'scheduled' ? 'scheduled' : (input.availability === 'open' ? 'open' : (ex.availability || 'open'));
  const qids = Array.isArray(input.questionIds) ? input.questionIds : (ex.questionIds || []);
  const cleanMarks = {}; const mIn = (input.marks && typeof input.marks === 'object') ? input.marks : (ex.marks || {});
  for (const qid of qids) { const v = Number(mIn[qid]); if (v > 0) cleanMarks[qid] = v; }
  const pick = (v, d) => (v == null ? d : v);
  return {
    title: (input.title != null ? input.title : ex.title || '').trim(),
    description: pick(input.description, ex.description || '').trim(),
    questionIds: qids, batchIds: Array.isArray(input.batchIds) ? input.batchIds : (ex.batchIds || []),
    durationMin: input.durationMin != null ? Math.max(0, parseInt(input.durationMin, 10) || 0) : (ex.durationMin || 0),
    availability: avail, startAt: avail === 'scheduled' ? (Number(input.startAt) || ex.startAt || 0) : 0,
    openHours: input.openHours != null ? Math.max(0, parseInt(input.openHours, 10) || 0) : (ex.openHours || 0),
    showScore: (input.showScore === false || input.showScore === 0) ? 0 : (input.showScore ? 1 : (ex.showScore == null ? 1 : ex.showScore)),
    showAnswers: input.showAnswers != null ? (input.showAnswers ? 1 : 0) : (ex.showAnswers || 0),
    showSolutions: input.showSolutions != null ? (input.showSolutions ? 1 : 0) : (ex.showSolutions || 0),
    marks: cleanMarks,
    requireCamera: (input.requireCamera === false || input.requireCamera === 0) ? 0 : (input.requireCamera != null ? 1 : (ex.requireCamera == null ? 1 : ex.requireCamera)),
  };
}
function create(input) {
  if (!(input.title || '').trim()) throw new Error('Test title is required.');
  const n = normalize(input, {});
  const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...n, createdAt: Date.now() };
  db.prepare(`INSERT INTO tests (id,title,description,question_ids,batch_ids,duration_min,availability,start_at,open_hours,show_score,show_answers,show_solutions,marks,require_camera,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(t.id, t.title, t.description, J(t.questionIds), J(t.batchIds), t.durationMin,
      t.availability, t.startAt, t.openHours, t.showScore, t.showAnswers, t.showSolutions, JSON.stringify(t.marks), t.requireCamera, t.createdAt);
  return t;
}
function update(id, input) {
  const ex = getById(id); if (!ex) return null;
  if (input.title != null && !String(input.title).trim()) throw new Error('Test title cannot be empty.');
  const n = normalize(input, ex);
  db.prepare(`UPDATE tests SET title=?,description=?,question_ids=?,batch_ids=?,duration_min=?,availability=?,start_at=?,open_hours=?,show_score=?,show_answers=?,show_solutions=?,marks=?,require_camera=? WHERE id=?`)
    .run(n.title, n.description, J(n.questionIds), J(n.batchIds), n.durationMin, n.availability, n.startAt, n.openHours,
      n.showScore, n.showAnswers, n.showSolutions, JSON.stringify(n.marks), n.requireCamera, id);
  return getById(id);
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

module.exports = { list, getById, create, update, remove, forBatch, windowStatus, marksMax };
