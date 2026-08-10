// groups.js — batches defined by college + branch + year of passing (SQLite).
const { db } = require('./db');

// Which modules a batch's students can see. Default: everything on (backward compatible).
const FEATURE_KEYS = ['tests', 'challenge', 'contests', 'problems', 'leaderboard'];
const DEFAULT_FEATURES = { tests: true, challenge: true, contests: true, problems: true, leaderboard: true };
function parseFeatures(s) { let f = {}; try { f = JSON.parse(s || '{}'); } catch (e) {} return { ...DEFAULT_FEATURES, ...f }; }
function cleanFeatures(f) { const out = {}; f = f || {}; for (const k of FEATURE_KEYS) out[k] = f[k] !== false; return out; }

const rowToBatch = (r) => r ? { id: r.id, name: r.name, college: r.college || '',
  branch: r.branch || '', yearOfPassing: r.year_of_passing || '',
  features: parseFeatures(r.features), createdAt: r.created_at } : null;
const list = () => db.prepare('SELECT * FROM batches ORDER BY created_at').all().map(rowToBatch);
const getById = (id) => rowToBatch(db.prepare('SELECT * FROM batches WHERE id=?').get(id));
// Features for a student's batch. No batch (or unknown) → all modules on.
const featuresFor = (batchId) => { const b = batchId ? getById(batchId) : null; return b ? b.features : { ...DEFAULT_FEATURES }; };
function setFeatures(id, features) {
  const r = db.prepare('UPDATE batches SET features=? WHERE id=?').run(JSON.stringify(cleanFeatures(features)), id);
  return r.changes > 0;
}

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
module.exports = { list, getById, create, remove, featuresFor, setFeatures, FEATURE_KEYS, DEFAULT_FEATURES };
