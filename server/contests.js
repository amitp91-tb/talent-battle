// contests.js — timed contests (SQLite).
const { db, J, P } = require('./db');
const row = (r) => r ? { id: r.id, title: r.title, description: r.description,
  startAt: r.start_at, endAt: r.end_at, problemIds: P(r.problem_ids), batchIds: P(r.batch_ids), createdAt: r.created_at } : null;
const list = () => db.prepare('SELECT * FROM contests ORDER BY start_at DESC').all().map(row);
const getById = (id) => row(db.prepare('SELECT * FROM contests WHERE id=?').get(id));
function create({ title, description, startAt, durationMin, problemIds, batchIds }) {
  title = (title || '').trim();
  if (!title) throw new Error('Contest title is required.');
  const start = Number(startAt); if (!start) throw new Error('Start time is required.');
  const end = start + (Number(durationMin) || 60) * 60000;
  const c = { id: 'ct' + Date.now().toString(36), title, description: (description || '').trim(),
    start_at: start, end_at: end, problem_ids: J(problemIds || []), batch_ids: J(batchIds || []), created_at: Date.now() };
  db.prepare('INSERT INTO contests (id,title,description,start_at,end_at,problem_ids,batch_ids,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(c.id, c.title, c.description, c.start_at, c.end_at, c.problem_ids, c.batch_ids, c.created_at);
  return getById(c.id);
}
const remove = (id) => db.prepare('DELETE FROM contests WHERE id=?').run(id).changes > 0;
const forBatch = (batchId) => list().filter((c) => c.batchIds.length === 0 || c.batchIds.includes(batchId));
function status(c, now = Date.now()) { return now < c.startAt ? 'upcoming' : (now <= c.endAt ? 'running' : 'ended'); }
module.exports = { list, getById, create, remove, forBatch, status };
