// server.js — Talent Battle backend + web server. Built-in modules only.
// Run:  node server.js   ->   http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { judge } = require('../judge/runner');
const { LANGUAGES } = require('../judge/languages');
const { buildFeedback } = require('./feedback');
const auth = require('./auth');
const store = require('./store');
function findProblem(id){ return require('./store').getById(id) || require('./challenge').getById(id); }
const groups = require('./groups');
const tests = require('./tests');
const challenge = require('./challenge');
const contests = require('./contests');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS = path.join(process.env.TB_DATA || path.join(__dirname, 'data'), 'uploads');
try { if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true }); } catch (e) {}

function detectLanguages() {
  const available = {};
  for (const [key, cfg] of Object.entries(LANGUAGES)) {
    try { execSync(cfg.probe, { stdio: 'ignore' }); available[key] = true; } catch { available[key] = false; }
  }
  return available;
}
const AVAILABLE = detectLanguages();

// ---- helpers ----
function sendJSON(res, code, obj, headers = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers));
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    // Guard: oversized bodies must still settle the promise, otherwise the
    // request handler awaits forever and the client hangs. resolve() is
    // idempotent, so an early resolve here is safe even if 'end' also fires.
    req.on('data', (c) => { d += c; if (d.length > 5e6) { resolve({}); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function parseCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const currentUser = (req) => { const c = parseCookies(req); return c.tb_session ? auth.userForToken(c.tb_session) : null; };
const cookieHeader = (t) => ({ 'Set-Cookie': `tb_session=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` });
const isAdmin = (u) => u && u.role === 'admin';
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'subadmin');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
function serveStatic(res, urlPath) {
  let file = urlPath === '/' ? '/index.html' : urlPath;
  const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'text/plain' });
  fs.createReadStream(full).pipe(res);
}

async function handleApi(req, res, url) {
  // ---- AUTH ----
  if (req.method === 'POST' && url === '/api/register') {
    const b = await readBody(req);
    // First account on a fresh system becomes the Super Admin; everyone else is a student.
    const role = auth.allUsers().length === 0 ? 'admin' : 'student';
    try { const u = auth.createUser({ ...b, role }); const t = auth.startSession(u.id);
      return sendJSON(res, 200, { user: auth.publicUser(u) }, cookieHeader(t));
    } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && url === '/api/login') {
    const b = await readBody(req); const u = auth.findByEmail(b.email);
    if (!u || !auth.verifyPassword(b.password || '', u.pass)) return sendJSON(res, 401, { error: 'Wrong email or password.' });
    const t = auth.startSession(u.id);
    return sendJSON(res, 200, { user: auth.publicUser(u) }, cookieHeader(t));
  }
  if (req.method === 'POST' && url === '/api/logout') {
    const c = parseCookies(req); if (c.tb_session) auth.endSession(c.tb_session);
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'tb_session=; Path=/; Max-Age=0' });
  }
  if (req.method === 'GET' && url === '/api/me') {
    const u = currentUser(req);
    return sendJSON(res, 200, { user: u ? auth.publicUser(u) : null, isFirstUser: auth.allUsers().length === 0 });
  }

  // ---- PUBLIC READ ----
  if (req.method === 'GET' && url === '/api/languages') {
    return sendJSON(res, 200, { available: AVAILABLE,
      labels: Object.fromEntries(Object.entries(LANGUAGES).map(([k, v]) => [k, v.label])) });
  }
  if (req.method === 'GET' && url === '/api/problems') return sendJSON(res, 200, store.listPublic());
  const pm = url.match(/^\/api\/problems\/([^/]+)$/);
  if (req.method === 'GET' && pm) {
    const p = store.getPublic(pm[1]); if (!p) return sendJSON(res, 404, { error: 'not found' });
    return sendJSON(res, 200, p);
  }

  // ---- RUN / SUBMIT ----
  if (req.method === 'POST' && (url === '/api/run' || url === '/api/submit')) {
    const isSubmit = url === '/api/submit';
    const me = currentUser(req);
    if (isSubmit && !me) return sendJSON(res, 401, { error: 'Please log in to submit.' });
    const body = await readBody(req);
    const q = findProblem(body.problemId); if (!q) return sendJSON(res, 404, { error: 'unknown problem' });
    if (!AVAILABLE[body.language]) return sendJSON(res, 200, { overall: 'Language Unavailable', passed: 0, total: 0,
      results: [], note: `${LANGUAGES[body.language]?.label || body.language} is not installed on this machine.` });
    const all = store.toTestCases(q);
    const cases = isSubmit ? all : all.filter((t) => !t.hidden);
    let effCode = body.code || '';
    if (q.mode === 'function' && q.harness && q.harness[body.language] && q.harness[body.language].driver) {
      effCode = String(q.harness[body.language].driver).replace('{{SOLUTION}}', body.code || '');
    }
    const result = await judge({ language: body.language, code: effCode, testCases: cases,
      timeLimitMs: q.timeLimitMs, memoryMb: q.memoryMb, checker: q.checker, floatTolerance: q.floatTolerance,
      // Only reveal hidden-case details in practice mode (never during a proctored exam/contest).
      revealHidden: isSubmit && body.practice === true });
    if (isSubmit) {
      const feedback = buildFeedback2(q, result);
      const flags = body.flags || {};
      const violations = (Number(flags.tabSwitches) || 0) + (Number(flags.pasteAttempts) || 0);
      const runtimeMs = (result.results || []).reduce((m, r) => Math.max(m, r.timeMs || 0), 0);
      const peakMemKb = (result.results || []).reduce((m, r) => Math.max(m, r.memoryKb || 0), 0) || null;
      auth.addSubmission({ userId: me.id, problemId: q.id, title: q.title, tags: q.tags,
        language: body.language, score: result.score, overall: result.overall, at: Date.now(),
        source: body.code || '', violations, runtimeMs, memoryKb: peakMemKb });
      return sendJSON(res, 200, { ...result, feedback });
    }
    return sendJSON(res, 200, result);
  }

  // ---- RUN AGAINST CUSTOM INPUT ----
  if (req.method === 'POST' && url === '/api/run-custom') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const b = await readBody(req);
    if (!AVAILABLE[b.language]) return sendJSON(res, 200, { overall: 'Language Unavailable',
      note: `${LANGUAGES[b.language]?.label || b.language} is not installed on this server.` });
    const result = await judge({ language: b.language, code: b.code || '',
      testCases: [{ input: b.input || '', expected: '', hidden: false }],
      timeLimitMs: 5000, memoryMb: 256, checker: 'exact' });
    if (result.overall === 'Compilation Error')
      return sendJSON(res, 200, { overall: 'Compilation Error', compileOutput: result.compileOutput });
    const r = (result.results && result.results[0]) || {};
    return sendJSON(res, 200, { overall: result.overall, output: r.got || '', stderr: r.stderr || '', timeMs: r.timeMs });
  }

  // ---- STUDENT DASHBOARD ----
  if (req.method === 'GET' && url === '/api/dashboard') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const subs = auth.userSubmissions(me.id); const byProblem = {};
    for (const s of subs) { byProblem[s.problemId] = byProblem[s.problemId] || { title: s.title, best: 0, attempts: 0 };
      byProblem[s.problemId].best = Math.max(byProblem[s.problemId].best, s.score || 0); byProblem[s.problemId].attempts++; }
    const scores = Object.values(byProblem).map((x) => x.best);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return sendJSON(res, 200, { totalSubmissions: subs.length, solved: scores.filter((s) => s === 100).length,
      avgScore: avg, problems: byProblem, recent: subs.slice(-8).reverse() });
  }

  // ---- PER-PROBLEM RANKING / COMPARISON (#13) ----
  {
    const prm = url.match(/^\/api\/problem-rank\/([^/]+)$/);
    if (req.method === 'GET' && prm) {
      const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
      const subs = auth.submissionsForProblem(prm[1]);
      // Best submission per user: highest score, tie-broken by lowest runtime.
      const byUser = {};
      for (const s of subs) {
        const cur = byUser[s.user_id];
        const better = !cur || s.score > cur.score ||
          (s.score === cur.score && (s.runtime_ms == null ? Infinity : s.runtime_ms) < (cur.runtime_ms == null ? Infinity : cur.runtime_ms));
        if (better) byUser[s.user_id] = s;
      }
      const ranked = Object.values(byUser).sort((a, b) =>
        b.score - a.score || (a.runtime_ms == null ? Infinity : a.runtime_ms) - (b.runtime_ms == null ? Infinity : b.runtime_ms));
      const myBest = byUser[me.id] || null;
      const myRank = myBest ? ranked.findIndex((x) => x.user_id === me.id) + 1 : null;
      const rts = subs.filter((s) => s.score === 100 && s.runtime_ms != null).map((s) => s.runtime_ms);
      const bestRt = rts.length ? Math.min(...rts) : null;
      const avgRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
      const langDist = {};
      for (const s of subs) if (s.language) langDist[s.language] = (langDist[s.language] || 0) + 1;
      return sendJSON(res, 200, {
        totalStudents: ranked.length, totalSubmissions: subs.length, rank: myRank,
        your: myBest ? { score: myBest.score, runtimeMs: myBest.runtime_ms } : null,
        runtime: { your: myBest ? myBest.runtime_ms : null, best: bestRt, avg: avgRt },
        langDist,
      });
    }
  }

  // ---- GAMIFICATION ----
  if (req.method === 'GET' && url === '/api/gamify') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const st = computeStats(me.id);
    const students = auth.allUsers().filter((u) => u.role === 'student');
    const ranked = students.map((u) => ({ id: u.id, xp: computeStats(u.id).xp })).sort((a, b) => b.xp - a.xp);
    const rank = ranked.findIndex((r) => r.id === me.id) + 1;
    const dnum = (Math.floor(Date.now() / 86400000) % 100) + 1;
    const daily = challenge.getById('D' + String(dnum).padStart(3, '0'));
    return sendJSON(res, 200, { ...st, badges: badgesFor(st), rank, totalStudents: students.length,
      xpToNext: 100 - (st.xp % 100),
      daily: daily ? { id: daily.id, title: daily.title, difficulty: daily.difficulty } : null });
  }
  if (req.method === 'GET' && url === '/api/leaderboard') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const students = auth.allUsers().filter((u) => u.role === 'student');
    const rows = students.map((u) => { const st = computeStats(u.id);
      return { name: u.name, batch: u.batch || '-', xp: st.xp, level: st.level, solved: st.solved, streak: st.streak }; })
      .sort((a, b) => b.xp - a.xp).slice(0, 50);
    return sendJSON(res, 200, { top: rows });
  }

  // ---- STUDENT: assigned tests / challenges ----
  if (req.method === 'GET' && url === '/api/tests') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const my = tests.forBatch(me.batchId || '');
    return sendJSON(res, 200, my.map((t) => ({ id: t.id, title: t.title, description: t.description,
      questionCount: t.questionIds.length })));
  }
  // ---- 100 DAYS OF CODE ----
  if (req.method === 'GET' && url === '/api/challenge') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const subs = auth.userSubmissions(me.id);
    const solved = new Set(subs.filter((x) => x.overall === 'Accepted').map((x) => x.problemId));
    const attempted = new Set(subs.map((x) => x.problemId));
    const out = []; let prevSolved = true;
    for (const d of challenge.list()) {
      const isSolved = solved.has(d.id);
      out.push({ ...d, solved: isSolved, attempted: attempted.has(d.id), unlocked: d.day === 1 || prevSolved });
      prevSolved = isSolved;
    }
    return sendJSON(res, 200, { total: out.length, solvedCount: solved.size ? out.filter((d)=>d.solved).length : 0, days: out });
  }
  const cm = url.match(/^\/api\/challenge\/([^/]+)$/);
  if (req.method === 'GET' && cm) {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const d = challenge.getPublic(cm[1]); return d ? sendJSON(res, 200, d) : sendJSON(res, 404, { error: 'not found' });
  }
  // ---- VIEW SOLUTION (gated: must have attempted) ----
  const solm = url.match(/^\/api\/solution\/([^/]+)$/);
  if (req.method === 'GET' && solm) {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const q = findProblem(solm[1]); if (!q) return sendJSON(res, 404, { error: 'not found' });
    const attempted = auth.userSubmissions(me.id).some((x) => x.problemId === solm[1]);
    if (!attempted && me.role === 'student') return sendJSON(res, 403, { error: 'Submit at least once to unlock the solution.' });
    const solutions = (q.solutions && Object.keys(q.solutions).length) ? q.solutions : (q.reference ? { python: q.reference } : {});
    return sendJSON(res, 200, { title: q.title, solutions, reference: q.reference || '',
      timeComplexity: q.timeComplexity || '', spaceComplexity: q.spaceComplexity || '' });
  }
  const tstu = url.match(/^\/api\/tests\/([^/]+)$/);
  if (req.method === 'GET' && tstu) {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const t = tests.getById(tstu[1]); if (!t) return sendJSON(res, 404, { error: 'not found' });
    if (!(t.batchIds.length === 0 || t.batchIds.includes(me.batchId))) return sendJSON(res, 403, { error: 'not assigned to you' });
    const qs = t.questionIds.map((qid) => store.getById(qid)).filter(Boolean)
      .map((q) => ({ id: q.id, title: q.title, difficulty: q.difficulty, tags: q.tags }));
    return sendJSON(res, 200, { id: t.id, title: t.title, description: t.description, questions: qs });
  }

  // ---- CONTESTS (student) ----
  if (req.method === 'GET' && url === '/api/contests') {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const mine = contests.forBatch(me.batchId || '');
    return sendJSON(res, 200, mine.map((c) => ({ id: c.id, title: c.title, description: c.description,
      startAt: c.startAt, endAt: c.endAt, status: contests.status(c), problems: c.problemIds.length })));
  }
  const cdm = url.match(/^\/api\/contests\/([^/]+)$/);
  if (req.method === 'GET' && cdm) {
    const me = currentUser(req); if (!me) return sendJSON(res, 401, { error: 'login required' });
    const c = contests.getById(cdm[1]); if (!c) return sendJSON(res, 404, { error: 'not found' });
    const st = contests.status(c);
    const probs = st === 'upcoming' ? [] : c.problemIds.map((pid) => { const q = store.getById(pid) || challenge.getById(pid);
      return q ? { id: pid, title: q.title, difficulty: q.difficulty } : null; }).filter(Boolean);
    return sendJSON(res, 200, { id: c.id, title: c.title, description: c.description, startAt: c.startAt, endAt: c.endAt,
      status: st, problems: probs, standings: st === 'upcoming' ? [] : contestStandings(c) });
  }

  // ---- STAFF RESULTS (admin sees all; sub-admin scoping added in later phase) ----
  if (req.method === 'GET' && url === '/api/faculty') {
    const me = currentUser(req);
    if (!isStaff(me)) return sendJSON(res, 403, { error: 'staff only' });
    let students = auth.allUsers().filter((u) => u.role === 'student');
    let scope = 'All students';
    if (me.role === 'subadmin') {
      const assigned = me.assignedBatches || [];
      students = students.filter((u) => assigned.includes(u.batchId));
      scope = 'Your assigned batches only';
    }
    const idset = new Set(students.map((u) => u.id));
    const rows = students.map((st) => { const subs = auth.userSubmissions(st.id); const byP = {};
      for (const s of subs) byP[s.problemId] = Math.max(byP[s.problemId] || 0, s.score || 0);
      const vals = Object.values(byP); const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { name: st.name, batch: st.batch, avg, solved: vals.filter((v) => v === 100).length, attempts: subs.length }; });
    const batchAvg = rows.length ? Math.round(rows.reduce((a, r) => a + r.avg, 0) / rows.length) : 0;
    const weak = {}; for (const s of auth.allSubmissions()) if (idset.has(s.userId) && (s.score || 0) < 100) for (const t of (s.tags || [])) weak[t] = (weak[t] || 0) + 1;
    const weakTopics = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, count]) => ({ tag, count }));
    return sendJSON(res, 200, { scope, totalStudents: students.length, batchAvg, students: rows.sort((a, b) => a.avg - b.avg), weakTopics });
  }

  // ---- GROUP-WISE ANALYTICS (staff; scoped for sub-admin) ----
  if (req.method === 'GET' && url === '/api/analytics') {
    const me = currentUser(req);
    if (!isStaff(me)) return sendJSON(res, 403, { error: 'staff only' });
    let students = auth.allUsers().filter((u) => u.role === 'student');
    let scope = 'All students';
    if (me.role === 'subadmin') {
      const assigned = me.assignedBatches || [];
      students = students.filter((u) => assigned.includes(u.batchId));
      scope = 'Your assigned batches only';
    }
    const idset = new Set(students.map((u) => u.id));
    const per = students.map((u) => {
      const subs = auth.userSubmissions(u.id); const byP = {};
      for (const x of subs) byP[x.problemId] = Math.max(byP[x.problemId] || 0, x.score || 0);
      const vals = Object.values(byP);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      const flags = subs.reduce((a, x) => a + (x.violations || 0), 0);
      return { name: u.name, batchId: u.batchId || '', batch: u.batch || '(unassigned)',
        branch: u.branch || '(none)', year: u.yearOfPassing || '(none)',
        avg, solved: vals.filter((v) => v === 100).length, attempts: subs.length, flags };
    });
    const groupBy = (keyFn, labelFn) => {
      const m = {};
      for (const p of per) { const k = keyFn(p);
        (m[k] = m[k] || { label: labelFn(p), students: 0, sumAvg: 0, solved: 0 });
        m[k].students++; m[k].sumAvg += p.avg; m[k].solved += p.solved; }
      return Object.values(m).map((g) => ({ label: g.label, students: g.students,
        avg: g.students ? Math.round(g.sumAvg / g.students) : 0, solved: g.solved }))
        .sort((a, b) => a.avg - b.avg);
    };
    const weak = {};
    for (const sub of auth.allSubmissions()) if (idset.has(sub.userId) && (sub.score || 0) < 100)
      for (const t of (sub.tags || [])) weak[t] = (weak[t] || 0) + 1;
    const weakTopics = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
    const active = per.filter((p) => p.attempts > 0).length;
    const overallAvg = per.length ? Math.round(per.reduce((a, p) => a + p.avg, 0) / per.length) : 0;
    return sendJSON(res, 200, {
      scope,
      summary: { students: per.length, active, avgScore: overallAvg, solvedTotal: per.reduce((a, p) => a + p.solved, 0), flagged: per.filter((p) => p.flags > 0).length },
      byBatch: groupBy((p) => p.batchId || 'none', (p) => p.batch),
      byBranch: groupBy((p) => p.branch, (p) => p.branch),
      byYear: groupBy((p) => p.year, (p) => p.year),
      weakTopics,
      students: per.sort((a, b) => a.avg - b.avg),
    });
  }

  // ---- ADMIN: QUESTION MANAGEMENT ----
  if (url.startsWith('/api/admin/')) {
    const me = currentUser(req);
    if (!isAdmin(me)) return sendJSON(res, 403, { error: 'admin only' });

    if (req.method === 'GET' && url === '/api/admin/questions') return sendJSON(res, 200, store.listAdmin());
    const am = url.match(/^\/api\/admin\/questions\/([^/]+)$/);
    if (req.method === 'GET' && am) { const q = store.getAdmin(am[1]);
      return q ? sendJSON(res, 200, q) : sendJSON(res, 404, { error: 'not found' }); }
    if (req.method === 'POST' && url === '/api/admin/questions') {
      const b = await readBody(req);
      if (!b.title || !b.statement) return sendJSON(res, 400, { error: 'Title and statement are required.' });
      const nonEmpty = (arr) => Array.isArray(arr) ? arr.filter((c)=>String(c.input||'')!==''||String(c.expected||'')!=='').length : 0;
      if (nonEmpty(b.samples) < 2) return sendJSON(res, 400, { error: 'Add at least 2 public (sample) test cases.' });
      if (nonEmpty(b.hidden) < 5) return sendJSON(res, 400, { error: 'Add at least 5 hidden test cases.' });
      const q = store.createQuestion(b, me.id); return sendJSON(res, 200, { question: { id: q.id, title: q.title } });
    }
    if (req.method === 'DELETE' && am) { const ok = store.deleteQuestion(am[1]);
      return ok ? sendJSON(res, 200, { ok: true }) : sendJSON(res, 404, { error: 'not found' }); }
    // ---- BATCHES ----
    if (req.method === 'GET' && url === '/api/admin/batches') {
      const students = auth.allUsers().filter((u) => u.role === 'student');
      return sendJSON(res, 200, groups.list().map((b) => ({ ...b,
        students: students.filter((s) => s.batchId === b.id).length })));
    }
    if (req.method === 'POST' && url === '/api/admin/batches') {
      const b = await readBody(req);
      try { return sendJSON(res, 200, { batch: groups.create(b) }); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }
    const bm = url.match(/^\/api\/admin\/batches\/([^/]+)$/);
    if (req.method === 'DELETE' && bm) {
      for (const u of auth.allUsers()) if (u.batchId === bm[1]) auth.updateUser(u.id, { batchId: '', batch: '' });
      return sendJSON(res, 200, { ok: groups.remove(bm[1]) });
    }

    // ---- STUDENTS ----
    if (req.method === 'GET' && url === '/api/admin/students') {
      const rows = auth.allUsers().filter((u) => u.role === 'student').map((u) => {
        const subs = auth.userSubmissions(u.id); const byP = {};
        for (const s of subs) byP[s.problemId] = Math.max(byP[s.problemId] || 0, s.score || 0);
        const vals = Object.values(byP); const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        return { id: u.id, name: u.name, email: u.email, mobile: u.mobile || '', branch: u.branch || '', yearOfPassing: u.yearOfPassing || '', batchId: u.batchId || '', batch: u.batch || '', attempts: subs.length, avg };
      });
      return sendJSON(res, 200, rows);
    }
    if (req.method === 'POST' && url === '/api/admin/students') {
      const b = await readBody(req);
      try {
        const batch = b.batchId ? groups.getById(b.batchId) : null;
        const u = auth.createUser({ name: b.name, email: b.email, password: b.password, role: 'student',
          batch: batch ? batch.name : '', batchId: batch ? batch.id : '',
          mobile: b.mobile, branch: b.branch, yearOfPassing: b.yearOfPassing });
        return sendJSON(res, 200, { user: auth.publicUser(u) });
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }
    const sm = url.match(/^\/api\/admin\/students\/([^/]+)\/batch$/);
    if (req.method === 'POST' && sm) {
      const b = await readBody(req);
      const batch = b.batchId ? groups.getById(b.batchId) : null;
      const u = auth.updateUser(sm[1], { batchId: batch ? batch.id : '', batch: batch ? batch.name : '' });
      return u ? sendJSON(res, 200, { user: u }) : sendJSON(res, 404, { error: 'not found' });
    }

    // ---- SUB-ADMINS ----
    if (req.method === 'GET' && url === '/api/admin/subadmins') {
      const bmap = Object.fromEntries(groups.list().map((b) => [b.id, b.name]));
      return sendJSON(res, 200, auth.allUsers().filter((u) => u.role === 'subadmin').map((u) => ({
        id: u.id, name: u.name, email: u.email, assignedBatches: u.assignedBatches || [],
        assignedNames: (u.assignedBatches || []).map((id) => bmap[id]).filter(Boolean) })));
    }
    if (req.method === 'POST' && url === '/api/admin/subadmins') {
      const b = await readBody(req);
      try { const u = auth.createUser({ name: b.name, email: b.email, password: b.password, role: 'subadmin' });
        return sendJSON(res, 200, { user: auth.publicUser(u) }); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }
    const subm = url.match(/^\/api\/admin\/subadmins\/([^/]+)\/batches$/);
    if (req.method === 'POST' && subm) {
      const b = await readBody(req);
      const ids = Array.isArray(b.batchIds) ? b.batchIds.filter((id) => groups.getById(id)) : [];
      const u = auth.updateUser(subm[1], { assignedBatches: ids });
      return u ? sendJSON(res, 200, { user: u }) : sendJSON(res, 404, { error: 'not found' });
    }

    // ---- TESTS / CHALLENGES ----
    if (req.method === 'GET' && url === '/api/admin/tests') {
      const bmap = Object.fromEntries(groups.list().map((b) => [b.id, b.name]));
      return sendJSON(res, 200, tests.list().map((t) => ({ id: t.id, title: t.title, description: t.description,
        questionCount: t.questionIds.length, questionIds: t.questionIds, batchIds: t.batchIds,
        batchNames: t.batchIds.map((id) => bmap[id]).filter(Boolean) })));
    }
    if (req.method === 'POST' && url === '/api/admin/tests') {
      const b = await readBody(req);
      try { const t = tests.create(b); return sendJSON(res, 200, { test: { id: t.id, title: t.title } }); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }
    const tm = url.match(/^\/api\/admin\/tests\/([^/]+)$/);
    if (req.method === 'DELETE' && tm) return sendJSON(res, 200, { ok: tests.remove(tm[1]) });

    // ---- RESET A USER'S PASSWORD (admin) ----
    const pwm = url.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (req.method === 'POST' && pwm) {
      const b = await readBody(req);
      try { const ok = auth.setPassword(pwm[1], b.password);
        return ok ? sendJSON(res, 200, { ok: true }) : sendJSON(res, 404, { error: 'user not found' }); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }

    // ---- BULK STUDENT UPLOAD (CSV) ----
    if (req.method === 'POST' && url === '/api/admin/students/bulk') {
      const b = await readBody(req);
      const lines = String(b.csv || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return sendJSON(res, 400, { error: 'No rows found.' });
      // header row maps columns; must include name and email
      let header = lines[0].toLowerCase().split(',').map((h) => h.trim());
      let start = 0;
      if (header.includes('name') && header.includes('email')) start = 1;
      else header = ['name', 'email', 'password', 'batch'];
      const col = (parts, key) => { const i = header.indexOf(key); return i >= 0 ? (parts[i] || '').trim() : ''; };
      // resolve/create batches by name (cache)
      const batchByName = {};
      for (const bt of groups.list()) batchByName[bt.name.toLowerCase()] = bt;
      const created = [], skipped = [];
      for (let i = start; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const name = col(parts, 'name'), email = col(parts, 'email');
        let password = col(parts, 'password') || 'changeme123';
        const batchName = col(parts, 'batch');
        let batchId = b.defaultBatchId || '';
        if (batchName) {
          let bt = batchByName[batchName.toLowerCase()];
          if (!bt) { try { bt = groups.create(batchName); batchByName[batchName.toLowerCase()] = bt; } catch (e) {} }
          if (bt) batchId = bt.id;
        }
        const batch = batchId ? (groups.getById(batchId) || null) : null;
        try {
          auth.createUser({ name, email, password, role: 'student', batch: batch ? batch.name : '', batchId: batch ? batch.id : '',
            college: col(parts, 'college'), mobile: col(parts, 'mobile'), branch: col(parts, 'branch'),
            yearOfPassing: col(parts, 'year') || col(parts, 'yearofpassing') || col(parts, 'year of passing') });
          created.push(email);
        } catch (e) { skipped.push({ row: i + 1, email, reason: e.message }); }
      }
      return sendJSON(res, 200, { createdCount: created.length, skipped });
    }

    // ---- ADMIN OVERVIEW (dashboard stats) ----
    if (req.method === 'GET' && url === '/api/admin/overview') {
      const users = auth.allUsers();
      const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
      const subs = auth.allSubmissions();
      const recent = subs.slice(-8).reverse().map((x) => ({ student: nameById[x.userId] || 'Unknown',
        title: x.title, score: x.score, overall: x.overall, at: x.at }));
      return sendJSON(res, 200, {
        students: users.filter((u) => u.role === 'student').length,
        subadmins: users.filter((u) => u.role === 'subadmin').length,
        batches: groups.list().length,
        questions: store.listAdmin().length,
        tests: tests.list().length,
        submissions: subs.length,
        recent,
      });
    }

    // ---- 100 DAYS: admin view/edit ----
    if (req.method === 'GET' && url === '/api/admin/challenge') return sendJSON(res, 200, challenge.listAdmin());
    const chm = url.match(/^\/api\/admin\/challenge\/([^/]+)$/);
    if (req.method === 'GET' && chm) { const q = challenge.getAdmin(chm[1]);
      return q ? sendJSON(res, 200, q) : sendJSON(res, 404, { error: 'not found' }); }
    if (req.method === 'POST' && chm) {
      const b = await readBody(req);
      const q = challenge.update(chm[1], b);
      return q ? sendJSON(res, 200, { ok: true, id: q.id }) : sendJSON(res, 404, { error: 'not found' });
    }

    // ---- IMAGE UPLOAD ----
    if (req.method === 'POST' && url === '/api/admin/upload') {
      const b = await readBody(req);
      const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec(b.dataUrl || '');
      if (!m) return sendJSON(res, 400, { error: 'Only PNG, JPG, GIF or WebP images are allowed.' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 2 * 1024 * 1024) return sendJSON(res, 400, { error: 'Image too large (max 2 MB).' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const name = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
      try { fs.writeFileSync(path.join(UPLOADS, name), buf); } catch (e) { return sendJSON(res, 500, { error: 'Could not save image.' }); }
      return sendJSON(res, 200, { url: '/uploads/' + name });
    }

    // ---- LOAD DEMO DATA ----
    if (req.method === 'POST' && url === '/api/admin/seed-demo') {
      try { const r = require('./demo').seedDemo(); return sendJSON(res, 200, r); }
      catch (e) { console.error(e); return sendJSON(res, 500, { error: String(e.message || e) }); }
    }
    if (req.method === 'POST' && url === '/api/admin/seed-functions') {
      try { const r = require('./demo').seedFunctionExamples(); return sendJSON(res, 200, r); }
      catch (e) { console.error(e); return sendJSON(res, 500, { error: String(e.message || e) }); }
    }

    // ---- REPORTS ----
    if (req.method === 'GET' && url === '/api/admin/reports') {
      const students = auth.allUsers().filter((u) => u.role === 'student');
      const subs = auth.allSubmissions();
      const now = Date.now(), dayAgo = now - 86400000, weekAgo = now - 7 * 86400000;
      const solveCount = {};
      for (const x of subs) if (x.overall === 'Accepted') solveCount[x.title] = (solveCount[x.title] || 0) + 1;
      const mostSolved = Object.entries(solveCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count }));
      const top = students.map((u) => { const st = computeStats(u.id); return { name: u.name, xp: st.xp, solved: st.solved }; })
        .sort((a, b) => b.xp - a.xp).slice(0, 10);
      return sendJSON(res, 200, {
        totalStudents: students.length,
        activeToday: new Set(subs.filter((x) => x.at >= dayAgo).map((x) => x.userId)).size,
        activeWeek: new Set(subs.filter((x) => x.at >= weekAgo).map((x) => x.userId)).size,
        submissionsToday: subs.filter((x) => x.at >= dayAgo).length,
        submissionsWeek: subs.filter((x) => x.at >= weekAgo).length,
        totalSubmissions: subs.length, mostSolved, top,
      });
    }

    // ---- CONTESTS (admin) ----
    if (req.method === 'GET' && url === '/api/admin/contests') {
      const bmap = Object.fromEntries(groups.list().map((b) => [b.id, b.name]));
      return sendJSON(res, 200, contests.list().map((c) => ({ id: c.id, title: c.title, startAt: c.startAt,
        endAt: c.endAt, status: contests.status(c), problems: c.problemIds.length,
        batchNames: c.batchIds.map((id) => bmap[id]).filter(Boolean) })));
    }
    if (req.method === 'POST' && url === '/api/admin/contests') {
      const b = await readBody(req);
      try { const c = contests.create(b); return sendJSON(res, 200, { contest: { id: c.id, title: c.title } }); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }
    const ctm = url.match(/^\/api\/admin\/contests\/([^/]+)$/);
    if (req.method === 'DELETE' && ctm) return sendJSON(res, 200, { ok: contests.remove(ctm[1]) });

    return sendJSON(res, 404, { error: 'no such admin endpoint' });
  }

  return sendJSON(res, 404, { error: 'no such endpoint' });
}

// ---- gamification helpers ----
function difficultyOf(pid){ const q = store.getById(pid) || require('./challenge').getById(pid); return q ? q.difficulty : 'easy'; }
function xpWeight(d){ return d === 'hard' ? 50 : d === 'medium' ? 25 : 10; }
function dayKey(ms){ return new Date(ms).toISOString().slice(0, 10); }
function computeStats(userId){
  const subs = auth.userSubmissions(userId);
  const accepted = subs.filter((s) => s.overall === 'Accepted');
  const solvedSet = new Set(accepted.map((s) => s.problemId));
  let xp = 0; for (const pid of solvedSet) xp += xpWeight(difficultyOf(pid));
  const langs = new Set(subs.map((s) => s.language)).size;
  const days = new Set(accepted.map((s) => dayKey(s.at)));
  let streak = 0; const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(dayKey(d.getTime()))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  return { xp, level: 1 + Math.floor(xp / 100), solved: solvedSet.size, streak, langs, attempts: subs.length };
}
function badgesFor(st){
  const b = [];
  if (st.solved >= 1) b.push({ icon: '🎯', name: 'First Solve' });
  if (st.solved >= 5) b.push({ icon: '🌱', name: 'Getting Started' });
  if (st.solved >= 25) b.push({ icon: '⚔️', name: 'Problem Solver' });
  if (st.solved >= 50) b.push({ icon: '🏅', name: 'Half Century' });
  if (st.solved >= 100) b.push({ icon: '💯', name: 'Centurion' });
  if (st.streak >= 3) b.push({ icon: '🔥', name: '3-Day Streak' });
  if (st.streak >= 7) b.push({ icon: '🔥', name: '7-Day Streak' });
  if (st.streak >= 30) b.push({ icon: '🏆', name: '30-Day Streak' });
  if (st.langs >= 3) b.push({ icon: '🌐', name: 'Polyglot' });
  return b;
}

// ---- contest standings (ICPC-style: solved desc, then penalty time asc) ----
function contestStandings(c){
  const nameById = Object.fromEntries(auth.allUsers().map((u) => [u.id, { name: u.name, batch: u.batch }]));
  const inWindow = auth.allSubmissions().filter((x) => x.at >= c.startAt && x.at <= c.endAt && c.problemIds.includes(x.problemId));
  const byUser = {};
  for (const x of inWindow) { (byUser[x.userId] = byUser[x.userId] || []).push(x); }
  const rows = [];
  for (const [uid, subs] of Object.entries(byUser)) {
    let solved = 0, penalty = 0;
    for (const pid of c.problemIds) {
      const ps = subs.filter((x) => x.problemId === pid).sort((a, b) => a.at - b.at);
      let wrong = 0, done = false;
      for (const x of ps) {
        if (x.overall === 'Accepted') { solved++; penalty += Math.round((x.at - c.startAt) / 60000) + 20 * wrong; done = true; break; }
        else wrong++;
      }
    }
    const info = nameById[uid] || { name: 'Unknown', batch: '-' };
    rows.push({ name: info.name, batch: info.batch || '-', solved, penalty });
  }
  return rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
}

// feedback that works with a store question (has .reference)
function buildFeedback2(q, result) {
  const failed = result.results.filter((r) => r.verdict !== 'Accepted');
  let summary;
  if (result.overall === 'Accepted') summary = `Excellent — all ${result.total} tests passed. Your solution is correct.`;
  else if (result.overall === 'Compilation Error') summary = `Your code did not compile. Fix the errors shown, then resubmit.`;
  else if (result.overall === 'Time Limit Exceeded') summary = `Correct idea perhaps, but too slow — find a more efficient approach.`;
  else summary = `You passed ${result.passed} of ${result.total} tests. The missed cases usually involve tricky inputs. Compare with the reference solution.`;
  const solutions = (q.solutions && Object.keys(q.solutions).length) ? q.solutions : (q.reference ? { python: q.reference } : {});
  return { summary, failedCount: failed.length, referenceSolution: q.reference || '(no reference provided)',
    solutions, timeComplexity: q.timeComplexity || '', spaceComplexity: q.spaceComplexity || '',
    improve: { videos: (q.tags || []).slice(0, 2).map((t) => `Video: ${t} — core concepts`), note: 'Re-attempt after reviewing the solution.' } };
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) return handleApi(req, res, url).catch((e) => { console.error(e); sendJSON(res, 500, { error: String(e) }); });
  if (url.startsWith('/uploads/')) {
    const f = path.join(UPLOADS, path.basename(decodeURIComponent(url)));
    if (f.startsWith(UPLOADS) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); return res.end('not found');
  }
  return serveStatic(res, url);
});
server.listen(PORT, () => {
  console.log('\n  Talent Battle running:  http://localhost:' + PORT);
  console.log('  Languages available:', Object.entries(AVAILABLE).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
  console.log('  First account created becomes the Super Admin.');
  console.log('  (Ctrl+C to stop)\n');
});
