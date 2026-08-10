// auth.js — accounts, password hashing, sessions. Backed by SQLite (db.js).
const crypto = require('crypto');
const { db, J, P } = require('./db');

const sessions = new Map(); // token -> userId (in-memory cache over the sessions table)
// Persist sessions so a server restart (e.g. a deploy) does not log everyone out.
try { db.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - 30 * 86400000); } catch (e) {}
try { for (const r of db.prepare('SELECT token,user_id FROM sessions').all()) sessions.set(r.token, r.user_id); } catch (e) {}

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored).split(':');
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex')); } catch { return false; }
}
function rowToUser(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, email: r.email, role: r.role, college: r.college,
    batch: r.batch, batchId: r.batch_id || '', assignedBatches: P(r.assigned_batches),
    mobile: r.mobile || '', branch: r.branch || '', yearOfPassing: r.year_of_passing || '',
    mustChange: !!r.must_change_password, pass: r.pass, createdAt: r.created_at };
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role,
  college: u.college, batch: u.batch, assignedBatches: u.assignedBatches || [],
  mobile: u.mobile || '', branch: u.branch || '', yearOfPassing: u.yearOfPassing || '',
  mustChange: !!u.mustChange });

function createUser({ name, email, password, role, college, batch, batchId, assignedBatches, mobile, branch, yearOfPassing, mustChange }) {
  email = (email || '').toLowerCase().trim();
  if (!name || !email || !password) throw new Error('Name, email and password are required.');
  if (password.length < 4) throw new Error('Password must be at least 4 characters.');
  if (findByEmail(email)) throw new Error('An account with this email already exists.');
  const u = { id: crypto.randomUUID(), name: name.trim(), email,
    role: ['admin', 'subadmin', 'student'].includes(role) ? role : 'student',
    college: (college || '').trim(), batch: (batch || '').trim(), batchId: batchId || '',
    assignedBatches: Array.isArray(assignedBatches) ? assignedBatches : [],
    mobile: (mobile || '').trim(), branch: (branch || '').trim(), yearOfPassing: (yearOfPassing || '').trim(),
    mustChange: mustChange ? 1 : 0, pass: hashPassword(password), createdAt: Date.now() };
  db.prepare(`INSERT INTO users (id,name,email,role,college,batch,batch_id,assigned_batches,mobile,branch,year_of_passing,must_change_password,pass,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.id, u.name, u.email, u.role, u.college, u.batch,
    u.batchId, J(u.assignedBatches), u.mobile, u.branch, u.yearOfPassing, u.mustChange, u.pass, u.createdAt);
  return { ...u, mustChange: !!u.mustChange };
}
const findByEmail = (email) => rowToUser(db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase().trim()));
const findById = (id) => rowToUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
function updateUser(id, patch) {
  const u = findById(id); if (!u) return null;
  const map = { name: 'name', batch: 'batch', batchId: 'batch_id', role: 'role', assignedBatches: 'assigned_batches', mobile: 'mobile', branch: 'branch', yearOfPassing: 'year_of_passing' };
  const sets = [], vals = [];
  for (const k of Object.keys(map)) if (patch[k] !== undefined) {
    sets.push(map[k] + '=?'); vals.push(k === 'assignedBatches' ? J(patch[k]) : patch[k]);
  }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  return publicUser(findById(id));
}
// opts.mustChange = true forces the user to change this password at next login
// (used for admin-issued temporary passwords). Self-service changes clear the flag.
function setPassword(id, pw, opts = {}) {
  if (!pw || String(pw).length < 4) throw new Error('Password must be at least 4 characters.');
  const r = db.prepare('UPDATE users SET pass=?, must_change_password=? WHERE id=?')
    .run(hashPassword(String(pw)), opts.mustChange ? 1 : 0, id);
  return r.changes > 0;
}
const allUsers = () => db.prepare('SELECT * FROM users').all().map(rowToUser);

// ----- Password reset tokens (single-use, time-limited) -----
function createReset(userId, ttlMs = 3600000) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO password_resets (token,user_id,expires_at,created_at) VALUES (?,?,?,?)')
    .run(token, userId, now + ttlMs, now);
  // keep the table tidy: drop this user's older tokens and anything expired
  try { db.prepare('DELETE FROM password_resets WHERE (user_id=? AND token<>?) OR expires_at < ?').run(userId, token, now); } catch (e) {}
  return token;
}
// Returns the userId for a valid, unexpired token and consumes it; null otherwise.
function consumeReset(token) {
  const r = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token=?').get(String(token || ''));
  if (r) db.prepare('DELETE FROM password_resets WHERE token=?').run(String(token));
  if (!r || r.expires_at < Date.now()) return null;
  return r.user_id;
}

function startSession(userId) {
  const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, userId);
  try { db.prepare('INSERT OR REPLACE INTO sessions (token,user_id,created_at) VALUES (?,?,?)').run(t, userId, Date.now()); } catch (e) {}
  return t;
}
const endSession = (t) => { sessions.delete(t); try { db.prepare('DELETE FROM sessions WHERE token=?').run(t); } catch (e) {} return true; };
const userForToken = (t) => {
  let id = sessions.get(t);
  if (!id) {
    // Fall back to the DB: a session created on another pm2 worker or before this
    // process started must still resolve, otherwise the user is spuriously logged out.
    try { const r = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(t); if (r) { id = r.user_id; sessions.set(t, id); } } catch (e) {}
  }
  return id ? findById(id) : null;
};

function addSubmission(s) {
  db.prepare(`INSERT INTO submissions (user_id,problem_id,title,tags,language,score,overall,at,source,violations,runtime_ms,memory_kb)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(s.userId, s.problemId, s.title, J(s.tags), s.language, Number(s.score) || 0, s.overall,
    s.at, s.source || '', s.violations || 0, s.runtimeMs == null ? null : s.runtimeMs, s.memoryKb == null ? null : s.memoryKb);
}
const subRow = (r) => ({ userId: r.user_id, problemId: r.problem_id, title: r.title, tags: P(r.tags),
  language: r.language, score: r.score, overall: r.overall, at: r.at, violations: r.violations || 0 });
const userSubmissions = (userId) => db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY at').all(userId).map(subRow);
const allSubmissions = () => db.prepare('SELECT * FROM submissions').all().map(subRow);
const submissionsForProblem = (problemId) =>
  db.prepare('SELECT user_id,language,score,overall,runtime_ms,memory_kb,at FROM submissions WHERE problem_id=?').all(problemId);

module.exports = { hashPassword, verifyPassword, publicUser, createUser, updateUser, findByEmail,
  findById, setPassword, createReset, consumeReset, startSession, endSession, userForToken, addSubmission, userSubmissions, allSubmissions, submissionsForProblem, allUsers };
