// challenge.js — the "100 Days of Code" set, stored in SQLite so admins can edit
// it. Seeded once from challenge-days.json (the generated content).
const fs = require('fs');
const path = require('path');
const { db, J, P } = require('./db');

// Seed once if empty.
if (db.prepare('SELECT COUNT(*) c FROM challenge').get().c === 0) {
  let seed = [];
  try { seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'challenge-days.json'), 'utf8')); } catch {}
  const ins = db.prepare(`INSERT INTO challenge (id,day,title,difficulty,statement,time_limit_ms,memory_mb,checker,float_tolerance,samples,hidden,reference)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const d of seed) ins.run(d.id, d.day, d.title, d.difficulty, d.statement, d.timeLimitMs || 4000,
    d.memoryMb || 256, d.checker || 'token', d.floatTolerance ?? null, J(d.samples || []), J(d.hidden || []), d.reference || '');
}

function rowToQ(r) {
  if (!r) return null;
  return { id: r.id, day: r.day, title: r.title, difficulty: r.difficulty, statement: r.statement,
    timeLimitMs: r.time_limit_ms, memoryMb: r.memory_mb, checker: r.checker,
    floatTolerance: r.float_tolerance == null ? undefined : r.float_tolerance,
    samples: P(r.samples), hidden: P(r.hidden), reference: r.reference,
    tags: ['100 Days', 'Day ' + r.day], topic: '100 Days of Code' };
}
const getById = (id) => rowToQ(db.prepare('SELECT * FROM challenge WHERE id=?').get(id));
const list = () => db.prepare('SELECT id,day,title,difficulty FROM challenge ORDER BY day').all();
function getPublic(id) {
  const q = getById(id); if (!q) return null;
  return { meta: { id: q.id, title: q.title, difficulty: q.difficulty, tags: q.tags, topic: q.topic,
    timeLimitMs: q.timeLimitMs, memoryMb: q.memoryMb }, statement: q.statement,
    samples: (q.samples || []).map((s) => ({ input: s.input, expected: s.expected })) };
}
// admin
const listAdmin = () => db.prepare('SELECT * FROM challenge ORDER BY day').all().map((r) => {
  const q = rowToQ(r); return { id: q.id, day: q.day, title: q.title, difficulty: q.difficulty,
    sampleCount: q.samples.length, hiddenCount: q.hidden.length }; });
const getAdmin = (id) => getById(id);
function update(id, input) {
  const q = getById(id); if (!q) return null;
  const clean = (arr) => Array.isArray(arr) ? arr.map((c) => ({ input: String(c.input ?? ''), expected: String(c.expected ?? '') }))
    .filter((c) => c.input !== '' || c.expected !== '') : q.samples;
  const title = input.title != null ? String(input.title) : q.title;
  const difficulty = ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : q.difficulty;
  const statement = input.statement != null ? String(input.statement) : q.statement;
  const checker = ['token', 'exact', 'float'].includes(input.checker) ? input.checker : q.checker;
  const reference = input.reference != null ? String(input.reference) : q.reference;
  const samples = input.samples != null ? clean(input.samples) : q.samples;
  const hidden = input.hidden != null ? clean(input.hidden) : q.hidden;
  db.prepare(`UPDATE challenge SET title=?,difficulty=?,statement=?,checker=?,reference=?,samples=?,hidden=? WHERE id=?`)
    .run(title, difficulty, statement, checker, reference, J(samples), J(hidden), id);
  return getById(id);
}
module.exports = { list, getById, getPublic, listAdmin, getAdmin, update, all: () => db.prepare('SELECT * FROM challenge ORDER BY day').all().map(rowToQ) };
