// groups.js — batches defined by college + branch + year of passing (SQLite).
const { db } = require('./db');
const rowToBatch = (r) => r ? { id: r.id, name: r.name, college: r.college || '',
  branch: r.branch || '', yearOfPassing: r.year_of_passing || '', createdAt: r.created_at } : null;
const list = () => db.prepare('SELECT * FROM batches ORDER BY created_at').all().map(rowToBatch);
const getById = (id) => rowToBatch(db.prepare('SELECT * FROM batches WHERE id=?').get(id));

function composeName({ name, college, branch, yearOfPassing }) {
  if (name && name.trim()) return name.trim();
  return [college, branch, yearOfPassing].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || 'Batch';
}
function create(input) {
  // Backward compatible: accepts a string (name) or an object {college,branch,yearOfPassing,name}.
  if (typeof input === 'string') input = { name: input };
  const college = (input.college || '').trim(), branch = (input.branch || '').trim(), yearOfPassing = (input.yearOfPassing || '').trim();
  const name = composeName(input);
  if (!name) throw new Error('Provide at least a college, branch or year.');
  if (db.prepare('SELECT 1 FROM batches WHERE lower(name)=lower(?)').get(name)) throw new Error('A batch with this name already exists.');
  const b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), name, college, branch, yearOfPassing, created_at: Date.now() };
  db.prepare('INSERT INTO batches (id,name,college,branch,year_of_passing,created_at) VALUES (?,?,?,?,?,?)')
    .run(b.id, b.name, b.college, b.branch, b.yearOfPassing, b.created_at);
  return rowToBatch(db.prepare('SELECT * FROM batches WHERE id=?').get(b.id));
}
const remove = (id) => db.prepare('DELETE FROM batches WHERE id=?').run(id).changes > 0;
module.exports = { list, getById, create, remove };
