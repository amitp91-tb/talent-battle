// tests.js — named tests / challenges, backed by SQLite (db.js).
const { db, J, P } = require('./db');
const rowToTest = (r) => r ? { id: r.id, title: r.title, description: r.description,
  questionIds: P(r.question_ids), batchIds: P(r.batch_ids), createdAt: r.created_at } : null;
const list = () => db.prepare('SELECT * FROM tests ORDER BY created_at').all().map(rowToTest);
const getById = (id) => rowToTest(db.prepare('SELECT * FROM tests WHERE id=?').get(id));
function create({ title, description, questionIds, batchIds }) {
  title = (title || '').trim();
  if (!title) throw new Error('Test title is required.');
  const t = { id: 't' + Date.now().toString(36), title, description: (description || '').trim(),
    questionIds: Array.isArray(questionIds) ? questionIds : [], batchIds: Array.isArray(batchIds) ? batchIds : [], createdAt: Date.now() };
  db.prepare('INSERT INTO tests (id,title,description,question_ids,batch_ids,created_at) VALUES (?,?,?,?,?,?)')
    .run(t.id, t.title, t.description, J(t.questionIds), J(t.batchIds), t.createdAt);
  return t;
}
const remove = (id) => db.prepare('DELETE FROM tests WHERE id=?').run(id).changes > 0;
const forBatch = (batchId) => list().filter((t) => t.batchIds.length === 0 || t.batchIds.includes(batchId));
module.exports = { list, getById, create, remove, forBatch };
