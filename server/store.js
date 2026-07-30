// store.js — coding questions, backed by SQLite (db.js). Seeded on first run
// from the example problems/ folder so there is starter content.
const fs = require('fs');
const path = require('path');
const { db, J, P } = require('./db');
const { loadProblem, listProblems } = require('../judge/loader');
const P2 = (x) => { try { return JSON.parse(x || '{}'); } catch { return {}; } };

function rowToQ(r) {
  if (!r) return null;
  return { id: r.id, title: r.title, difficulty: r.difficulty, tags: P(r.tags), topic: r.topic,
    statement: r.statement, timeLimitMs: r.time_limit_ms, memoryMb: r.memory_mb, checker: r.checker,
    floatTolerance: r.float_tolerance == null ? undefined : r.float_tolerance, points: r.points,
    samples: P(r.samples), hidden: P(r.hidden), reference: r.reference,
    timeComplexity: r.time_complexity || '', spaceComplexity: r.space_complexity || '',
    solutions: P2(r.solutions), mode: r.mode || 'stdio', harness: P2(r.harness), createdBy: r.created_by, createdAt: r.created_at };
}
function insert(q) {
  db.prepare(`INSERT INTO questions (id,title,difficulty,tags,topic,statement,time_limit_ms,memory_mb,
    checker,float_tolerance,points,samples,hidden,reference,time_complexity,space_complexity,solutions,mode,harness,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(q.id, q.title, q.difficulty, J(q.tags), q.topic,
    q.statement, q.timeLimitMs, q.memoryMb, q.checker, q.floatTolerance ?? null, q.points,
    J(q.samples), J(q.hidden), q.reference || '', q.timeComplexity || '', q.spaceComplexity || '',
    JSON.stringify(q.solutions || {}), q.mode || 'stdio', JSON.stringify(q.harness || {}), q.createdBy || null, q.createdAt);
}

// Seed once if the table is empty.
if (db.prepare('SELECT COUNT(*) c FROM questions').get().c === 0) {
  for (const dir of listProblems(path.join(__dirname, '..', 'problems'))) {
    const p = loadProblem(dir);
    let ref = ''; try { ref = fs.readFileSync(path.join(dir, 'solutions', 'reference.py'), 'utf8'); } catch {}
    insert({ id: p.meta.id, title: p.meta.title, difficulty: p.meta.difficulty, tags: p.meta.tags || [],
      topic: p.meta.topic || '', statement: p.statement, timeLimitMs: p.meta.timeLimitMs || 2000,
      memoryMb: p.meta.memoryMb || 256, checker: p.meta.checker || 'token', floatTolerance: p.meta.floatTolerance,
      points: p.meta.points || 100, samples: p.testCases.filter((t) => !t.hidden).map((t) => ({ input: t.input, expected: t.expected })),
      hidden: p.testCases.filter((t) => t.hidden).map((t) => ({ input: t.input, expected: t.expected })),
      reference: ref, createdBy: null, createdAt: Date.now() });
  }
}

const listPublic = () => db.prepare('SELECT id,title,difficulty,tags,topic FROM questions').all()
  .map((r) => ({ id: r.id, title: r.title, difficulty: r.difficulty, tags: P(r.tags), topic: r.topic }));
const getById = (id) => rowToQ(db.prepare('SELECT * FROM questions WHERE id=?').get(id));
function getPublic(id) {
  const q = getById(id); if (!q) return null;
  const out = { meta: { id: q.id, title: q.title, difficulty: q.difficulty, tags: q.tags, topic: q.topic,
    timeLimitMs: q.timeLimitMs, memoryMb: q.memoryMb, mode: q.mode || 'stdio' }, statement: q.statement,
    samples: (q.samples || []).map((s) => ({ input: s.input, expected: s.expected })) };
  if (q.mode === 'function' && q.harness) {
    out.functionLangs = Object.keys(q.harness).filter((k) => q.harness[k] && q.harness[k].driver);
    out.starters = {}; for (const k of out.functionLangs) out.starters[k] = q.harness[k].starter || '';
  }
  return out;
}
const toTestCases = (q) => [
  ...(q.samples || []).map((s) => ({ input: s.input, expected: s.expected, hidden: false })),
  ...(q.hidden || []).map((s) => ({ input: s.input, expected: s.expected, hidden: true })),
];
const listAdmin = () => db.prepare('SELECT * FROM questions').all().map((r) => {
  const q = rowToQ(r); return { id: q.id, title: q.title, difficulty: q.difficulty, tags: q.tags,
    topic: q.topic, sampleCount: (q.samples || []).length, hiddenCount: (q.hidden || []).length };
});
function cleanCases(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => ({ input: String(c.input ?? ''), expected: String(c.expected ?? '') }))
            .filter((c) => c.input !== '' || c.expected !== '');
}
function createQuestion(input, createdBy) {
  const q = { id: 'Q' + Date.now().toString(36) + Math.random().toString(36).slice(2,6), title: (input.title || 'Untitled').trim(),
    difficulty: input.difficulty || 'easy',
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
    topic: input.topic || '', statement: input.statement || '',
    timeLimitMs: Number(input.timeLimitMs) || 2000, memoryMb: Number(input.memoryMb) || 256,
    checker: ['token', 'exact', 'float'].includes(input.checker) ? input.checker : 'token',
    floatTolerance: input.floatTolerance ? Number(input.floatTolerance) : undefined,
    points: Number(input.points) || 100, samples: cleanCases(input.samples), hidden: cleanCases(input.hidden),
    reference: input.reference || '', createdBy: createdBy || null, createdAt: Date.now(),
    timeComplexity: input.timeComplexity || '', spaceComplexity: input.spaceComplexity || '',
    solutions: (input.solutions && typeof input.solutions === 'object') ? input.solutions
      : (input.reference ? { python: input.reference } : {}),
    mode: input.mode === 'function' ? 'function' : 'stdio',
    harness: (input.harness && typeof input.harness === 'object') ? input.harness : {} };
  insert(q); return q;
}
const deleteQuestion = (id) => db.prepare('DELETE FROM questions WHERE id=?').run(id).changes > 0;

module.exports = { listPublic, getById, getPublic, toTestCases, listAdmin, getAdmin: getById, createQuestion, deleteQuestion };
