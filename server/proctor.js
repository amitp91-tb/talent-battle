// proctor.js — stores webcam proctoring snapshots for Tests.
// Images are written OUTSIDE the public uploads dir (they contain students'
// faces) and are only ever served through a staff-gated endpoint.
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const DATA = process.env.TB_DATA || path.join(__dirname, 'data');
const DIR = path.join(DATA, 'proctor');
try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}

// Save one snapshot (a data: URL). Returns { id }.
function save({ userId, problemId, kind, dataUrl }) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('bad image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 500 * 1024) throw new Error('snapshot too large'); // ~500KB cap
  const ext = /png/i.test(m[1]) ? 'png' : (/webp/i.test(m[1]) ? 'webp' : 'jpg');
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(DIR, name), buf);
  const r = db.prepare('INSERT INTO proctor_shots (user_id,problem_id,kind,file,at) VALUES (?,?,?,?,?)')
    .run(userId, problemId || '', kind || '', name, Date.now());
  return { id: Number(r.lastInsertRowid) };
}

// Metadata for all of a student's snapshots (no image bytes).
function listForUser(userId) {
  return db.prepare('SELECT id,problem_id,kind,file,at FROM proctor_shots WHERE user_id=? ORDER BY at').all(userId)
    .map((r) => ({ id: r.id, problemId: r.problem_id, kind: r.kind, at: r.at }));
}

// Which students have any snapshots (for the admin list). Returns [{userId, shots, last}].
function summary() {
  return db.prepare('SELECT user_id, COUNT(*) n, MAX(at) last FROM proctor_shots GROUP BY user_id').all()
    .map((r) => ({ userId: r.user_id, shots: r.n, last: r.last }));
}

// Resolve one snapshot's file for streaming. Returns { userId, full, file } or null.
function getFile(id) {
  const r = db.prepare('SELECT user_id,file FROM proctor_shots WHERE id=?').get(id);
  if (!r) return null;
  const full = path.join(DIR, path.basename(r.file));
  if (!full.startsWith(DIR) || !fs.existsSync(full)) return null;
  return { userId: r.user_id, full, file: r.file };
}

module.exports = { save, listForUser, summary, getFile };
