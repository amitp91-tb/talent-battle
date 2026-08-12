// app.js — single-page app with login accounts (students + faculty).
const app = document.getElementById('app');
const userbar = document.getElementById('userbar');
let ME = null, LANGS = { available:{}, labels:{} }, PROBLEMS = [], timer = null, contestTimer = null, examMode = false, examSession = false, examKind = null, cam = null, advancing = false, curLang = null, langCode = {};
// Saved-code key is per USER + problem + language, so a shared/lab computer never
// shows one student's code to the next, and each language keeps its own code.
function codeKey(id, lang){ return 'tb_code_' + ((ME && ME.id) || 'anon') + '_' + id + '_' + lang; }
function clearSavedCode(){ try{ Object.keys(localStorage).filter(k=>k.indexOf('tb_code_')===0).forEach(k=>localStorage.removeItem(k)); }catch(e){} }

const starters = {
  python: "# Read all input, then print your answer.\nimport sys\ndata = sys.stdin.read().split()\n\n# TODO: compute the answer from `data`\nprint(\"your answer here\")",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n    // TODO: read input and print your answer\n    return 0;\n}",
  c: "#include <stdio.h>\nint main(){\n    // TODO: read input and print your answer\n    return 0;\n}",
  java: "import java.util.*;\npublic class Main {\n  public static void main(String[] args){\n    // TODO: read input and print your answer\n  }\n}",
  javascript: "const data = require('fs').readFileSync(0,'utf8').trim();\n// TODO: solve using `data`\nconsole.log('your answer');",
  bash: "read line\n# TODO: solve\necho \"$line\"",
  go: "package main\nimport (\"bufio\";\"fmt\";\"os\")\nfunc main(){\n  r:=bufio.NewReader(os.Stdin); _=r\n  // TODO: read & solve\n  fmt.Print(\"\")\n}",
  ruby: "data = STDIN.read.strip\n# TODO: solve\nputs 'your answer'",
  php: "<?php\n$data = trim(file_get_contents('php://stdin'));\n// TODO: solve\necho 'your answer';",
  rust: "use std::io::*;\nfn main(){\n  let mut s=String::new(); stdin().read_to_string(&mut s).unwrap();\n  // TODO: solve\n  print!(\"\");\n}"
};

async function apiGet(u){ const r = await fetch(u); return r.json(); }
async function apiPost(u,b){ const r = await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  return { status:r.status, body: await r.json() }; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toast(msg){
  let t=document.getElementById('tb-toast');
  if(!t){ t=document.createElement('div'); t.id='tb-toast'; document.body.appendChild(t);
    t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#2b2b2b;color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;z-index:200;opacity:0;transition:opacity .2s;box-shadow:0 4px 14px rgba(0,0,0,.2)'; }
  t.textContent=msg; t.style.opacity='1';
  clearTimeout(t._t); t._t=setTimeout(()=>{ t.style.opacity='0'; }, 1800);
}
function pillClass(d){ return d==='easy'?'pill-easy':(d==='hard'?'pill-hard':'pill-medium'); }
function stopTimer(){ if(timer){ clearInterval(timer); timer=null; } if(contestTimer){ clearInterval(contestTimer); contestTimer=null; } disposeEditor(); stopProctor(); stopExam(); }
let mona=null; let curProblem=null;
function starterFor(lang){ if(curProblem&&curProblem.meta&&curProblem.meta.mode==='function'&&curProblem.starters&&curProblem.starters[lang]!=null) return curProblem.starters[lang]; return starters[lang]||''; }
const monLang={python:'python',cpp:'cpp',c:'c',java:'java',javascript:'javascript',bash:'shell',go:'go',ruby:'ruby',php:'php',rust:'rust'};
function disposeEditor(){ if(mona){ try{mona.dispose();}catch(e){} mona=null; } }
function mountEditor(code,lang){
  disposeEditor();
  const host=document.getElementById('mona'); const ta=document.getElementById('code');
  const p=getEditorPrefs();
  if(window.__monaco && host){
    try{ mona=window.__monaco.editor.create(host,{ value:code, language:monLang[lang]||'plaintext',
        theme: p.theme==='light'?'vs':'vs-dark',
        automaticLayout:true, minimap:{enabled:false}, fontSize:p.fontSize||13, tabSize:4, scrollBeyondLastLine:false, padding:{top:10} });
      host.style.display='block'; if(ta) ta.style.display='none'; applyEditorPrefs(); watchEditorHeight(); return; }catch(e){ mona=null; }
  }
  if(host) host.style.display='none'; if(ta){ ta.style.display='block'; ta.value=code; }
  applyEditorPrefs(); watchEditorHeight();
}
// ---- Editor preferences (#10): resizable height, fullscreen, font size, theme — persisted ----
function getEditorPrefs(){ try{ return JSON.parse(localStorage.getItem('tb_editor_prefs')||'{}'); }catch(e){ return {}; } }
function saveEditorPrefs(p){ try{ localStorage.setItem('tb_editor_prefs', JSON.stringify(p)); }catch(e){} }
function applyEditorPrefs(){
  const wrap=document.querySelector('.editor-wrap'); const p=getEditorPrefs();
  if(wrap && p.height) wrap.style.setProperty('--editor-h', p.height+'px');
  const fs=p.fontSize||13;
  if(mona){ try{ mona.updateOptions({fontSize:fs}); if(window.__monaco) window.__monaco.editor.setTheme(p.theme==='light'?'vs':'vs-dark'); }catch(e){} }
  const ta=document.getElementById('code'); if(ta) ta.style.fontSize=fs+'px';
}
function edFont(d){ const p=getEditorPrefs(); p.fontSize=Math.max(9,Math.min(30,(p.fontSize||13)+d)); saveEditorPrefs(p); applyEditorPrefs(); }
function edTheme(){ const p=getEditorPrefs(); p.theme=(p.theme==='light'?'dark':'light'); saveEditorPrefs(p); applyEditorPrefs(); }
function edFullscreen(){ const wrap=document.querySelector('.editor-wrap'); if(!wrap) return;
  const on=wrap.classList.toggle('fs'); document.body.style.overflow=on?'hidden':'';
  const btn=document.getElementById('ed-fs-btn'); if(btn) btn.textContent=on?'⤢ Exit full screen':'⛶ Full screen';
  if(mona){ try{ mona.layout(); }catch(e){} } }
let _edResizeT=null;
function watchEditorHeight(){
  const wrap=document.querySelector('.editor-wrap'); if(!wrap||!window.ResizeObserver||wrap._roAttached) return;
  wrap._roAttached=true;
  new ResizeObserver(()=>{ if(wrap.classList.contains('fs')) return;
    clearTimeout(_edResizeT); _edResizeT=setTimeout(()=>{ const h=Math.round(wrap.getBoundingClientRect().height);
      if(h>150){ const p=getEditorPrefs(); p.height=h; saveEditorPrefs(p); } }, 400); }).observe(wrap);
}
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ const w=document.querySelector('.editor-wrap.fs'); if(w){ w.classList.remove('fs'); document.body.style.overflow='';
  const b=document.getElementById('ed-fs-btn'); if(b) b.textContent='⛶ Full screen'; if(mona){ try{ mona.layout(); }catch(e){} } } } });
function getCode(){ return mona? mona.getValue() : (document.getElementById('code')?document.getElementById('code').value:''); }
function setCode(v){ if(mona) mona.setValue(v); else { const ta=document.getElementById('code'); if(ta) ta.value=v; } }
function setEditorLang(lang){ if(mona&&window.__monaco){ try{ window.__monaco.editor.setModelLanguage(mona.getModel(), monLang[lang]||'plaintext'); }catch(e){} } }

// ---------- AUTH ----------
function renderAuth(mode){
  mode = mode || 'login';
  userbar.innerHTML = '';
  app.innerHTML = `
    <div class="authwrap card">
      <div class="auth-logo"></div>
      <h1 style="text-align:center;margin-top:6px">Welcome to Talent Battle</h1>
      <p class="muted" style="text-align:center;margin-top:0">Sign in to practice, get judged, and track your progress.</p>
      <div class="authtabs">
        <button id="tab-login" class="${mode==='login'?'active':''}" onclick="renderAuth('login')">Log in</button>
        <button id="tab-reg" class="${mode==='register'?'active':''}" onclick="renderAuth('register')">Create account</button>
      </div>
      <div id="autherr" class="err"></div>
      ${mode==='login' ? `
        <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@college.edu"></div>
        <div class="field"><label>Password</label><input id="password" type="password"></div>
        <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Log in</button>
        <p style="margin-top:10px;font-size:12px;text-align:center"><a href="#" onclick="renderForgot();return false">Forgot your password?</a></p>
      ` : `
        <p class="muted" style="margin-top:0">The first account created becomes the administrator. After that, sign-ups are students.</p>
        <div class="field"><label>Full name</label><input id="name" placeholder="Rahul Sharma"></div>
        <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@college.edu"></div>
        <div class="field"><label>Password</label><input id="password" type="password" placeholder="at least 4 characters"></div>
        <div class="field"><label>Mobile number</label><input id="mobile" placeholder="9876543210"></div>
        <div class="field"><label>College</label><input id="college" placeholder="ABC Engineering College"></div>
        <div class="split"><div class="field"><label>Branch</label><input id="branch" placeholder="CSE"></div>
        <div class="field"><label>Year of passing</label><input id="yearOfPassing" placeholder="2027"></div></div>
        <button class="btn btn-primary" style="width:100%" onclick="doRegister()">Create account</button>
      `}
    </div>`;
}
function val(id){ const el=document.getElementById(id); return el?el.value:''; }
async function doLogin(){
  const { status, body } = await apiPost('/api/login', { email:val('email'), password:val('password') });
  if(status!==200){ document.getElementById('autherr').textContent = body.error||'Login failed'; return; }
  clearSavedCode();   // wipe any leftover code from a previous user on this (possibly shared) computer
  ME = body.user; await boot();
}
async function doRegister(){
  const { status, body } = await apiPost('/api/register', { role:val('role'), name:val('name'), email:val('email'),
    password:val('password'), mobile:val('mobile'), college:val('college'), branch:val('branch'), yearOfPassing:val('yearOfPassing') });
  if(status!==200){ document.getElementById('autherr').textContent = body.error||'Could not create account'; return; }
  clearSavedCode(); ME = body.user; await boot();
}
async function doLogout(){ await apiPost('/api/logout', {}); clearSavedCode(); ME=null; stopTimer(); renderAuth('login'); }
function renderDashOrHome(){ if(ME.role==='admin') renderAdminHome(); else if(ME.role==='subadmin') renderFaculty(); else renderDashboard(); }

// ---- My Profile (view account details) ----
async function renderProfile(){
  stopTimer();
  try{ const me=await apiGet('/api/me'); if(me && me.user) ME=me.user; }catch(e){}   // refresh (e.g. batch reassigned)
  const u=ME||{};
  const row=(label,val)=>`<div style="display:flex;padding:11px 0;border-bottom:1px solid var(--line)"><div style="width:190px;color:var(--muted)">${label}</div><div style="font-weight:600">${esc(val||'—')}</div></div>`;
  const isStudent = u.role==='student';
  app.innerHTML=`<h1>My Profile</h1>
    <p class="muted">Your account details.${isStudent?' To change your college, branch or batch, contact your administrator.':''}</p>
    <div class="card" style="max-width:580px">
      ${row('Name', u.name)}
      ${row('Email', u.email)}
      ${row('Role', u.role)}
      ${isStudent?row('Contact number', u.mobile):''}
      ${isStudent?row('College', u.college):''}
      ${isStudent?row('Branch', u.branch):''}
      ${isStudent?row('Year of passing', u.yearOfPassing):''}
      ${isStudent?row('Batch assigned', u.batch):''}
      <div style="margin-top:16px"><button class="btn btn-ghost" onclick="renderChangePassword()">Change password</button></div>
    </div>`;
}

// ---- Password: forced change on first login (temporary/admin-issued password) ----
function renderForceChange(){
  userbar.innerHTML='';
  app.innerHTML=`<div class="authwrap card">
    <div class="auth-logo"></div>
    <h1 style="text-align:center;margin-top:6px">Set your password</h1>
    <p class="muted" style="text-align:center;margin-top:0">You're signed in with a temporary password. Choose a new one to continue.</p>
    <div id="autherr" class="err"></div>
    <div class="field"><label>New password</label><input id="np1" type="password" placeholder="at least 6 characters"></div>
    <div class="field"><label>Confirm new password</label><input id="np2" type="password"></div>
    <button class="btn btn-primary" style="width:100%" onclick="doForceChange()">Save &amp; continue</button>
  </div>`;
}
async function doForceChange(){
  const a=val('np1'), b=val('np2'), err=document.getElementById('autherr');
  if(a.length<6){ err.textContent='Password must be at least 6 characters.'; return; }
  if(a!==b){ err.textContent='Passwords do not match.'; return; }
  const { status, body }=await apiPost('/api/change-password',{ newPassword:a });
  if(status!==200){ err.textContent=body.error||'Could not set password'; return; }
  ME.mustChange=false; toast('Password updated ✓'); await boot();
}

// ---- Password: self-service change (logged in, from the top bar) ----
function renderChangePassword(){
  stopTimer();
  app.innerHTML=`<div class="authwrap card">
    <h1 style="margin-top:6px">Change password</h1>
    <div id="autherr" class="err"></div>
    <div class="field"><label>Current password</label><input id="cp" type="password"></div>
    <div class="field"><label>New password</label><input id="np1" type="password" placeholder="at least 6 characters"></div>
    <div class="field"><label>Confirm new password</label><input id="np2" type="password"></div>
    <div style="margin-top:8px"><button class="btn btn-primary" onclick="doChangePassword()">Update password</button>
    <button class="btn btn-ghost" style="margin-left:8px" onclick="renderDashOrHome()">Cancel</button></div>
  </div>`;
}
async function doChangePassword(){
  const cur=val('cp'), a=val('np1'), b=val('np2'), err=document.getElementById('autherr');
  if(a.length<6){ err.textContent='New password must be at least 6 characters.'; return; }
  if(a!==b){ err.textContent='Passwords do not match.'; return; }
  const { status, body }=await apiPost('/api/change-password',{ currentPassword:cur, newPassword:a });
  if(status!==200){ err.textContent=body.error||'Could not update password'; return; }
  toast('Password updated ✓'); renderDashOrHome();
}

// ---- Password: forgot (request a reset email) ----
function renderForgot(){
  userbar.innerHTML='';
  app.innerHTML=`<div class="authwrap card">
    <div class="auth-logo"></div>
    <h1 style="text-align:center;margin-top:6px">Forgot password</h1>
    <p class="muted" style="text-align:center;margin-top:0">Enter your account email. If it's registered, we'll send a reset link.</p>
    <div id="autherr" class="err"></div>
    <div id="forgot-ok" style="display:none;color:#0a7d33;font-size:13px;margin-bottom:8px;text-align:center">If that email is registered, a reset link is on its way. Check your inbox (and spam).</div>
    <div class="field"><label>Email</label><input id="femail" type="email" placeholder="you@college.edu"></div>
    <button class="btn btn-primary" style="width:100%" onclick="doForgot()">Send reset link</button>
    <p style="margin-top:10px;font-size:12px;text-align:center"><a href="#" onclick="renderAuth('login');return false">← Back to log in</a></p>
  </div>`;
}
async function doForgot(){
  const email=val('femail'), err=document.getElementById('autherr');
  if(!email){ err.textContent='Please enter your email.'; return; }
  await apiPost('/api/forgot-password',{ email });
  err.textContent=''; document.getElementById('forgot-ok').style.display='block';
}

// ---- Password: reset via emailed token (#reset=TOKEN) ----
function renderReset(token){
  userbar.innerHTML='';
  app.innerHTML=`<div class="authwrap card">
    <div class="auth-logo"></div>
    <h1 style="text-align:center;margin-top:6px">Choose a new password</h1>
    <div id="autherr" class="err"></div>
    <div class="field"><label>New password</label><input id="np1" type="password" placeholder="at least 6 characters"></div>
    <div class="field"><label>Confirm new password</label><input id="np2" type="password"></div>
    <button class="btn btn-primary" style="width:100%" onclick="doReset('${token}')">Set new password</button>
  </div>`;
}
async function doReset(token){
  const a=val('np1'), b=val('np2'), err=document.getElementById('autherr');
  if(a.length<6){ err.textContent='Password must be at least 6 characters.'; return; }
  if(a!==b){ err.textContent='Passwords do not match.'; return; }
  const { status, body }=await apiPost('/api/reset-password',{ token, newPassword:a });
  if(status!==200){ err.textContent=body.error||'Could not reset password'; return; }
  try{ history.replaceState(null,'',location.pathname); }catch(e){} location.hash='';
  toast('Password updated — please log in.'); renderAuth('login');
}

function renderUserbar(){
  let nav = '';
  if(ME.role==='admin'){
    nav = `<button onclick="renderAdminQuestions()">Questions</button>
           <button onclick="renderBatches()">Batches</button>
           <button onclick="renderStudents()">Students</button>
           <button onclick="renderSubadmins()">Sub-Admins</button>
           <button onclick="renderFaculty()">Results</button>
           <button onclick="renderStaffTests()">Test Analytics</button>
           <button onclick="renderReports()">Reports</button>
           <button onclick="renderList()">Preview</button>`;
  } else if(ME.role==='subadmin'){
    nav = `<button onclick="renderFaculty()">Results</button>
           <button onclick="renderStaffTests()">Test Analytics</button>`;
  } else {
    const f = ME.features || {};
    const on = (k)=> f[k] !== false;   // default on if not specified
    const items = [];
    if(on('tests')){ items.push('<button onclick="renderStudentTests()">My Tests</button>'); items.push('<button onclick="renderMyResults()">My Results</button>'); }
    if(on('contests')) items.push('<button onclick="renderContests()">Contests</button>');
    if(on('challenge')) items.push('<button onclick="renderChallenge()">100 Days</button>');
    if(on('leaderboard')) items.push('<button onclick="renderLeaderboard()">Leaderboard</button>');
    if(on('problems')) items.push('<button onclick="renderList()">All Problems</button>');
    items.push('<button onclick="renderDashboard()">My Dashboard</button>');
    nav = items.join('');
  }
  userbar.innerHTML = `<nav>${nav}</nav>
    <span class="who" onclick="renderProfile()" style="cursor:pointer" title="My profile">${esc(ME.name)} · ${esc(ME.role)}</span>
    <button class="btn btn-ghost" onclick="renderProfile()">My Profile</button>
    <button class="btn btn-ghost" onclick="renderChangePassword()">Change password</button>
    <button class="btn btn-ghost" onclick="doLogout()">Log out</button>`;
}

// ---------- PROBLEM LIST ----------
function renderList(){
  stopTimer();
  const allTags=[...new Set(PROBLEMS.flatMap(p=>p.tags||[]))].sort();
  const tagOpts='<option value="">All topics</option>'+allTags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  app.innerHTML = `<h1>Coding Problems</h1>
    <div class="filters">
      <input id="q-search" placeholder="Search problems…" oninput="applyFilter()">
      <select id="q-diff" onchange="applyFilter()"><option value="">All difficulty</option><option>easy</option><option>medium</option><option>hard</option></select>
      <select id="q-topic" onchange="applyFilter()">${tagOpts}</select>
    </div>
    <div class="plist" id="plist" style="margin-top:14px"></div>`;
  applyFilter();
}
function applyFilter(){
  const sv=(document.getElementById('q-search')?document.getElementById('q-search').value:'').toLowerCase();
  const d=document.getElementById('q-diff')?document.getElementById('q-diff').value:'';
  const t=document.getElementById('q-topic')?document.getElementById('q-topic').value:'';
  const rows=PROBLEMS.filter(p=> (!d||p.difficulty===d) && (!t||(p.tags||[]).includes(t)) &&
      (!sv||p.title.toLowerCase().includes(sv)||(p.tags||[]).join(' ').toLowerCase().includes(sv)))
    .map(p=>`<div class="card prow" onclick="openProblem('${p.id}')">
      <div><div class="t">${esc(p.title)}</div><div class="tags">${esc((p.tags||[]).join(' · '))}</div></div>
      <span class="grow"></span><span class="pill ${pillClass(p.difficulty)}">${esc(p.difficulty)}</span>
      <button class="btn btn-ghost">Solve →</button></div>`).join('') || '<p class="muted">No problems match your search.</p>';
  const el=document.getElementById('plist'); if(el) el.innerHTML=rows;
}

// ---------- TEST SCREEN ----------
async function openProblem(id){
  let r=await fetch('/api/problems/'+id);
  if(!r.ok) r=await fetch('/api/challenge/'+id);
  if(!r.ok){ toast('Problem not found'); return; }
  renderTest(await r.json());
}
function langOptions(){ return Object.keys(LANGS.labels).map(k=>{ const ok=LANGS.available[k];
  return `<option value="${k}" ${ok?'':'disabled'}>${esc(LANGS.labels[k])}${ok?'':' (not installed here)'}</option>`; }).join(''); }
const firstAvailableLang = () => Object.keys(LANGS.available).find(k=>LANGS.available[k]) || 'python';

function renderTest(d){
  stopTimer();
  const samplesHtml = (d.samples||[]).map((sm,i)=>`<div class="io"><b>Example ${i+1} · Input</b>${esc((sm.input||'').trim())}</div><div class="io"><b>Example ${i+1} · Output</b>${esc((sm.expected||'').trim())}</div>`).join('') || '<p class="muted">No public examples.</p>';
  curProblem = d;
  const inTest = !!window.__test;
  if(examMode && examKind==='test') userbar.innerHTML='';   // hide the top nav during a Test
  const qpos = inTest ? ` — Question ${window.__test.idx+1} of ${window.__test.questions.length}` : '';
  const fnMode = !!(d.meta && d.meta.mode==='function');
  const availLangs = (fnMode ? (d.functionLangs||[]) : Object.keys(LANGS.labels)).filter(k=>LANGS.available[k]);
  const startLang = availLangs[0] || firstAvailableLang();
  const langOpts = (availLangs.length?availLangs:Object.keys(LANGS.labels).filter(k=>LANGS.available[k])).map(k=>`<option value="${k}">${esc(LANGS.labels[k]||k)}</option>`).join('');
  app.innerHTML = `
    ${examMode?`<div class="exambar" style="font-size:15px;font-weight:600">🔒 Exam in progress${qpos}. Full screen required · copy/paste &amp; tab-switch are disabled and recorded.</div>`:''}
    ${inTest?`<div class="qnav"><div class="qpalette" id="qpalette">${paletteHTML()}</div>
      <span class="grow"></span>
      <button class="btn btn-ghost" onclick="examPrev()">← Prev</button>
      <button class="btn btn-ghost" onclick="examNext()">Next →</button>
      <button class="btn btn-primary" onclick="confirmFinishTest()">Finish test</button></div>`:''}
    <div class="test-top">
      ${examMode?'':`<button class="btn btn-ghost" onclick="renderList()">← Problems</button>`}
      <span class="proctor" id="proctor-badge" ${examMode?'style="font-size:16px;font-weight:800;padding:7px 14px"':''}>Proctoring: on</span>
      <div class="timer" id="timer">30:00</div>
    </div>
    <div class="split">
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <h2 style="margin:0">${esc(d.meta.title)}</h2>
          <span class="pill ${pillClass(d.meta.difficulty)}">${esc(d.meta.difficulty)}</span></div>
        <div class="muted" style="margin-bottom:8px">${esc((d.meta.tags||[]).join(' · '))}</div>
        <div>${renderStatement(d.statement)}</div>
        ${samplesHtml}
      </div>
      <div class="card">
        <div class="toolbar">
          <select id="lang" onchange="onLangChange()">${langOpts}</select>
          <span class="grow"></span>
          <button class="btn btn-ghost" onclick="doRun('${d.meta.id}')">▷ Run</button>
          <button class="btn btn-primary" onclick="${inTest?`doExamSubmit('${d.meta.id}')`:`doSubmit('${d.meta.id}')`}">${inTest?'Submit this question':'Submit'}</button>
          ${(ME&&ME.role!=='student')?`<button class="btn btn-ghost" onclick="viewSolution('${d.meta.id}')">Solution</button>`:''}
        </div>
        <div class="editor-wrap">
          <div class="editor-bar"><span class="dots"><i></i><i></i><i></i></span><span class="editor-file" id="editor-file">main.py</span><span class="grow"></span><button class="ed-btn" type="button" onclick="edFont(-1)" title="Smaller font">A−</button><button class="ed-btn" type="button" onclick="edFont(1)" title="Larger font">A+</button><button class="ed-btn" type="button" onclick="edTheme()" title="Toggle editor light/dark">🌓</button><button class="ed-btn" type="button" id="ed-fs-btn" onclick="edFullscreen()" title="Full screen (Esc to exit)">⛶ Full screen</button></div>
          <div id="mona" class="mona" style="display:none"></div>
          <textarea class="editor" id="code" spellcheck="false"></textarea>
        </div>
        <details class="custom-box"><summary>▸ Custom input — test with your own input</summary>
          <textarea id="custom-in" class="io-in" style="height:70px;width:100%;margin-top:8px" placeholder="type input here"></textarea>
          <button class="btn btn-ghost" onclick="runCustom()">Run with this input</button>
        </details>
        <div class="results card" id="results" style="background:#fffdf8">
          <div class="muted">Click <b>Run</b> to test the sample, or <b>Submit</b> to grade everything.</div>
        </div>
      </div>
    </div>`;
  document.getElementById('lang').value = startLang;
  const ef=document.getElementById('editor-file'); if(ef) ef.textContent = fileFor[startLang]||'main';
  // Fresh per-language memory for this problem. Restore only THIS user's own saved
  // code for this problem+language (never another student's) so a reload never loses work (#3).
  curLang = startLang; langCode = {};
  let initial = starterFor(startLang);
  try{ const saved=localStorage.getItem(codeKey(d.meta.id, startLang)); if(saved!=null && saved.trim()) initial=saved; }catch(e){}
  langCode[startLang]=initial;
  mountEditor(initial, startLang);
  startTimer(); if(!advancing) startProctor(); updateProctorBadge();
  if(examMode) startExam();
  advancing=false;   // the next-question render is complete; future renders may tear down normally
}
function renderStatement(md){
  let x = esc(md||'');
  x = x.replace(/```([\s\S]*?)```/g, (m,c)=>'<pre class="io">'+c.replace(/^\n/,'')+'</pre>');
  x = x.replace(/^\s{0,3}#{1,6}\s*(.+?)\s*$/gm, '<h4 style="margin:12px 0 4px">$1</h4>');
  x = x.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
  x = x.replace(/!\[[^\]]*\]\(([^)]+)\)/g, '<img src="$1" style="max-width:100%;border-radius:8px;margin:8px 0">');
  x = x.replace(/^\s*[-*]\s+(.+)$/gm, '• $1');
  x = x.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  return x;
}
function renderSolutions(solutions, tc, sc){
  const L={python:'Python',cpp:'C++',java:'Java',javascript:'JavaScript',c:'C',ruby:'Ruby',php:'PHP',go:'Go',rust:'Rust',bash:'Bash'};
  let h='';
  if(tc||sc) h+=`<div class="cxrow">${tc?`<span class="cxbadge">⏱ Time: ${esc(tc)}</span>`:''}${sc?`<span class="cxbadge">💾 Space: ${esc(sc)}</span>`:''}</div>`;
  const langs=Object.keys(solutions||{}).filter(k=>solutions[k] && String(solutions[k]).trim());
  if(!langs.length) h+='<p class="muted">No solution provided.</p>';
  else h+=langs.map(k=>`<div class="muted" style="margin-top:8px">${esc(L[k]||k)}</div><pre class="code">${esc(solutions[k])}</pre>`).join('');
  return h;
}
const fileFor={python:'main.py',cpp:'main.cpp',c:'main.c',java:'Main.java',javascript:'main.js',bash:'main.sh',go:'main.go',ruby:'main.rb',php:'main.php',rust:'main.rs'};
function onLangChange(){
  const k=document.getElementById('lang').value;
  const id = curProblem && curProblem.meta && curProblem.meta.id;
  // Keep what the student wrote under the PREVIOUS language, then show this language's
  // own code (or its starter) — so switching Java→Python no longer shows the Java code.
  if(curLang && curLang!==k){
    const cur=getCode(); langCode[curLang]=cur;
    if(id) try{ localStorage.setItem(codeKey(id,curLang),cur); }catch(e){}
  }
  curLang=k;
  let next = (langCode[k]!=null)?langCode[k]:null;
  if(next==null && id){ try{ const s=localStorage.getItem(codeKey(id,k)); if(s!=null && s.trim()) next=s; }catch(e){} }
  if(next==null) next=starterFor(k);
  setCode(next); langCode[k]=next;
  setEditorLang(k);
  const ef=document.getElementById('editor-file'); if(ef) ef.textContent=fileFor[k]||'main';
}
function startTimer(){
  // A Test with a time limit counts down to a fixed server deadline (so it can't
  // be reset by re-opening, and it spans all questions). Otherwise a plain 30:00.
  const deadline = (window.__test && window.__test.deadline) ? window.__test.deadline : 0;
  let t=30*60;
  timer=setInterval(()=>{
    let m,s;
    if(deadline){
      const remain=Math.max(0, Math.round((deadline-Date.now())/1000));
      m=Math.floor(remain/60); s=remain%60;
      if(remain<=0){ clearInterval(timer); timer=null;
        const el=document.getElementById('timer'); if(el) el.textContent='00:00';
        if(examMode && examKind==='test' && window.__test && !window.__autoSubmitting){ window.__autoSubmitting=true; toast('⏰ Time is up — submitting your test'); finishTest(true); }
        return; }
    } else { if(t>0)t--; m=Math.floor(t/60); s=t%60; }
    const el=document.getElementById('timer'); if(el) el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  },1000);
}

function verdictRow(r){ const cls=r.verdict==='Accepted'?'ok':'bad'; const name=r.hidden?'Hidden test '+r.index:'Sample test '+r.index;
  const t = r.timeMs!=null?` <span class="muted">· ${r.timeMs} ms</span>`:'';
  let extra=''; if(r.verdict!=='Accepted' && r.got!==undefined) extra=` <span class="muted">got "${esc((r.got||'').trim().slice(0,80))}", expected "${esc((r.expected||'').trim().slice(0,80))}"</span>`;
  const err = (r.verdict!=='Accepted' && r.stderr) ? `<pre class="code" style="margin:3px 0 7px;max-height:140px;font-size:11.5px;white-space:pre-wrap">${esc(String(r.stderr).slice(0,600))}</pre>` : '';
  return `<div class="row"><span class="dot ${cls}"></span>${name}: <b>&nbsp;${esc(r.verdict)}</b>${t}${extra}</div>${err}`; }
// Rich per-case card for the submission dashboard (#6 hidden review, #11, #12 runtime).
function caseCard(r){
  const ok = r.verdict==='Accepted';
  const name = (r.hidden?'Hidden':'Public')+' test '+r.index;
  const meta = []; if(r.timeMs!=null) meta.push(r.timeMs+' ms');
  meta.push(r.memoryKb!=null ? (Math.round(r.memoryKb/102.4)/10+' MB') : 'mem —');
  const head = `<div class="tcase-head"><span class="dot ${ok?'ok':'bad'}"></span><b>${esc(name)}</b>`+
    `<span class="pill ${ok?'pill-easy':'pill-hard'}" style="margin-left:6px">${esc(r.verdict)}</span>`+
    `<span class="grow"></span><span class="muted" style="font-size:12px">${meta.join(' · ')}</span></div>`;
  let body='';
  if(!ok){
    const col=(lab,val,cls)=>`<div class="diffcol"><div class="muted">${lab}</div><pre class="code ${cls||''}">${esc(String(val==null?'':val).replace(/\s+$/,''))||'(empty)'}</pre></div>`;
    body = `<div class="diffwrap">${col('Input',r.input)}${col('Expected',r.expected)}${col('Your output',r.got,'bad-out')}</div>`+
      (r.stderr?`<div class="muted" style="margin-top:6px">stderr</div><pre class="code">${esc(r.stderr)}</pre>`:'');
  }
  return `<div class="tcase ${ok?'':'tcase-fail'}">${head}${body}</div>`;
}

async function doRun(id){ const res=document.getElementById('results'); res.innerHTML='<div class="muted">Running sample…</div>';
  const { status, body:out } = await apiPost('/api/run',{ problemId:id, language:val('lang'), code:getCode() });
  if(status>=500 || !out || !out.results){ res.innerHTML=`<div class="row"><span class="dot bad"></span>${esc((out&&out.note)||'The judge is busy — please try Run again in a few seconds.')}</div>`; return; }
  if(out.overall==='Language Unavailable'){ res.innerHTML=`<div class="row"><span class="dot bad"></span>${esc(out.note)}</div>`; return; }
  if(out.overall==='Compilation Error'){ res.innerHTML=`<div class="row"><span class="dot bad"></span><b>Compilation Error</b></div><pre class="code">${esc((out.compileOutput||'').slice(0,600))}</pre>`; return; }
  res.innerHTML='<div class="muted" style="margin-bottom:4px">Sample result</div>'+out.results.map(verdictRow).join(''); }

async function doSubmit(id){ const res=document.getElementById('results'); res.innerHTML='<div class="muted">Judging all tests…</div>';
  window.__lastSubmit = { id, language: val('lang'), code: getCode() };   // for the complexity analysis card
  try{ localStorage.setItem(codeKey(id, curLang||val('lang')), getCode()); }catch(e){}   // preserve work so it is never lost (#3)
  let resp;
  try{ resp = await apiPost('/api/submit',{ problemId:id, language:val('lang'), code:getCode(), practice: !examMode,
    flags:{ tabSwitches:proctor.tab, pasteAttempts:proctor.paste, fullscreenExits:proctor.fs, copyBlocks:proctor.copy, cameraLost:proctor.cam } }); }
  catch(e){ res.innerHTML='<div class="row"><span class="dot bad"></span>Network error — your code is safe. Please try Submit again.</div>'; return; }
  const { status, body:out } = resp;
  if(status===401){ alert('Please log in again.'); renderAuth('login'); return; }
  if(!out || status>=500){ res.innerHTML='<div class="row"><span class="dot bad"></span>The judge could not process this submission. Your code is preserved — please try again.</div>'; return; }
  // Use the already-loaded problem for the feedback header. (Re-fetching /api/problems
  // 404s for 100-Days challenge IDs, which used to crash renderFeedback and leave the
  // page stuck with the editor gone — the "100 Days hang after submit" bug.)
  let meta = (curProblem && curProblem.meta) ? curProblem : null;
  if(!meta){ let r=await fetch('/api/problems/'+id); if(!r.ok) r=await fetch('/api/challenge/'+id);
    meta = r.ok ? await r.json() : { meta:{ id:id, title:'' } }; }
  renderFeedback(meta, out); }

// ---------- FEEDBACK ----------
function renderFeedback(d,out){
  stopTimer();
  if(out.overall==='Language Unavailable'){ alert(out.note); return; }
  const pass = out.overall==='Accepted'; const fb = out.feedback||{};
  const _chm = /^D(\d+)$/.exec((d.meta&&d.meta.id)||''); const nextId = (_chm && Number(_chm[1])<100) ? 'D'+String(Number(_chm[1])+1).padStart(3,'0') : null;
  const results = out.results||[];
  const pub = results.filter(r=>!r.hidden), hidden = results.filter(r=>r.hidden);
  const times = results.map(r=>r.timeMs).filter(x=>x!=null);
  const maxT = times.length?Math.max(...times):null, sumT = times.reduce((a,b)=>a+(b||0),0);
  const hiddenPass = hidden.filter(r=>r.verdict==='Accepted').length;
  const mems = results.map(r=>r.memoryKb).filter(x=>x!=null);
  const maxMem = mems.length?Math.max(...mems):null;
  const statTiles = `<div class="fbstats">`+
    `<div class="fbstat"><div class="v">${out.passed}/${out.total}</div><div class="l">Tests passed</div></div>`+
    `<div class="fbstat"><div class="v">${maxT!=null?maxT+' ms':'—'}</div><div class="l">Slowest test</div></div>`+
    `<div class="fbstat"><div class="v">${sumT} ms</div><div class="l">Total runtime</div></div>`+
    `<div class="fbstat"><div class="v">${maxMem!=null?(Math.round(maxMem/102.4)/10+' MB'):'—'}</div><div class="l">Peak memory</div></div>`+
    (hidden.length?`<div class="fbstat"><div class="v">${hiddenPass}/${hidden.length}</div><div class="l">Hidden passed</div></div>`:'')+
    `</div>`;
  app.innerHTML = `
    <div class="test-top">
      <button class="btn btn-ghost" onclick="renderList()">← Problems</button>
      <button class="btn btn-ghost" onclick="openProblem('${d.meta.id}')">↻ Re-attempt</button>
      ${nextId?`<button class="btn btn-primary" onclick="openChallenge('${nextId}')">Next day →</button>`:''}</div>
    <div class="scorecard ${pass?'':'fail'}">
      <div class="score-big">${out.score||0}<span style="font-size:16px;color:#8a836f">/100</span></div>
      <div><b>${esc(out.overall)}</b> — ${out.passed} of ${out.total} tests passed<br>
        <span class="muted">${esc(d.meta.title)}</span></div></div>
    <div class="tabs">
      <div class="tab active" data-p="fp1">What happened</div>
      <div class="tab" data-p="fp2">Correct solution</div>
      <div class="tab" data-p="fp3">How to improve</div>
      <div class="tab" data-p="fp4">Rank &amp; compare</div></div>
    <div class="pane active" id="fp1">${fb.summary?`<p>${esc(fb.summary)}</p>`:''}
      ${statTiles}
      ${pub.length?`<h3 class="fbsec">Public tests</h3>${pub.map(caseCard).join('')}`:''}
      ${hidden.length?`<h3 class="fbsec">Hidden tests <span class="muted" style="font-weight:400;font-size:12px">— ${hiddenPass}/${hidden.length} passed</span></h3>${hidden.map(caseCard).join('')}`:''}
    </div>
    <div class="pane" id="fp2">${renderSolutions(fb.solutions, fb.timeComplexity, fb.spaceComplexity)}</div>
    <div class="pane" id="fp3">
      <div id="cxbox" class="cxbox"></div>
      <p class="muted" style="margin-top:12px">${esc((fb.improve&&fb.improve.note)||'')}</p></div>
    <div class="pane" id="fp4"><div class="muted">Loading ranking…</div></div>`;
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active')); t.classList.add('active');
    document.getElementById(t.dataset.p).classList.add('active'); });
  loadRanking(d.meta&&d.meta.id);
  loadComplexity(d, fb);
}
// AI complexity analysis (#7). Falls back to the problem's static complexity when AI is off.
async function loadComplexity(d, fb){
  const el=document.getElementById('cxbox'); if(!el) return;
  const id = d && d.meta && d.meta.id; const ls = window.__lastSubmit;
  const staticCx = (fb && (fb.timeComplexity||fb.spaceComplexity))
    ? `<div class="cxrow">${fb.timeComplexity?`<span class="cxbadge">⏱ Time: ${esc(fb.timeComplexity)}</span>`:''}${fb.spaceComplexity?`<span class="cxbadge">💾 Space: ${esc(fb.spaceComplexity)}</span>`:''}</div>`
    : '';
  if(!ls || ls.id!==id || !ls.code){ el.innerHTML = staticCx; return; }
  el.innerHTML='<div class="muted">Analyzing your solution’s complexity…</div>';
  let r=null; try{ const resp=await apiPost('/api/analyze-complexity',{ problemId:id, language:ls.language, code:ls.code }); r=resp.body; }catch(e){ r=null; }
  if(!r || !r.available){ el.innerHTML = staticCx; return; }
  const conf = (r.confidence!=null)?`<span class="muted" style="font-weight:400;font-size:12px"> · ${r.confidence}% confidence</span>`:'';
  const sugg = (r.suggestions&&r.suggestions.length)
    ? `<h3 class="fbsec">Optimization ideas</h3><ul class="cxsug">${r.suggestions.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>` : '';
  el.innerHTML = `
    <h3 class="fbsec">Complexity analysis${conf}</h3>
    <div class="cxrow"><span class="cxbadge">⏱ Time: ${esc(r.time)}</span>${r.space?`<span class="cxbadge">💾 Space: ${esc(r.space)}</span>`:''}</div>
    ${r.explanation?`<p style="margin:8px 0 4px">${esc(r.explanation)}</p>`:''}
    ${sugg}
    <p class="muted" style="font-size:11px;margin-top:8px">AI-estimated${r.cached?' · cached':''} — guidance, not a grade.</p>`;
}
// Per-problem ranking + runtime comparison + language distribution (#13).
async function loadRanking(id){
  const el=document.getElementById('fp4'); if(!el||!id) return;
  let r; try{ r=await apiGet('/api/problem-rank/'+id); }catch(e){ r=null; }
  if(!r){ el.innerHTML='<p class="muted">Ranking is not available yet.</p>'; return; }
  const rt=r.runtime||{}; const mx=Math.max(rt.your||0, rt.avg||0, rt.best||0)||1;
  const bar=(label,val)=>{ const pct=val==null?0:Math.round((val/mx)*100);
    return `<div class="cmprow"><span class="cmpl">${label}</span><div class="track"><i style="width:${Math.max(4,pct)}%"></i></div><b>${val==null?'—':val+' ms'}</b></div>`; };
  const langs=Object.entries(r.langDist||{}).sort((a,b)=>b[1]-a[1]);
  const langTotal=langs.reduce((a,x)=>a+x[1],0)||1;
  el.innerHTML=`
    <div class="fbstats">
      <div class="fbstat"><div class="v">${r.rank?('#'+r.rank):'—'}</div><div class="l">Your rank${r.totalStudents?(' of '+r.totalStudents):''}</div></div>
      <div class="fbstat"><div class="v">${r.your&&r.your.runtimeMs!=null?r.your.runtimeMs+' ms':'—'}</div><div class="l">Your runtime</div></div>
      <div class="fbstat"><div class="v">${rt.best!=null?rt.best+' ms':'—'}</div><div class="l">Best runtime</div></div>
    </div>
    <h3 class="fbsec">Runtime vs others</h3>
    ${bar('You',rt.your)}${bar('Average',rt.avg)}${bar('Best',rt.best)}
    <h3 class="fbsec">Language distribution <span class="muted" style="font-weight:400;font-size:12px">— ${r.totalSubmissions||0} submissions</span></h3>
    ${langs.length?langs.map(x=>{const pct=Math.round(x[1]/langTotal*100);return `<div class="cmprow"><span class="cmpl">${esc(x[0])}</span><div class="track"><i style="width:${Math.max(4,pct)}%"></i></div><b>${pct}%</b></div>`;}).join(''):'<p class="muted">No submissions yet.</p>'}`;
}
function copyRef(){ const t=document.getElementById('refcode').innerText; navigator.clipboard&&navigator.clipboard.writeText(t); }

// ---------- STUDENT DASHBOARD ----------
async function renderDashboard(){ stopTimer();
  const f = ME.features||{}, on=(k)=> f[k]!==false;   // per-batch module toggles
  const [d, ch, g] = await Promise.all([apiGet('/api/dashboard'), apiGet('/api/challenge').catch(()=>({days:[]})), apiGet('/api/gamify').catch(()=>({}))]);
  const daysSolved = (ch.days||[]).filter(x=>x.solved).length;
  const rows = Object.entries(d.problems||{}).map(([id,x])=>`
    <div class="skill"><div class="r"><span>${esc(x.title)}</span><span>${x.best}/100 · ${x.attempts} tries</span></div>
    <div class="track"><i style="width:${x.best}%"></i></div></div>`).join('') || '<p class="muted">No submissions yet — go solve a problem!</p>';
  const st=(v,l)=>`<div class="statcard" style="cursor:default"><div class="statval">${v}</div><div class="statlabel">${l}</div></div>`;
  const xp=g.xp||0, level=g.level||1, xpToNext=(g.xpToNext==null?100:g.xpToNext);
  const badges=(g.badges||[]).map(b=>`<span class="chip">${b.icon} ${esc(b.name)}</span>`).join('') || '<span class="muted">Solve problems to earn badges.</span>';
  const daily = (on('challenge') && g.daily)? `<div class="card prow" onclick="openChallenge('${g.daily.id}')" style="margin-bottom:14px">
      <div><div class="t">🌟 Daily Challenge — ${esc(g.daily.title)}</div><div class="tags">Today's pick — solve it to keep your streak</div></div>
      <span class="grow"></span><span class="pill ${pillClass(g.daily.difficulty)}">${esc(g.daily.difficulty)}</span><button class="btn btn-primary">Solve →</button></div>` : '';
  // Getting-started guide — steps adapt to which modules this batch has enabled.
  const steps=[];
  if(on('tests')) steps.push(['Take your Tests','Open <b>My Tests</b> and start an assigned test. Questions appear one at a time and each test is a single timed sitting.']);
  steps.push(['Write, Run &amp; Submit','Pick your language and write your solution. Press <b>▷ Run</b> to check the sample, then <b>Submit</b> to grade it against every test case.']);
  const practice=[on('challenge')?'<b>100 Days of Code</b>':'', on('problems')?'<b>All Problems</b>':''].filter(Boolean).join(' and ');
  if(practice) steps.push(['Practice anytime',`Sharpen your skills in ${practice} — solve freely, no time pressure.`]);
  if(on('tests')) steps.push(['Check your scores','Your results for completed tests are saved under <b>My Results</b> so you can review them anytime.']);
  const guide=`<div class="guide">
    <h2>👋 Getting started</h2>
    <p class="muted" style="margin:3px 0 0">A quick guide to using Talent Battle.</p>
    <div class="guide-steps">
      ${steps.map((s,i)=>`<div class="guide-step"><div class="guide-num">${i+1}</div><div><div class="st">${s[0]}</div><div class="sd">${s[1]}</div></div></div>`).join('')}
    </div>
    ${on('tests')?`<div class="guide-note">🔒 <b>During a proctored test:</b> allow your camera, stay in full screen, keep your face visible, and don't switch tabs or copy/paste. After <b>4 warnings the test submits automatically</b> — so stay focused and finish calmly. Whatever you've submitted is saved.</div>`:''}
  </div>`;
  app.innerHTML = `
    ${guide}
    <div class="hero">
      <div><h1 style="margin:0">Hi ${esc(ME.name.split(' ')[0])} 👋</h1>
        <p class="muted" style="margin:4px 0 0">Level ${level} · ${xp} XP · ${xpToNext} XP to next level</p>
        <div class="track" style="width:240px;margin-top:8px"><i style="width:${100-xpToNext}%"></i></div></div>
      <div style="text-align:center"><div style="font-size:30px;line-height:1">🔥 ${g.streak||0}</div><div class="statlabel">day streak</div></div>
    </div>
    <div class="statgrid">
      ${st(d.solved||0,'Problems solved')}
      ${st(xp,'XP')}
      ${on('leaderboard')?st('#'+(g.rank||'—'),'Leaderboard rank'):''}
      ${on('challenge')?st(daysSolved+' / 100','100 Days progress'):''}
    </div>
    ${daily}
    <div class="card" style="margin:14px 0"><h2>Badges</h2><div class="qa">${badges}</div></div>
    <div class="qa" style="margin:16px 0">
      ${on('tests')?'<button class="btn btn-primary" onclick="renderStudentTests()">My Tests</button>':''}
      ${on('challenge')?'<button class="btn btn-ghost" onclick="renderChallenge()">100 Days</button>':''}
      ${on('leaderboard')?'<button class="btn btn-ghost" onclick="renderLeaderboard()">Leaderboard</button>':''}
      ${on('problems')?'<button class="btn btn-ghost" onclick="renderList()">All Problems</button>':''}
    </div>
    <div class="card"><h2>Best score per problem</h2>${rows}</div>`;
}

async function renderLeaderboard(){ stopTimer();
  const d = await apiGet('/api/leaderboard'); lastLeaderboard = (d.top||[]);
  const rows = (d.top||[]).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.batch)}</td><td>${r.xp}</td><td>${r.level}</td><td>${r.solved}</td><td>🔥 ${r.streak}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No submissions yet.</td></tr>';
  app.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Leaderboard</h1><span class="grow"></span>${ME.role!=='student'?'<button class="btn btn-ghost" onclick="exportLeaderboard()">Export CSV</button>':''}</div><p class="muted">Top students by XP.</p>
    <div class="card"><table><tr><th>#</th><th>Student</th><th>Batch</th><th>XP</th><th>Level</th><th>Solved</th><th>Streak</th></tr>${rows}</table></div>`;
}

// ---------- ADMIN HOME (overview) ----------
async function renderAdminHome(){ stopTimer();
  const d = await apiGet('/api/admin/overview');
  const stat=(label,val)=>`<div class="statcard" style="cursor:default"><div class="statval">${val}</div><div class="statlabel">${label}</div></div>`;
  const hub=(title,desc,openFn,newFn,newLabel)=>`<div class="hubcard"><div class="hubtitle">${title}</div><div class="hubdesc">${desc}</div><div class="hubactions"><button class="btn btn-ghost" onclick="${openFn}">Open</button>${newFn?`<button class="btn btn-primary" onclick="${newFn}">${newLabel||'+ New'}</button>`:''}</div></div>`;
  app.innerHTML = `
    <div class="hero">
      <div><h1 style="margin:0">Welcome, ${esc(ME.name.split(' ')[0])} 👋</h1>
        <p class="muted" style="margin:4px 0 0">Your control center — everything is organised below.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="loadDemo(this)">✨ Load demo data</button>
        <button class="btn btn-ghost" onclick="loadFunctions(this)">ƒ Load function examples</button>
      </div>
    </div>
    <div class="statgrid" style="margin-bottom:20px">
      ${stat('Students',d.students)}${stat('Sub-Admins',d.subadmins)}${stat('Batches',d.batches)}
      ${stat('Questions',d.questions)}${stat('Tests',d.tests)}${stat('Submissions',d.submissions)}
    </div>
    <div class="hubsection"><h2>📚 Content — what students practise on</h2><div class="hubgrid">
      ${hub('Question Bank','Your own coding questions with open + hidden test cases. Build Tests and Contests from these.','renderAdminQuestions()','renderQuestionForm()','+ New question')}
      ${hub('100 Days of Code','A built-in Day 1 → Day 100 curriculum (easy → hard). Edit any day. This is separate from your Question Bank.','renderAdminChallenge()','','')}
      ${hub('Tests','Bundle questions into a named test and assign it to specific batches (or everyone).','renderAdminTests()','renderTestForm()','+ New test')}
      ${hub('Contests','Timed competitions with a live leaderboard, assigned to batches.','renderAdminContests()','renderContestForm()','+ New contest')}
    </div></div>
    <div class="hubsection"><h2>👥 People — admin → sub-admin → students</h2><div class="hubgrid">
      ${hub('Batches','Student groups by college · branch · year of passing.','renderBatches()','','')}
      ${hub('Students','Add students, bulk-upload via CSV, assign to batches, reset passwords.','renderStudents()','','')}
      ${hub('Sub-Admins','Give faculty scoped access — each sub-admin sees only their assigned batches.','renderSubadmins()','','')}
    </div></div>
    <div class="hubsection"><h2>📊 Insights</h2><div class="hubgrid">
      ${hub('Results & Analytics','Group-wise performance, proctoring flags, filter by batch/branch/year.','renderFaculty()','','')}
      ${hub('Reports','Active users, most-solved problems, top students, one-click CSV export.','renderReports()','','')}
    </div></div>`;
}
async function loadFunctions(btn){
  if(!confirm('Add 4 ready-made function-mode example problems (Python/C++/Java/JavaScript drivers included)? Use these as templates.')) return;
  btn.textContent='Loading…'; btn.disabled=true;
  const { body } = await apiPost('/api/admin/seed-functions', {});
  btn.disabled=false; btn.textContent='ƒ Load function examples';
  toast(body.alreadySeeded ? 'Function examples already loaded' : (body.error ? body.error : 'Function examples added ✓'));
  renderAdminHome();
}
async function loadDemo(btn){
  if(!confirm('Load demo data? This adds sample colleges, sub-admins, students, questions, tests and contests so you can explore. Safe to run once.')) return;
  btn.textContent='Loading…'; btn.disabled=true;
  const { body } = await apiPost('/api/admin/seed-demo', {});
  btn.disabled=false; btn.textContent='✨ Load demo data';
  toast(body.alreadySeeded ? 'Demo data already loaded' : 'Demo data loaded ✓');
  renderAdminHome();
}

// ---------- FACULTY DASHBOARD ----------
async function renderFaculty(){ stopTimer();
  const d = await apiGet('/api/analytics'); lastResults = (d.students||[]);
  const sm = d.summary||{students:0,active:0,avgScore:0,solvedTotal:0};
  const status = (a)=> a>=85?'<span class="badge b-ready">Ready</span>':(a>=50?'<span class="badge b-mod">Moderate</span>':'<span class="badge b-imp">Needs work</span>');
  const gtable = (title, arr, unit)=>`<div class="card" style="margin-bottom:14px"><h2>${title}</h2>
    <table><tr><th>${unit}</th><th>Students</th><th>Avg score</th><th>Solved</th><th>Status</th></tr>
    ${(arr||[]).map(g=>`<tr><td>${esc(g.label)}</td><td>${g.students}</td><td>${g.avg}</td><td>${g.solved}</td><td>${status(g.avg)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No data yet.</td></tr>'}</table></div>`;
  const batchNames = [...new Set((d.students||[]).map(s=>s.batch))];
  const filterOpts = '<option value="">All batches</option>'+batchNames.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
  const rows = (d.students||[]).map(s=>`<tr data-batch="${esc(s.batch)}"><td>${esc(s.name)}</td><td>${esc(s.batch)}</td><td>${esc(s.branch)}</td><td>${esc(s.year)}</td><td>${s.avg}</td><td>${s.solved}</td><td>${s.attempts}</td><td>${s.flags?('<span class="badge b-imp">⚠ '+s.flags+'</span>'):'—'}</td><td>${status(s.avg)}</td><td>${s.id?`<button class="btn btn-ghost" style="padding:2px 8px" onclick="renderProctor('${s.id}','${esc(s.name).replace(/'/g,'')}')">📷 Camera</button>`:''}</td></tr>`).join('')
    || '<tr><td colspan="10" class="muted">No students yet.</td></tr>';
  const weak = (d.weakTopics||[]).map(w=>`<div class="skill"><div class="r"><span>${esc(w.tag)}</span><span>${w.count} weak submissions</span></div>
    <div class="track"><i class="bad" style="width:${Math.min(100,w.count*15)}%"></i></div></div>`).join('') || '<p class="muted">Not enough data yet.</p>';
  app.innerHTML = `<h1>Results &amp; Analytics</h1><p class="muted">Showing: ${esc(d.scope||'')}</p>
    <div class="statgrid" style="margin-bottom:16px">
      <div class="statcard" style="cursor:default"><div class="statval">${sm.students}</div><div class="statlabel">Students</div></div>
      <div class="statcard" style="cursor:default"><div class="statval">${sm.active}</div><div class="statlabel">Active (have submitted)</div></div>
      <div class="statcard" style="cursor:default"><div class="statval">${sm.avgScore}</div><div class="statlabel">Average score</div></div>
      <div class="statcard" style="cursor:default"><div class="statval">${sm.solvedTotal}</div><div class="statlabel">Problems solved (100/100)</div></div>
      <div class="statcard" style="cursor:default"><div class="statval">${sm.flagged||0}</div><div class="statlabel">Flagged (proctoring)</div></div>
    </div>
    <div class="split">
      ${gtable('By Branch', d.byBranch, 'Branch')}
      ${gtable('By Year of passing', d.byYear, 'Year')}
    </div>
    ${gtable('By Batch (lowest avg first — intervene early)', d.byBatch, 'Batch')}
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h2 style="margin:0">Students</h2><span class="grow"></span>
        <button class="btn btn-ghost" onclick="exportResults()">Export CSV</button>
        <select id="an-filter" onchange="filterStudents()">${filterOpts}</select></div>
      <table><tr><th>Student</th><th>Batch</th><th>Branch</th><th>Year</th><th>Avg</th><th>Solved</th><th>Attempts</th><th>Flags</th><th>Status</th><th>Proctoring</th></tr>
      <tbody id="an-rows">${rows}</tbody></table></div>
    <div class="card"><h2>Weakest topics</h2>${weak}</div>`;
}
function filterStudents(){ const v=document.getElementById('an-filter').value;
  document.querySelectorAll('#an-rows tr').forEach(tr=>{ tr.style.display=(!v||tr.dataset.batch===v)?'':'none'; }); }

// ---------- ADMIN: PROCTORING VIEWER (webcam snapshots for a student) ----------
async function renderProctor(userId, name){
  stopTimer();
  app.innerHTML = `<div class="test-top"><button class="btn btn-ghost" onclick="renderFaculty()">← Results</button></div>
    <h1>Proctoring — ${esc(name||'')}</h1><div id="proc-body"><p class="muted">Loading snapshots…</p></div>`;
  const r = await fetch('/api/proctor/shots/'+userId);
  const body2 = await r.json().catch(()=>({}));
  const shots = (body2.shots||[]);
  if(r.status!==200){ document.getElementById('proc-body').innerHTML = `<p class="muted">${esc((body2&&body2.error)||'Could not load.')}</p>`; return; }
  if(!shots.length){ document.getElementById('proc-body').innerHTML = '<p class="muted">No webcam snapshots recorded for this student yet. Snapshots appear here after they take a proctored Test.</p>'; return; }
  const cards = shots.map(s=>`<figure style="margin:0">
      <img src="/api/proctor/image/${s.id}" loading="lazy" style="width:100%;border-radius:8px;border:1px solid var(--line);background:#111" alt="snapshot">
      <figcaption class="muted" style="font-size:11px;margin-top:2px">${new Date(s.at).toLocaleString()}${s.kind&&s.kind!=='interval'?(' · '+esc(s.kind)):''}</figcaption>
    </figure>`).join('');
  document.getElementById('proc-body').innerHTML = `<p class="muted">${shots.length} snapshot(s). Captured every ~30s during the test and on camera-loss events.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">${cards}</div>`;
}

// ---------- BOOT ----------
async function boot(){
  if(ME && ME.mustChange){ renderForceChange(); return; }
  renderUserbar();
  LANGS = await apiGet('/api/languages');
  PROBLEMS = await apiGet('/api/problems');
  if(ME.role==='admin') renderAdminHome(); else if(ME.role==='subadmin') renderFaculty(); else renderDashboard();
}
document.addEventListener('keydown', (e)=>{
  if(e.key==='Tab' && e.target && e.target.classList && e.target.classList.contains('editor')){
    e.preventDefault();
    const ta=e.target, a=ta.selectionStart, b=ta.selectionEnd;
    ta.value=ta.value.slice(0,a)+'    '+ta.value.slice(b);
    ta.selectionStart=ta.selectionEnd=a+4;
  }
});
// Clicking the logo returns to the role's home (blocked mid-exam).
function goHome(){ if(!ME) return; if(examMode){ toast('Please submit the test first'); return; } renderDashOrHome(); }

// Global Back-button guard: keep one history entry pushed at all times so the
// browser Back never leaves the SPA (which caused 404s). Back inside the app
// returns to the role home; during an exam it is blocked and recorded.
function globalPop(){
  try{ history.pushState({tb:'app'}, ''); }catch(e){}
  if(examMode){
    if(examKind==='test'){ proctor.tab++; updateProctorBadge(); }
    toast('⚠ The back button is disabled during the exam');
    return;
  }
  if(ME) renderDashOrHome();
}
function installBackGuard(){
  try{ history.replaceState({tb:'app'}, ''); history.pushState({tb:'app'}, ''); }catch(e){}
  window.removeEventListener('popstate', globalPop);
  window.addEventListener('popstate', globalPop);
}
(async function init(){
  const rm = (location.hash||'').match(/^#reset=([a-f0-9]+)/i);
  if(rm){ renderReset(rm[1]); return; }
  installBackGuard();
  const me = await apiGet('/api/me');
  if(me.user){ ME = me.user; await boot(); } else { renderAuth('login'); }
})();


// ---------- ADMIN: QUESTION MANAGEMENT ----------
async function renderAdminQuestions(){
  stopTimer();
  const list = await apiGet('/api/admin/questions');
  const rows = list.map(q=>`
    <div class="card prow">
      <div><div class="t">${esc(q.title)}</div>
        <div class="tags">${esc((q.tags||[]).join(' · '))} &nbsp;·&nbsp; ${q.sampleCount} open, ${q.hiddenCount} hidden tests</div></div>
      <span class="grow"></span>
      <span class="pill ${pillClass(q.difficulty)}">${esc(q.difficulty)}</span>
      <button class="btn btn-ghost" onclick="renderEditQuestion('${q.id}')">Edit</button>
      <button class="btn btn-ghost" onclick="delQuestion('${q.id}', this)">Delete</button>
    </div>`).join('') || '<p class="muted">No questions yet. Click “New question” to create one.</p>';
  app.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
      <h1 style="margin:0">Questions</h1><span class="grow"></span>
      <button class="btn btn-primary" onclick="renderQuestionForm()">+ New question</button></div>
    <p class="muted">These are the coding questions your students see. Each has open (visible) and hidden test cases.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
async function delQuestion(id, btn){
  const title = btn.closest('.prow').querySelector('.t').textContent;
  if(!confirm('Delete "'+title+'"? This cannot be undone.')) return;
  await fetch('/api/admin/questions/'+id, { method:'DELETE' });
  renderAdminQuestions();
}
async function renderEditQuestion(id){
  stopTimer();
  const q = await apiGet('/api/admin/questions/'+id);
  if(!q || !q.id){ toast('Question not found'); renderAdminQuestions(); return; }
  const diffOpts=['easy','medium','hard'].map(x=>`<option ${x===q.difficulty?'selected':''}>${x}</option>`).join('');
  const chkOpts=['token','exact','float'].map(x=>`<option value="${x}" ${x===q.checker?'selected':''}>${x}</option>`).join('');
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderAdminQuestions()">← Questions</button></div>
    <h1>Edit question</h1><div id="eqerr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="eq-title" value="${esc(q.title)}"></div>
      <div class="split">
        <div class="field"><label>Difficulty</label><select id="eq-diff">${diffOpts}</select></div>
        <div class="field"><label>Answer checking</label><select id="eq-checker">${chkOpts}</select></div>
      </div>
      <div class="field"><label>Tags (comma separated)</label><input id="eq-tags" value="${esc((q.tags||[]).join(', '))}"></div>
      <div class="field"><label>Statement</label><textarea id="eq-statement" style="height:130px">${esc(q.statement)}</textarea>
        <button class="btn btn-ghost" type="button" style="margin-top:6px" onclick="uploadImage('eq-statement')">📷 Upload image</button></div>
      ${q.mode==='function'?'<p class="muted">Function-mode question — you can edit the statement and test cases here; the function harness/starters stay unchanged.</p>':''}
      <div class="split">
        <div class="field"><label>Time complexity (optional)</label><input id="eq-tc" value="${esc(q.timeComplexity||'')}"></div>
        <div class="field"><label>Space complexity (optional)</label><input id="eq-sc" value="${esc(q.spaceComplexity||'')}"></div>
      </div>
      <div class="field"><label>Reference solution (Python)</label><textarea id="eq-ref" class="editor" style="height:120px">${esc(q.reference||'')}</textarea></div>
      <h2 style="margin-top:14px">Open (visible) test cases</h2><div id="eq-samples">${caseInputs(q.samples)}</div>
      <button class="btn btn-ghost" onclick="document.getElementById('eq-samples').insertAdjacentHTML('beforeend', caseRowHTML())">+ Add open case</button>
      <h2 style="margin-top:16px">Hidden test cases</h2><div id="eq-hidden">${caseInputs(q.hidden)}</div>
      <button class="btn btn-ghost" onclick="document.getElementById('eq-hidden').insertAdjacentHTML('beforeend', caseRowHTML())">+ Add hidden case</button>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="saveEditQuestion('${q.id}')">Save changes</button></div>
    </div>`;
}
async function saveEditQuestion(id){
  const collect=(sel)=>[...document.querySelectorAll('#'+sel+' .caserow')].map(r=>({input:r.querySelector('.io-in').value, expected:r.querySelector('.io-out').value}));
  const payload={ title:val('eq-title'), difficulty:val('eq-diff'), checker:val('eq-checker'), tags:val('eq-tags'),
    statement:val('eq-statement'), timeComplexity:val('eq-tc'), spaceComplexity:val('eq-sc'), reference:val('eq-ref'),
    samples:collect('eq-samples'), hidden:collect('eq-hidden') };
  const { status, body } = await apiPost('/api/admin/questions/'+id, payload);
  if(status!==200){ document.getElementById('eqerr').textContent = body.error||'Could not save'; return; }
  toast('Question saved ✓'); renderAdminQuestions();
}
function caseRowHTML(){
  return `<div class="caserow">
    <textarea class="io-in" placeholder="input (stdin)"></textarea>
    <textarea class="io-out" placeholder="expected output"></textarea>
    <button class="btn btn-ghost" onclick="this.closest('.caserow').remove()">✕</button></div>`;
}
function addCase(kind){ document.getElementById(kind+'-cases').insertAdjacentHTML('beforeend', caseRowHTML()); }
function collectCases(kind){
  return [...document.querySelectorAll('#'+kind+'-cases .caserow')].map(r=>({
    input: r.querySelector('.io-in').value, expected: r.querySelector('.io-out').value }));
}
function renderQuestionForm(){
  stopTimer();
  app.innerHTML = `
    <div class="test-top"><button class="btn btn-ghost" onclick="renderAdminQuestions()">← Questions</button></div>
    <h1>New question</h1>
    <div id="qerr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="q-title" placeholder="Two Sum"></div>
      <div class="split">
        <div class="field"><label>Difficulty</label><select id="q-diff"><option>easy</option><option>medium</option><option>hard</option></select></div>
        <div class="field"><label>Answer checking</label><select id="q-checker">
          <option value="token">token (normal)</option><option value="exact">exact match</option><option value="float">float (allow tolerance)</option></select></div>
      </div>
      <div class="split">
        <div class="field"><label>Tags (comma-separated)</label><input id="q-tags" placeholder="dsa, arrays"></div>
        <div class="field"><label>Topic</label><input id="q-topic" placeholder="Basic DSA"></div>
      </div>
      <div class="field"><label>Problem type</label>
        <select id="q-mode" onchange="toggleQMode()">
          <option value="stdio">Standard — student reads input &amp; prints output</option>
          <option value="function">Function-based — student writes only the function (input handled automatically)</option>
        </select></div>
      <div class="split">
        <div class="field"><label>Time limit (ms)</label><input id="q-time" value="2000"></div>
        <div class="field"><label>Memory (MB)</label><input id="q-mem" value="256"></div>
      </div>
      <div class="field"><label>Problem statement</label>
        <textarea id="q-statement" style="height:120px" placeholder="Describe the problem, the input format, the output format, and an example."></textarea>
        <button class="btn btn-ghost" type="button" style="margin-top:6px" onclick="uploadImage('q-statement')">📷 Upload image</button></div>
      <div class="split">
        <div class="field"><label>Time complexity (e.g. O(n))</label><input id="q-tc" placeholder="O(n)"></div>
        <div class="field"><label>Space complexity (e.g. O(1))</label><input id="q-sc" placeholder="O(1)"></div>
      </div>
      <h2 style="margin-top:14px">Reference solutions <span class="muted" style="font-size:12px">(shown to students in feedback)</span></h2>
      <div class="field"><label>Python (recommended)</label><textarea id="sol-python" class="editor" style="height:100px"></textarea></div>
      <div class="field"><label>C++ (optional)</label><textarea id="sol-cpp" class="editor" style="height:90px"></textarea></div>
      <div class="field"><label>Java (optional)</label><textarea id="sol-java" class="editor" style="height:90px"></textarea></div>
      <div class="field"><label>JavaScript (optional)</label><textarea id="sol-javascript" class="editor" style="height:90px"></textarea></div>

      <div id="harness-section" style="display:none">
        <h2 style="margin-top:16px">Function harness <span class="muted" style="font-size:12px">(per language)</span></h2>
        <p class="muted" style="margin-top:0">For each language you support: <b>Starter</b> = the stub the student edits; <b>Driver</b> = hidden code that reads the input, calls their function, and prints the result — put <code>{{SOLUTION}}</code> where the student's code goes.</p>
        <div class="card" style="background:#eef6ff;margin-bottom:12px">
          <div style="font-weight:700;margin-bottom:4px">⚡ Generate from a function signature</div>
          <p class="muted" style="margin-top:0;font-size:12px">Define the function — we generate the starter + hidden driver (input parsing, the call, and output) for all four languages. You can still tweak them below.</p>
          <div class="split">
            <div class="field"><label>Function name</label><input id="sig-fn" value="solve"></div>
            <div class="field"><label>Return type</label><select id="sig-ret">${TYPE_OPTS}</select></div>
          </div>
          <label>Parameters</label>
          <div id="sig-params"></div>
          <button class="btn btn-ghost" type="button" onclick="sigAddParam()">+ Add parameter</button>
          <div style="margin-top:8px"><button class="btn btn-primary" type="button" onclick="genHarness()">Generate harnesses ↓</button> <span id="sig-msg" class="muted" style="font-size:12px;margin-left:8px"></span></div>
        </div>
        ${['python','cpp','java','javascript'].map(l=>`
          <div class="card" style="margin-bottom:10px;background:#fbf8f1">
            <div style="font-weight:700;margin-bottom:6px">${l}</div>
            <div class="field"><label>Starter (student sees)</label><textarea id="hs-${l}" class="editor" style="height:80px"></textarea></div>
            <div class="field"><label>Driver (hidden — must contain {{SOLUTION}})</label><textarea id="hd-${l}" class="editor" style="height:90px"></textarea></div>
          </div>`).join('')}
      </div>
      <h2 style="margin-top:16px">Public (visible) test cases <span class="muted" style="font-size:12px">— minimum 2</span></h2>
      <p class="muted" style="margin-top:0">Students can see these examples.</p>
      <div id="sample-cases"></div>
      <button class="btn btn-ghost" onclick="addCase('sample')">+ Add public case</button>

      <h2 style="margin-top:18px">Hidden test cases <span class="muted" style="font-size:12px">— minimum 5</span></h2>
      <p class="muted" style="margin-top:0">Used for grading — students never see these.</p>
      <div id="hidden-cases"></div>
      <button class="btn btn-ghost" onclick="addCase('hidden')">+ Add hidden case</button>

      <div style="margin-top:18px"><button class="btn btn-primary" onclick="submitQuestion()">Create question</button></div>
    </div>`;
  addCase('sample'); addCase('sample');
  for(let i=0;i<5;i++) addCase('hidden');
  sigAddParam(); sigAddParam();
}
const HARNESS_TYPES=['int','long','double','bool','string','int[]','long[]','double[]','bool[]','string[]','int[][]','long[][]','double[][]'];
const TYPE_OPTS=HARNESS_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
function sigAddParam(){
  const box=document.getElementById('sig-params'); if(!box) return;
  const div=document.createElement('div'); div.className='sigrow'; div.style.cssText='display:flex;gap:8px;margin-bottom:6px;align-items:center';
  div.innerHTML=`<input class="sig-pname" placeholder="param name" style="flex:1"><select class="sig-ptype" style="flex:1">${TYPE_OPTS}</select><button class="btn btn-ghost" type="button" onclick="this.closest('.sigrow').remove()">✕</button>`;
  box.appendChild(div);
}
async function genHarness(){
  const msg=document.getElementById('sig-msg');
  const fn=(val('sig-fn')||'solve').trim(), returns=val('sig-ret')||'int';
  const params=[...document.querySelectorAll('#sig-params .sigrow')]
    .map(r=>({name:r.querySelector('.sig-pname').value.trim(), type:r.querySelector('.sig-ptype').value}))
    .filter(p=>p.name);
  if(!params.length){ if(msg) msg.textContent='Add at least one parameter first.'; return; }
  if(msg) msg.textContent='Generating…';
  const { status, body }=await apiPost('/api/admin/gen-harness',{fn, params, returns});
  if(status!==200 || !body.harness){ if(msg) msg.textContent=(body&&body.error)||'Could not generate.'; return; }
  for(const l of ['python','cpp','java','javascript']){
    const h=body.harness[l]; if(!h) continue;
    const st=document.getElementById('hs-'+l), dr=document.getElementById('hd-'+l);
    if(st) st.value=h.starter; if(dr) dr.value=h.driver;
  }
  if(msg) msg.textContent='✓ Filled starter + driver for all 4 languages — review below.';
}
function toggleQMode(){ const h=document.getElementById('harness-section'); if(h) h.style.display = val('q-mode')==='function'?'block':'none'; }
async function submitQuestion(){
  const mode=val('q-mode'); let harness={};
  if(mode==='function'){ for(const l of ['python','cpp','java','javascript']){ const st=val('hs-'+l), dr=val('hd-'+l);
    if(st&&st.trim() && dr&&dr.trim()) harness[l]={starter:st, driver:dr}; }
    if(!Object.keys(harness).length){ document.getElementById('qerr').textContent='Add a starter + driver for at least one language.'; return; }
  }
  const solutions={}; for(const k of ['python','cpp','java','javascript']){ const v=val('sol-'+k); if(v && v.trim()) solutions[k]=v; }
  const payload = {
    title: val('q-title'), difficulty: val('q-diff'), checker: val('q-checker'),
    tags: val('q-tags'), topic: val('q-topic'), timeLimitMs: val('q-time'), memoryMb: val('q-mem'),
    statement: val('q-statement'), reference: solutions.python || '', solutions,
    timeComplexity: val('q-tc'), spaceComplexity: val('q-sc'),
    mode, harness,
    samples: collectCases('sample'), hidden: collectCases('hidden') };
  const { status, body } = await apiPost('/api/admin/questions', payload);
  if(status!==200){ document.getElementById('qerr').textContent = body.error || 'Could not create question'; return; }
  renderAdminQuestions();
}


// ---------- ADMIN: BATCHES ----------
async function renderBatches(){
  stopTimer();
  const list = await apiGet('/api/admin/batches');
  const FLABEL = { tests:'Tests', challenge:'100 Days', contests:'Contests', problems:'All Problems', leaderboard:'Leaderboard' };
  const rows = list.map(b=>{
    const f = b.features||{};
    const checks = Object.keys(FLABEL).map(k=>`<label class="chk" style="margin-right:14px"><input type="checkbox" class="feat-${b.id}" data-k="${k}" ${f[k]!==false?'checked':''}> ${FLABEL[k]}</label>`).join('');
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="t">${esc(b.name)}</div><span class="muted">${b.students} student(s)</span>
        <span class="grow"></span>
        <button class="btn btn-ghost" onclick="delBatch('${b.id}','${esc(b.name).replace(/'/g,"\\'")}')">Delete</button>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
        <span class="muted" style="font-size:12px">Modules students in this batch can see:</span><br>
        <div style="margin-top:6px">${checks}
        <button class="btn btn-primary" style="padding:3px 12px" onclick="saveBatchFeatures('${b.id}', this)">Save modules</button></div>
      </div>
    </div>`;
  }).join('') || '<p class="muted">No batches yet. Create one below.</p>';
  app.innerHTML = `<h1>Batches</h1>
    <p class="muted">Group students into batches (e.g. CSE-A 2027). Tick which modules each batch sees — e.g. a college that only needs Tests.</p>
    <div class="card" style="margin:14px 0">
      <div class="split">
        <div class="field"><label>College</label><input id="b-college" placeholder="ABC Engineering College"></div>
        <div class="field"><label>Branch</label><input id="b-branch" placeholder="CSE"></div>
      </div>
      <div class="split">
        <div class="field"><label>Year of passing</label><input id="b-year" placeholder="2027"></div>
        <div class="field" style="align-self:end"><button class="btn btn-primary" onclick="addBatch()">+ Create batch</button></div>
      </div>
      <div id="batcherr" class="err"></div>
    </div>
    <div class="plist">${rows}</div>`;
}
async function addBatch(){
  const { status, body } = await apiPost('/api/admin/batches', { college: val('b-college'), branch: val('b-branch'), yearOfPassing: val('b-year') });
  if(status!==200){ document.getElementById('batcherr').textContent = body.error || 'Could not create batch'; return; }
  renderBatches();
}
async function delBatch(id, name){
  if(!confirm('Delete batch "'+name+'"? Students in it become unassigned.')) return;
  await fetch('/api/admin/batches/'+id, { method:'DELETE' }); renderBatches();
}
async function saveBatchFeatures(id, btn){
  const features={};
  document.querySelectorAll('.feat-'+id).forEach(c=>{ features[c.dataset.k]=c.checked; });
  const { status, body } = await apiPost('/api/admin/batches/'+id+'/features', { features });
  toast(status===200 ? 'Modules updated ✓' : (body.error||'Could not save'));
}

// ---------- ADMIN: STUDENTS ----------
async function renderStudents(){
  stopTimer();
  const [students, batches] = await Promise.all([apiGet('/api/admin/students'), apiGet('/api/admin/batches')]);
  const opts = (sel)=> `<option value="">— none —</option>` +
    batches.map(b=>`<option value="${b.id}" ${b.id===sel?'selected':''}>${esc(b.name)}</option>`).join('');
  const rows = students.map(s=>`<tr>
    <td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${esc(s.branch||'-')}</td><td>${esc(s.yearOfPassing||'-')}</td>
    <td><select onchange="assignBatch('${s.id}', this.value)">${opts(s.batchId)}</select></td>
    <td>${s.avg}</td>
    <td><button class="btn btn-ghost" onclick="resetPassword('${s.id}','${esc(s.email)}')">Reset PW</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No students yet.</td></tr>';
  app.innerHTML = `<h1>Students</h1>
    <p class="muted">Add students and assign each to a batch. Students can also sign up themselves.</p>
    <div class="card" style="margin:14px 0"><h2>Add a student</h2>
      <div class="split">
        <div class="field"><label>Name</label><input id="s-name"></div>
        <div class="field"><label>Email</label><input id="s-email"></div>
      </div>
      <div class="split">
        <div class="field"><label>Mobile</label><input id="s-mobile"></div>
        <div class="field"><label>Branch</label><input id="s-branch"></div>
      </div>
      <div class="split">
        <div class="field"><label>Year of passing</label><input id="s-year"></div>
        <div class="field"><label>Temporary password</label><input id="s-pass" placeholder="they can change later"></div>
      </div>
      <div class="field"><label>Batch</label><select id="s-batch">${opts('')}</select></div>
      <button class="btn btn-primary" onclick="addStudent()">+ Add student</button>
      <div id="stuerr" class="err"></div>
    </div>
    <div class="card" style="margin-bottom:14px"><h2>Bulk upload students (Excel or CSV)</h2>
      <p class="muted" style="margin-top:0">Upload an Excel <b>.xlsx</b> file (or a CSV). Columns: <span class="k">name, email, password, batch, college, mobile, branch, year</span> — only <b>name</b> &amp; <b>email</b> are required. Leave <b>password</b> blank and the student sets their own on first login. The <b>batch</b> column creates the batch if it doesn't exist. <a href="#" onclick="downloadTemplate();return false;"><b>Download Excel template</b></a></p>
      <div class="split">
        <div class="field"><label>Choose Excel (.xlsx) or CSV file</label><input type="file" id="bulk-file" accept=".xlsx,.csv"></div>
        <div class="field"><label>Default batch (for rows with no batch)</label><select id="bulk-batch">${opts('')}</select></div>
      </div>
      <div class="field"><label>…or paste CSV here</label><textarea id="bulk-text" style="height:90px" placeholder="name,email,password,batch"></textarea></div>
      <label class="chk" style="display:flex;align-items:center;gap:8px;margin:6px 0"><input type="checkbox" id="bulk-email" checked> Email each student their login details (login link + temporary password)</label>
      <button class="btn btn-primary" onclick="bulkUpload()">Upload students</button>
      <div id="bulkresult" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="card"><h2>All students</h2>
      <table><tr><th>Name</th><th>Email</th><th>Branch</th><th>Year</th><th>Batch</th><th>Avg</th><th></th></tr>${rows}</table></div>`;
}
async function addStudent(){
  const { status, body } = await apiPost('/api/admin/students',
    { name:val('s-name'), email:val('s-email'), password:val('s-pass'), batchId:val('s-batch'),
      mobile:val('s-mobile'), branch:val('s-branch'), yearOfPassing:val('s-year') });
  if(status!==200){ document.getElementById('stuerr').textContent = body.error || 'Could not add student'; return; }
  renderStudents();
}
async function assignBatch(id, batchId){ const { status } = await apiPost('/api/admin/students/'+id+'/batch', { batchId }); toast(status===200?'Batch updated ✓':'Could not update'); }


// ---------- ADMIN: SUB-ADMINS ----------
async function renderSubadmins(){
  stopTimer();
  const [subs, batches] = await Promise.all([apiGet('/api/admin/subadmins'), apiGet('/api/admin/batches')]);
  const card = (u)=>{
    const checks = batches.length ? batches.map(b=>`<label class="chk"><input type="checkbox" value="${b.id}" ${(u.assignedBatches||[]).includes(b.id)?'checked':''}> ${esc(b.name)}</label>`).join('')
      : '<span class="muted">No batches yet — create some in the Batches tab first.</span>';
    return `<div class="card" data-sub="${u.id}" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}</span></div>
      <div class="muted" style="margin:6px 0">Assign batches — this sub-admin will see only these students:</div>
      <div class="checks">${checks}</div>
      <button class="btn btn-primary" style="margin-top:10px" onclick="saveSubBatches('${u.id}')">Save assignments</button>
      <button class="btn btn-ghost" style="margin-top:10px" onclick="resetPassword('${u.id}','${esc(u.email)}')">Reset password</button>
    </div>`;
  };
  const list = subs.map(card).join('') || '<p class="muted">No sub-admins yet.</p>';
  app.innerHTML = `<h1>Sub-Admins</h1>
    <p class="muted">A sub-admin can only see results & analytics for the students in the batches you assign them.</p>
    <div class="card" style="margin:14px 0"><h2>Add a sub-admin</h2>
      <div class="split"><div class="field"><label>Name</label><input id="sa-name"></div>
        <div class="field"><label>Email</label><input id="sa-email"></div></div>
      <div class="field"><label>Temporary password</label><input id="sa-pass"></div>
      <button class="btn btn-primary" onclick="addSubadmin()">+ Add sub-admin</button>
      <div id="saerr" class="err"></div></div>
    ${list}`;
}
async function addSubadmin(){
  const { status, body } = await apiPost('/api/admin/subadmins',
    { name:val('sa-name'), email:val('sa-email'), password:val('sa-pass') });
  if(status!==200){ document.getElementById('saerr').textContent = body.error||'Could not add sub-admin'; return; }
  renderSubadmins();
}
async function saveSubBatches(id){
  const card = document.querySelector('[data-sub="'+id+'"]');
  const ids = [...card.querySelectorAll('.checks input:checked')].map(x=>x.value);
  const btn = card.querySelector('button');
  const label = btn.textContent; btn.textContent = 'Saving…'; btn.disabled = true;
  const { status } = await apiPost('/api/admin/subadmins/'+id+'/batches', { batchIds: ids });
  btn.disabled = false; btn.textContent = label;
  toast(status===200 ? 'Assignments saved ✓' : 'Could not save — try again');
}


// ---------- ADMIN: TESTS / CHALLENGES ----------
async function renderAdminTests(){
  stopTimer();
  const list = await apiGet('/api/admin/tests');
  const rows = list.map(t=>`
    <div class="card prow">
      <div><div class="t">${esc(t.title)}</div>
        <div class="tags">${t.questionCount} question(s) · ${t.batchNames.length?('for '+t.batchNames.map(esc).join(', ')):'all batches'}</div></div>
      <span class="grow"></span>
      <button class="btn btn-ghost" onclick="renderTestAnalytics('${t.id}')">Analytics</button>
      <button class="btn btn-ghost" onclick="delTest('${t.id}', this)">Delete</button>
    </div>`).join('') || '<p class="muted">No tests yet. Create one to bundle questions together.</p>';
  app.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
      <h1 style="margin:0">Tests / Challenges</h1><span class="grow"></span>
      <button class="btn btn-primary" onclick="renderTestForm()">+ New test</button></div>
    <p class="muted">Bundle questions into a named test and assign it to specific batches.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
async function delTest(id, btn){
  const title = btn.closest('.prow').querySelector('.t').textContent;
  if(!confirm('Delete "'+title+'"?')) return;
  await fetch('/api/admin/tests/'+id, { method:'DELETE' }); renderAdminTests();
}
async function renderTestForm(){
  stopTimer();
  const [questions, batches] = await Promise.all([apiGet('/api/admin/questions'), apiGet('/api/admin/batches')]);
  const qChecks = questions.length ? questions.map(q=>`<label class="chk"><input type="checkbox" class="q-pick" value="${q.id}"> ${esc(q.title)} <span class="muted">(${esc(q.difficulty)})</span><input type="number" min="1" value="10" class="q-marks" data-q="${q.id}" title="marks" onclick="event.stopPropagation()" style="width:58px;display:none;margin-left:8px"></label>`).join('')
    : '<span class="muted">No questions yet — create some in the Questions tab.</span>';
  const bChecks = batches.length ? batches.map(b=>`<label class="chk"><input type="checkbox" class="b-pick" value="${b.id}"> ${esc(b.name)}</label>`).join('')
    : '<span class="muted">No batches yet.</span>';
  app.innerHTML = `<div class="test-top"><button class="btn btn-ghost" onclick="renderAdminTests()">← Tests</button></div>
    <h1>New test / challenge</h1><div id="terr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="t-title" placeholder="Week 1 — Arrays & Strings"></div>
      <div class="field"><label>Description (optional)</label><textarea id="t-desc" style="height:70px"></textarea></div>
      <div class="field"><label>Time limit (minutes)</label><input id="t-duration" type="number" min="0" value="30" style="max-width:160px"><span class="muted" style="margin-left:8px;font-size:12px">Whole test is one timed sitting. 0 = no limit.</span></div>
      <h2 style="margin-top:14px">Availability</h2>
      <div class="checks" style="margin-bottom:8px">
        <label class="chk"><input type="radio" name="t-avail" value="open" checked onchange="onAvailChange()"> Open — students can take it anytime</label>
        <label class="chk"><input type="radio" name="t-avail" value="scheduled" onchange="onAvailChange()"> Scheduled — only on/after a date &amp; time</label>
      </div>
      <div class="split">
        <div class="field" id="t-startwrap" style="display:none"><label>Starts on (date &amp; time)</label><input id="t-start" type="datetime-local"></div>
        <div class="field"><label>Open for (hours)</label><input id="t-hours" type="number" min="0" value="0" style="max-width:160px"><span class="muted" style="margin-left:8px;font-size:12px">Auto-closes this many hours after it opens. 0 = never closes.</span></div>
      </div>
      <h2 style="margin-top:14px">After a student submits, show them:</h2>
      <div class="checks">
        <label class="chk"><input type="checkbox" id="t-show-score" checked> Their score</label>
        <label class="chk"><input type="checkbox" id="t-show-answers"> Which cases passed/failed</label>
        <label class="chk"><input type="checkbox" id="t-show-solutions"> The model solution</label>
      </div>
      <h2 style="margin-top:14px">Pick questions</h2>
      <label class="chk" style="margin-bottom:10px"><input type="checkbox" id="t-use-marks" onchange="onUseMarksChange()"> Assign question-wise marks <span class="muted" style="margin-left:4px">(otherwise all questions are weighted equally)</span></label>
      <div class="checks">${qChecks}</div>
      <h2 style="margin-top:16px">Assign to batches</h2>
      <p class="muted" style="margin-top:0">Leave all unchecked to show this test to every student.</p>
      <div class="checks">${bChecks}</div>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="submitTest()">Create test</button></div>
    </div>`;
}
function onAvailChange(){ const sched=(document.querySelector('input[name="t-avail"]:checked')||{}).value==='scheduled';
  const w=document.getElementById('t-startwrap'); if(w) w.style.display=sched?'block':'none'; }
function onUseMarksChange(){ const on=document.getElementById('t-use-marks').checked;
  document.querySelectorAll('.q-marks').forEach(el=>el.style.display=on?'inline-block':'none'); }
async function submitTest(){
  const questionIds = [...document.querySelectorAll('.q-pick:checked')].map(x=>x.value);
  const batchIds = [...document.querySelectorAll('.b-pick:checked')].map(x=>x.value);
  const availability = (document.querySelector('input[name="t-avail"]:checked')||{}).value || 'open';
  const startLocal = val('t-start');   // datetime-local -> local time
  const startAt = (availability==='scheduled' && startLocal) ? new Date(startLocal).getTime() : 0;
  if(availability==='scheduled' && !startAt){ document.getElementById('terr').textContent='Please set a start date & time for a scheduled test.'; return; }
  let marks = {};
  if(document.getElementById('t-use-marks') && document.getElementById('t-use-marks').checked){
    [...document.querySelectorAll('.q-marks')].forEach(el=>{ if(questionIds.includes(el.dataset.q)){ const v=Number(el.value)||0; if(v>0) marks[el.dataset.q]=v; } });
  }
  const { status, body } = await apiPost('/api/admin/tests',
    { title:val('t-title'), description:val('t-desc'), durationMin:val('t-duration'),
      availability, startAt, openHours:val('t-hours'),
      showScore:document.getElementById('t-show-score').checked, showAnswers:document.getElementById('t-show-answers').checked, showSolutions:document.getElementById('t-show-solutions').checked,
      marks, questionIds, batchIds });
  if(status!==200){ document.getElementById('terr').textContent = body.error||'Could not create test'; return; }
  renderAdminTests();
}

// ---------- STUDENT: MY TESTS ----------
async function renderStudentTests(){
  stopTimer();
  const list = await apiGet('/api/tests');
  const rows = list.map(t=>{
    const done=t.attemptStatus==='done', inprog=t.attemptStatus==='in_progress';
    // Availability (a started/completed attempt is always openable to view/resume).
    const upcoming = t.windowState==='upcoming' && !done && !inprog;
    const closed = t.windowState==='closed' && !done && !inprog;
    const badge = done ? `<span class="pill pill-easy">✓ ${t.score}%</span>`
      : inprog ? '<span class="pill pill-medium">Resume</span>'
      : upcoming ? `<span class="pill pill-medium">Opens ${new Date(t.opensAt).toLocaleString()}</span>`
      : closed ? '<span class="pill pill-hard">Closed</span>' : '';
    const clickable = done || inprog || (!upcoming && !closed);
    const sub = `${t.questionCount} question(s)${t.durationMin?(' · '+t.durationMin+' min'):''}${t.description?' · '+esc(t.description):''}${(!done && t.closesAt)?(' · closes '+new Date(t.closesAt).toLocaleDateString()):''}`;
    return `<div class="card prow" ${clickable?`onclick="openTest('${t.id}')"`:'style="opacity:.6;cursor:not-allowed"'}>
      <div><div class="t">${esc(t.title)}</div><div class="tags">${sub}</div></div>
      <span class="grow"></span>${badge}${clickable?`<button class="btn btn-ghost">${done?'View →':(inprog?'Resume →':'Open →')}</button>`:''}
    </div>`;
  }).join('') || '<p class="muted">No tests assigned to you yet. Try “All Problems” to practise freely.</p>';
  app.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h1 style="margin:0">My Tests</h1><span class="grow"></span><button class="btn btn-ghost" onclick="renderMyResults()">📊 My Results</button></div>
    <p class="muted">Tests your college assigned to your batch. Each test is one sitting — once submitted it can't be re-attempted.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
// A Test is one proctored sitting: questions come one at a time, no restart.
async function openTest(id){
  stopTimer();
  const { status, body } = await apiPost('/api/test/start', { testId:id });
  if(status!==200){ toast(body.error||'Could not open test'); renderStudentTests(); return; }
  if(body.status==='done'){ renderTestDone(body); return; }   // already submitted -> show score, no re-attempt
  window.__examKind='test';
  const answered=(body.answered||[]), qs=(body.questions||[]);
  let idx=qs.findIndex(q=>!answered.includes(q.id)); if(idx<0) idx=0;
  window.__test={ id, title:body.title, questions:qs, answered:answered.slice(), idx, deadline:body.deadline||0, reveal:body.reveal||{showScore:true} };
  window.__examBack=()=>renderStudentTests();
  renderExamGate(body.title, { resuming: answered.length>0, deadline: body.deadline||0, durationMin: body.durationMin||0 });
}
function renderExamGate(title, opts){
  opts = opts || {};
  const isTest = (window.__examKind||'')==='test';
  const remainMin = opts.deadline ? Math.max(0, Math.ceil((opts.deadline - Date.now())/60000)) : 0;
  const timeLine = isTest ? (opts.deadline
      ? `<p style="margin:6px 0 0;font-weight:700">${opts.resuming?'This test is already running':'Time limit'}: ${remainMin} minute(s) ${opts.resuming?'left':''}</p>`
      : '<p class="muted" style="margin:6px 0 0">No time limit.</p>') : '';
  app.innerHTML=`<div class="examgate"><div class="examgate-card">
    <div class="auth-logo"></div>
    <h1 style="margin:12px 0 2px">Proctored Test</h1>
    <p class="muted" style="margin:0">${esc(title||'')}</p>
    ${timeLine}
    <ul class="examrules">
      <li>The test runs in <b>full screen</b>. Leaving full screen or switching tab is a <b>violation</b> and is recorded.</li>
      ${isTest?'<li>Your <b>webcam</b> is monitored — keep your face visible and the camera uncovered.</li>':''}
      ${isTest?'<li><b>Copy, paste, right-click and the back button are disabled.</b> Questions appear one at a time — you cannot go back.</li>':'<li>Do not switch tabs or exit full screen — each time is recorded.</li>'}
      ${isTest?'<li>After <b>4 violations the test ends automatically</b>, keeping whatever you have submitted. It cannot be restarted.</li>':''}
      <li>Submitting ends the test.</li>
    </ul>
    <div id="gate-err" class="err"></div>
    <button class="btn btn-primary" onclick="beginExam()">${isTest?(opts.resuming?'Resume test':'Allow camera &amp; start'):'Start in Full Screen'}</button>
    <button class="btn btn-ghost" style="margin-left:8px" onclick="examCancel()">Cancel</button>
  </div></div>`;
}
async function loadExamQuestion(){
  const t=window.__test; if(!t) return;
  const q=t.questions[t.idx]; if(!q) return finishTest(false);
  let r=await fetch('/api/problems/'+q.id); if(!r.ok) r=await fetch('/api/challenge/'+q.id);
  if(!r.ok){ toast('Problem not found'); return; }
  const d=await r.json(); window.__examDetail=d; renderTest(d);
}
async function doExamSubmit(id){
  const res=document.getElementById('results'); if(res) res.innerHTML='<div class="muted">Judging all tests…</div>';
  window.__lastSubmit={ id, language:val('lang'), code:getCode() };
  try{ localStorage.setItem(codeKey(id, curLang||val('lang')), getCode()); }catch(e){}
  let resp;
  try{ resp=await apiPost('/api/submit',{ problemId:id, language:val('lang'), code:getCode(), practice:false, testId:(window.__test&&window.__test.id)||'',
    flags:{ tabSwitches:proctor.tab, pasteAttempts:proctor.paste, fullscreenExits:proctor.fs, copyBlocks:proctor.copy, cameraLost:proctor.cam } }); }
  catch(e){ if(res) res.innerHTML='<div class="row"><span class="dot bad"></span>Network error — your code is safe. Please try Submit again.</div>'; return; }
  const { status, body:out }=resp;
  if(status===401){ alert('Please log in again.'); renderAuth('login'); return; }
  if(!out || status>=500){ if(res) res.innerHTML='<div class="row"><span class="dot bad"></span>The judge could not process this. Your code is preserved — try again.</div>'; return; }
  const t=window.__test; if(t && !t.answered.includes(id)) t.answered.push(id);
  renderPalette();   // mark this question as submitted in the palette
  if(res) res.innerHTML=`<div class="row"><span class="dot ${out.overall==='Accepted'?'ok':'bad'}"></span><b>${esc(out.overall)}</b> — ${out.passed}/${out.total} tests · <span class="muted">saved. Use the question numbers to move on, or Finish test when done.</span></div>`;
}
// ---- Question palette / navigation ----
function paletteHTML(){ const t=window.__test; if(!t) return '';
  return t.questions.map((q,i)=>`<button class="qp ${i===t.idx?'cur':''} ${t.answered.includes(q.id)?'done':''}" onclick="examGoto(${i})" title="Question ${i+1}">${i+1}</button>`).join(''); }
function renderPalette(){ const el=document.getElementById('qpalette'); if(el) el.innerHTML=paletteHTML(); }
function saveCurrentCode(){ try{ const id=curProblem&&curProblem.meta&&curProblem.meta.id; if(id) localStorage.setItem(codeKey(id, curLang||val('lang')), getCode()); }catch(e){} }
function examGoto(i){ const t=window.__test; if(!t||i<0||i>=t.questions.length||i===t.idx) return; saveCurrentCode(); t.idx=i; advancing=true; loadExamQuestion(); }
function examPrev(){ const t=window.__test; if(t) examGoto(t.idx-1); }
function examNext(){ const t=window.__test; if(t) examGoto(t.idx+1); }
function confirmFinishTest(){ const t=window.__test; if(!t) return;
  if(!confirm(`Finish and submit the test? You've submitted ${t.answered.length} of ${t.questions.length} question(s). This cannot be undone.`)) return;
  saveCurrentCode(); finishTest(false); }
async function finishTest(auto){
  const t=window.__test; if(!t) return;
  const testId=t.id, title=t.title, questions=t.questions, reveal=t.reveal;   // keep for the results screen
  advancing=false;                                 // ensure the full exam teardown runs
  stopExam(); window.__test=null; window.__examKind=null;
  let body={};
  try{ const r=await apiPost('/api/test/finish',{ testId }); body=r.body||{}; }catch(e){}
  renderUserbar();
  renderTestDone(Object.assign({ title, questions, reveal }, body));
  if(auto) toast('⚠ Test auto-submitted after too many warnings');
}
function renderTestDone(d){
  stopTimer(); if(ME) renderUserbar();
  const reveal = d.reveal || { showScore:true, showAnswers:false, showSolutions:false };
  const score=(d.score==null?0:d.score);
  const marks=d.marks||{}, marksMax=d.marksMax||0;
  const answers=d.answers||{}; const qmap={}; (d.questions||[]).forEach(q=>qmap[q.id]=q.title);
  const scoreBlock = reveal.showScore
    ? `<div style="font-size:52px;font-weight:800;margin:12px 0 2px;color:var(--gold,#4f46e5)">${score}%</div>${marksMax?`<div style="font-size:17px;font-weight:600;color:var(--muted)">${d.marksEarned==null?0:d.marksEarned} / ${marksMax} marks</div>`:''}`
    : `<p class="muted" style="margin:14px 0">Your responses have been recorded. Your score will be shared by your administrator.</p>`;
  let detail='';
  if(reveal.showAnswers){
    const cols = reveal.showSolutions ? 3 : 2;
    const scoreCell=(qid,s)=> marksMax&&marks[qid] ? `${Math.round(s/100*marks[qid])}/${marks[qid]}` : `${s}/100`;
    const rows=Object.keys(answers).length
      ? Object.entries(answers).map(([qid,s])=>`<tr><td>${esc(qmap[qid]||qid)}</td><td>${scoreCell(qid,s)}</td>${reveal.showSolutions?`<td><button class="btn btn-ghost" style="padding:2px 10px" onclick="viewDoneSolution('${qid}',this)">Solution</button></td>`:''}</tr>`).join('')
      : `<tr><td colspan="${cols}" class="muted">No questions were answered.</td></tr>`;
    detail=`<table style="margin:6px auto 0;max-width:540px"><tr><th>Question</th><th>${marksMax?'Marks':'Score'}</th>${reveal.showSolutions?'<th></th>':''}</tr>${rows}</table>`;
  } else if(reveal.showSolutions){
    detail=(d.questions||[]).map(q=>`<div style="margin:6px 0"><b>${esc(q.title)}</b> <button class="btn btn-ghost" style="padding:2px 10px" onclick="viewDoneSolution('${q.id}',this)">Solution</button></div>`).join('');
  }
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderStudentTests()">← My Tests</button>
      <button class="btn btn-ghost" onclick="renderMyResults()">📊 My Results</button></div>
    <div class="card" style="text-align:center;padding:26px">
      <h1 style="margin:0">${esc(d.title||'Test')} — submitted</h1>
      <p class="muted" style="margin-top:4px">This test has been submitted and cannot be re-attempted.</p>
      ${scoreBlock}
      ${detail?`<div id="done-detail">${detail}</div>`:''}
    </div>`;
}
async function viewDoneSolution(id, btn){
  const r=await fetch('/api/solution/'+id); const b=await r.json();
  if(r.status!==200){ toast(b.error||'Solution not available'); return; }
  const wrap=document.createElement('div'); wrap.style.textAlign='left'; wrap.style.marginTop='8px';
  wrap.innerHTML=renderSolutions(b.solutions, b.timeComplexity, b.spaceComplexity);
  const host=document.getElementById('done-detail')||btn.parentElement; host.appendChild(wrap); btn.remove();
}
async function renderMyResults(){
  stopTimer();
  const d = await apiGet('/api/my/test-results');
  const rows=(d.results||[]).map(r=>`<tr><td>${esc(r.title)}</td><td>${r.status==='done'?('<b>'+r.score+'%</b>'):'<span class="muted">in progress</span>'}</td><td>${r.answered}/${r.total}</td><td>${r.submittedAt?new Date(r.submittedAt).toLocaleString():'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">You haven\'t attempted any tests yet.</td></tr>';
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderStudentTests()">← My Tests</button></div>
    <h1>My Test Results</h1><p class="muted">Scores from tests you have attempted.</p>
    <div class="card"><table><tr><th>Test</th><th>Score</th><th>Answered</th><th>Submitted</th></tr>${rows}</table></div>`;
}

// ---------- STAFF: PER-TEST ANALYTICS ----------
async function renderStaffTests(){
  stopTimer();
  const list = await apiGet('/api/staff/tests');
  const rows=(list||[]).map(t=>`<div class="card prow" onclick="renderTestAnalytics('${t.id}')">
      <div><div class="t">${esc(t.title)}</div><div class="tags">${t.questionCount} question(s)${t.durationMin?(' · '+t.durationMin+' min'):''} · ${esc(t.availability||'open')}</div></div>
      <span class="grow"></span><button class="btn btn-ghost">Analytics →</button></div>`).join('') || '<p class="muted">No tests yet.</p>';
  app.innerHTML=`<h1>Test Analytics</h1><p class="muted">Pick a test to see who took it, their scores, and timings.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
let __ta=null, __taSort={ key:'name', dir:1 };
async function renderTestAnalytics(id){
  stopTimer();
  const d = await apiGet('/api/staff/test-analytics/'+id);
  if(!d || !d.test){ toast('Could not load analytics'); return; }
  __ta=d; __taSort={ key:'name', dir:1 };
  const s=d.summary, t=d.test;
  const tile=(v,l)=>`<div class="statcard" style="cursor:default"><div class="statval">${v}</div><div class="statlabel">${l}</div></div>`;
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderStaffTests()">← Tests</button></div>
    <h1>${esc(t.title)} — analytics</h1>
    <p class="muted">${t.questionCount} question(s)${t.durationMin?(' · '+t.durationMin+' min limit'):''} · ${esc(t.availability||'open')}</p>
    <div class="statgrid" style="margin:14px 0">
      ${tile(s.assigned,'Assigned')}${tile(s.started,'Started')}${tile(s.inProgress,'In progress')}${tile(s.submitted,'Submitted')}${tile(s.notStarted,'Not started')}
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <h2 style="margin:0">Students</h2><span class="grow"></span>
        <input id="ta-filter" placeholder="Filter name / email / branch…" oninput="renderTaTable()" style="padding:8px 11px;border:1px solid var(--line);border-radius:9px;min-width:200px">
        <select id="ta-status" onchange="renderTaTable()"><option value="">All statuses</option><option value="done">Submitted</option><option value="in_progress">In progress</option></select>
        <button class="btn btn-ghost" onclick="exportTestAnalytics()">Export CSV</button>
      </div>
      <div style="overflow-x:auto"><div id="ta-table"></div></div>
    </div>`;
  renderTaTable();
}
function taSort(key){ if(__taSort.key===key) __taSort.dir*=-1; else { __taSort.key=key; __taSort.dir=1; } renderTaTable(); }
function taTime(t){ return t? new Date(t).toLocaleString() : '—'; }
function renderTaTable(){
  if(!__ta) return;
  const q=(val('ta-filter')||'').toLowerCase(), stf=val('ta-status');
  let rows=(__ta.rows||[]).filter(r=> (!stf || r.status===stf) && (!q || (r.name+' '+r.email+' '+(r.branch||'')).toLowerCase().includes(q)));
  const k=__taSort.key, dir=__taSort.dir;
  rows=rows.slice().sort((a,b)=>{ let x=a[k], y=b[k]; if(x==null)x=''; if(y==null)y=''; if(typeof x==='string'||typeof y==='string') return dir*String(x).localeCompare(String(y)); return dir*((x||0)-(y||0)); });
  const mMax=__ta.test.marksMax||0;
  const cols=[['name','Student'],['email','Email'],['branch','Branch'],['status','Status'],['score','Score']];
  if(mMax) cols.push(['marks','Marks']);
  cols.push(['startedAt','Started'],['submittedAt','Submitted']);
  const arrow=(key)=> __taSort.key===key ? (__taSort.dir>0?' ▲':' ▼') : '';
  const head=cols.map(c=>`<th style="cursor:pointer;user-select:none" onclick="taSort('${c[0]}')">${c[1]}${arrow(c[0])}</th>`).join('')+'<th></th>';
  const tid=__ta.test.id;
  const colSpan=cols.length+1;
  const body=rows.map(r=>`<tr>
      <td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.branch||'-')}</td>
      <td>${r.status==='done'?'<span class="badge b-ready">Submitted</span>':'<span class="badge b-mod">In progress</span>'}</td>
      <td>${r.score==null?'—':('<b>'+r.score+'%</b>')}</td>
      ${mMax?`<td>${r.marks==null?'—':('<b>'+r.marks+'</b>/'+mMax)}</td>`:''}
      <td>${taTime(r.startedAt)}</td><td>${taTime(r.submittedAt)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost" style="padding:3px 10px" onclick="viewStudentAnswers('${r.userId}','${tid}','${esc(r.name).replace(/'/g,'')}')">Answers</button>
        <button class="btn btn-ghost" style="padding:3px 10px" onclick="resetStudentTest('${r.userId}','${tid}','${esc(r.name).replace(/'/g,'')}')">Reset</button></td>
    </tr>`).join('') || `<tr><td colspan="${colSpan}" class="muted">No students match.</td></tr>`;
  document.getElementById('ta-table').innerHTML=`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
async function viewStudentAnswers(userId, testId, name){
  stopTimer();
  const d = await apiGet('/api/staff/student-answers/'+userId+'/'+testId);
  if(!d || !d.answers){ toast('Could not load answers'); return; }
  const L={python:'Python',cpp:'C++',java:'Java',javascript:'JavaScript',c:'C',ruby:'Ruby',php:'PHP',go:'Go',rust:'Rust',bash:'Bash'};
  const blocks=d.answers.map((ans,i)=>`<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <b>Q${i+1}. ${esc(ans.title)}</b>
        ${ans.marks?`<span class="pill pill-medium">${ans.marks} marks</span>`:''}
        <span class="grow"></span>
        ${ans.overall?`<span class="badge ${ans.overall==='Accepted'?'b-ready':'b-imp'}">${esc(ans.overall)}</span>`:''}
        ${ans.score!=null?`<span class="muted">${ans.score}/100</span>`:''}
        ${ans.language?`<span class="muted">· ${esc(L[ans.language]||ans.language)}</span>`:''}
        ${ans.at?`<span class="muted">· ${new Date(ans.at).toLocaleString()}</span>`:''}
      </div>
      ${ans.code?`<pre class="code" style="margin-top:8px;max-height:340px">${esc(ans.code)}</pre>
        <button class="btn btn-ghost" style="margin-top:8px" onclick="showRejudge('${userId}','${testId}','${ans.qid}',this)">Show test results</button>
        <div id="rj-${ans.qid}" style="margin-top:8px"></div>`:'<p class="muted" style="margin:8px 0 0">No submission for this question.</p>'}
    </div>`).join('');
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderTestAnalytics('${testId}')">← Analytics</button></div>
    <h1>${esc(name)} — answers</h1><p class="muted">${esc(d.email||'')} · ${esc(d.title)} · showing each question's most recent submission.</p>
    ${blocks||'<p class="muted">No answers.</p>'}`;
}
async function showRejudge(userId, testId, qid, btn){
  const host=document.getElementById('rj-'+qid); if(host) host.innerHTML='<div class="muted">Re-running the submission…</div>';
  btn.disabled=true;
  const { status, body }=await apiPost('/api/staff/rejudge', { userId, testId, qid });
  btn.disabled=false;
  if(status!==200 || !body){ if(host) host.innerHTML='<div class="row"><span class="dot bad"></span>Could not re-run — try again.</div>'; return; }
  if(body.overall==='Compilation Error'){ if(host) host.innerHTML=`<div class="row"><span class="dot bad"></span><b>Compilation Error</b> — the compiler rejected this code:</div><pre class="code">${esc((body.compileOutput||'(no output)').slice(0,1400))}</pre>`; return; }
  if(body.overall==='Language Unavailable' || body.overall==='No submission'){ if(host) host.innerHTML=`<div class="muted">${esc(body.note||body.overall)}</div>`; return; }
  if(!body.results || !body.results.length){ if(host) host.innerHTML=`<div class="muted">${esc(body.overall||'No result')}</div>`; return; }
  if(host) host.innerHTML=`<div class="row"><span class="dot ${body.overall==='Accepted'?'ok':'bad'}"></span><b>${esc(body.overall)}</b> — ${body.passed}/${body.total} test cases passed</div>`+body.results.map(verdictRow).join('');
}
async function resetStudentTest(userId, testId, name){
  if(!confirm('Reset the test for "'+name+'"? Their current attempt is deleted and they can start from scratch.')) return;
  const { status, body } = await apiPost('/api/staff/reset-attempt', { userId, testId });
  if(status!==200){ toast(body.error||'Could not reset'); return; }
  toast('Test reset for '+name+' ✓'); renderTestAnalytics(testId);
}
function exportTestAnalytics(){
  if(!__ta) return;
  const rows=(__ta.rows||[]).map(r=>({ Name:r.name, Email:r.email, Branch:r.branch||'',
    Status:r.status==='done'?'Submitted':'In progress', Score:r.score==null?'':r.score,
    Started:taTime(r.startedAt), Submitted:taTime(r.submittedAt) }));
  downloadCSV((__ta.test.title||'test').replace(/[^\w]+/g,'_')+'_analytics.csv', rows);
}


// ---------- 100 DAYS OF CODE ----------
async function renderChallenge(){
  stopTimer();
  const d = await apiGet('/api/challenge');
  const solvedCount = d.days.filter(x=>x.solved).length;
  const cells = d.days.map(day=>{
    const state = day.solved?'done':(day.unlocked?'open':'locked');
    const badge = day.solved?'✓':(day.unlocked?'':'🔒');
    const click = day.unlocked?`onclick="openChallenge('${day.id}')"`:'';
    return `<div class="day ${state}" ${click}>
      <div class="day-n">Day ${day.day}</div>
      <div class="day-t">${esc(day.title)}</div>
      <div class="day-b"><span class="pill ${pillClass(day.difficulty)}">${esc(day.difficulty)}</span><span class="day-badge">${badge}</span></div>
    </div>`;
  }).join('');
  app.innerHTML = `<h1>100 Days of Code</h1>
    <p class="muted">A daily journey from the easiest program (Day 1) to the hardest (Day 100). Solve a day to unlock the next.</p>
    <div class="progress-wrap"><div class="progress-bar"><i style="width:${solvedCount}%"></i></div><span class="progress-label">${solvedCount}/100 solved</span></div>
    <div class="daygrid">${cells}</div>`;
}
async function openChallenge(id){ renderTest(await apiGet('/api/challenge/'+id)); }

// ---------- VIEW SOLUTION (works for challenge + admin questions) ----------
async function viewSolution(id){
  const res = document.getElementById('results');
  const r = await fetch('/api/solution/'+id); const body = await r.json();
  if(r.status!==200){ res.innerHTML = `<div class="row"><span class="dot bad"></span>${esc(body.error||'Solution locked')}</div>`; return; }
  res.innerHTML = renderSolutions(body.solutions, body.timeComplexity, body.spaceComplexity);
}


// ---------- ADMIN: password reset + bulk upload ----------
async function resetPassword(id, email){
  const pw = prompt('Set a new password for '+email+' (min 4 characters):');
  if(!pw) return;
  const { status, body } = await apiPost('/api/admin/users/'+id+'/password', { password: pw });
  toast(status===200 ? 'Password reset ✓' : (body.error||'Could not reset'));
}
function downloadTemplate(){
  // Cookie-authed GET that returns an .xlsx attachment — downloads without leaving the SPA.
  const a = document.createElement('a');
  a.href = '/api/admin/students/template.xlsx';
  a.download = 'talent-battle-students-template.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
}
async function bulkUpload(){
  const el = document.getElementById('bulkresult');
  const post = async (payload)=>{
    const emailInvites = (document.getElementById('bulk-email')||{}).checked !== false;
    el.textContent = emailInvites ? 'Uploading & emailing login details…' : 'Uploading…';
    const { status, body } = await apiPost('/api/admin/students/bulk', { ...payload, emailInvites, defaultBatchId: val('bulk-batch') });
    if(status!==200){ el.textContent = body.error||'Upload failed'; return; }
    let msg = 'Added '+body.createdCount+' student(s).';
    if(emailInvites && !body.smtp) msg += ' (Email not sent — SMTP is not configured on the server.)';
    else if(body.emailedCount!=null) msg += ' Emailed '+body.emailedCount+' login'+(body.emailedCount===1?'':'s')+'.';
    if(body.emailErrors && body.emailErrors.length) msg += ' '+body.emailErrors.length+' email(s) FAILED: '+body.emailErrors.slice(0,3).map(x=>x.email+' ('+x.reason+')').join('; ');
    if(body.skipped && body.skipped.length) msg += ' Skipped '+body.skipped.length+': '+body.skipped.map(x=>x.email+' ('+x.reason+')').join('; ');
    toast('Added '+body.createdCount+' students ✓');
    renderStudents(); setTimeout(()=>{ const e=document.getElementById('bulkresult'); if(e) e.textContent=msg; }, 50);
  };
  const f = document.getElementById('bulk-file');
  if(f && f.files && f.files[0]){
    const file = f.files[0];
    if(/\.xlsx$/i.test(file.name)){
      const r=new FileReader();
      r.onload=()=>{ const b64=(String(r.result).split(',')[1])||''; if(!b64){ el.textContent='Could not read the Excel file.'; return; } post({ xlsx:b64 }); };
      r.readAsDataURL(file); return;
    }
    const r=new FileReader();
    r.onload=()=>{ const t=String(r.result||''); if(!t.trim()){ el.textContent='The file looks empty.'; return; } post({ csv:t }); };
    r.readAsText(file); return;
  }
  const t = val('bulk-text');
  if(!t || !t.trim()){ el.textContent='Please choose a file or paste CSV.'; return; }
  post({ csv:t });
}


// ---------- ADMIN: 100 DAYS EDITOR ----------
async function renderAdminChallenge(){
  stopTimer();
  const list = await apiGet('/api/admin/challenge');
  const rows = list.map(q=>`
    <div class="card prow" onclick="editChallenge('${q.id}')">
      <div><div class="t">Day ${q.day}: ${esc(q.title)}</div><div class="tags">${q.sampleCount} open, ${q.hiddenCount} hidden tests</div></div>
      <span class="grow"></span>
      <span class="pill ${pillClass(q.difficulty)}">${esc(q.difficulty)}</span>
      <button class="btn btn-ghost">Edit →</button>
    </div>`).join('');
  app.innerHTML = `<h1>100 Days of Code — Manage</h1>
    <p class="muted">Edit any day's statement, difficulty, test cases, or solution. Changes reflect immediately for students.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
function caseInputs(arr){ return (arr||[]).map(c=>`<div class="caserow"><textarea class="io-in">${esc(c.input)}</textarea><textarea class="io-out">${esc(c.expected)}</textarea><button class="btn btn-ghost" onclick="this.closest('.caserow').remove()">✕</button></div>`).join(''); }
async function editChallenge(id){
  stopTimer();
  const q = await apiGet('/api/admin/challenge/'+id);
  app.innerHTML = `
    <div class="test-top"><button class="btn btn-ghost" onclick="renderAdminChallenge()">← 100 Days</button></div>
    <h1>Day ${q.day}: ${esc(q.title)}</h1><div id="cerr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="c-title" value="${esc(q.title)}"></div>
      <div class="split">
        <div class="field"><label>Difficulty</label><select id="c-diff">${['easy','medium','hard'].map(x=>`<option ${x===q.difficulty?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Answer checking</label><select id="c-checker">${['token','exact','float'].map(x=>`<option value="${x}" ${x===q.checker?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Statement</label><textarea id="c-statement" style="height:130px">${esc(q.statement)}</textarea>
        <button class="btn btn-ghost" type="button" style="margin-top:6px" onclick="uploadImage('c-statement')">📷 Upload image</button></div>
      <div class="field"><label>Reference solution (Python)</label><textarea id="c-ref" class="editor" style="height:120px">${esc(q.reference)}</textarea></div>
      <h2 style="margin-top:14px">Open (visible) test cases</h2><div id="csample-cases">${caseInputs(q.samples)}</div>
      <button class="btn btn-ghost" onclick="document.getElementById('csample-cases').insertAdjacentHTML('beforeend', caseRowHTML())">+ Add open case</button>
      <h2 style="margin-top:16px">Hidden test cases</h2><div id="chidden-cases">${caseInputs(q.hidden)}</div>
      <button class="btn btn-ghost" onclick="document.getElementById('chidden-cases').insertAdjacentHTML('beforeend', caseRowHTML())">+ Add hidden case</button>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="saveChallenge('${q.id}')">Save changes</button></div>
    </div>`;
}
async function saveChallenge(id){
  const collect=(sel)=>[...document.querySelectorAll('#'+sel+' .caserow')].map(r=>({input:r.querySelector('.io-in').value, expected:r.querySelector('.io-out').value}));
  const payload={ title:val('c-title'), difficulty:val('c-diff'), checker:val('c-checker'),
    statement:val('c-statement'), reference:val('c-ref'),
    samples:collect('csample-cases'), hidden:collect('chidden-cases') };
  const { status, body } = await apiPost('/api/admin/challenge/'+id, payload);
  if(status!==200){ document.getElementById('cerr').textContent = body.error||'Could not save'; return; }
  toast('Day saved ✓'); renderAdminChallenge();
}


// ---------- RUN AGAINST CUSTOM INPUT ----------
async function runCustom(){
  const res=document.getElementById('results');
  res.innerHTML='<div class="muted">Running your input…</div>';
  const { body } = await apiPost('/api/run-custom', { language:val('lang'), code:getCode(), input:val('custom-in') });
  if(body.overall==='Language Unavailable'){ res.innerHTML=`<div class="row"><span class="dot bad"></span>${esc(body.note)}</div>`; return; }
  if(body.overall==='Compilation Error'){ res.innerHTML=`<div class="row"><span class="dot bad"></span><b>Compilation Error</b></div><pre class="code">${esc((body.compileOutput||'').slice(0,700))}</pre>`; return; }
  res.innerHTML=`<div class="muted" style="margin-bottom:4px">Output · ${body.timeMs||0}ms</div><pre class="code">${esc(body.output||'(no output)')}</pre>`
    + (body.stderr?`<div class="muted" style="margin-top:6px">stderr</div><pre class="code">${esc(body.stderr.slice(0,400))}</pre>`:'');
}


// ---------- ANTI-CHEATING / PROCTORING ----------
let proctor={tab:0,paste:0,fs:0,copy:0,cam:0,active:false};
// Violations that count toward the 4-strike auto-end: exit full screen, switch
// tab / open a new tab / switch app, and camera loss. Blocked copy/paste is
// recorded for the admin but does NOT count toward auto-end.
function proctorWarnings(){ return proctor.tab+proctor.fs+proctor.cam; }
function bumpLeave(){ const now=Date.now(); if(now-(proctor._lastLeave||0)<800) return; proctor._lastLeave=now; proctor.tab++; updateProctorBadge(); }
function bumpCopy(){ const now=Date.now(); if(now-(proctor._lastCopy||0)<250) return; proctor._lastCopy=now; proctor.copy++; }
function onProctorVis(){ if(!proctor.active) return;
  if(document.hidden){ bumpLeave(); if(examKind!=='test') toast('⚠ You left the test tab — this is recorded'); }
  else if(examMode && examKind==='test'){ showExamBlock('hidden'); } }
function onExamBlur(){ if(examSession && examKind==='test'){ bumpLeave(); showExamBlock('hidden'); } }
function onProctorPaste(){ if(proctor.active){ proctor.paste++; if(examKind!=='test') toast('⚠ Pasting is recorded during a test'); } }
function updateProctorBadge(){
  const n=proctorWarnings();
  // End the Test after 4 violations, keeping whatever has been submitted so far.
  if(examMode && examKind==='test' && window.__test && !window.__autoSubmitting && n>=4){ window.__autoSubmitting=true; finishTest(true); return; }
  const b=document.getElementById('proctor-badge'); if(!b) return;
  b.textContent = n? ('⚠ Violations: '+n+' of 4') : 'Proctoring: on';
  b.style.color = n? '#b23b3b' : 'var(--muted)'; b.style.borderColor = n? '#f0bcbc' : 'var(--line)'; }
function startProctor(){ proctor={tab:0,paste:0,fs:0,copy:0,cam:0,active:true};
  document.addEventListener('visibilitychange', onProctorVis);
  document.addEventListener('paste', onProctorPaste, true); }
function stopProctor(){ if(advancing) return;    // keep proctoring + warning counts across Test questions
  proctor.active=false;
  document.removeEventListener('visibilitychange', onProctorVis);
  document.removeEventListener('paste', onProctorPaste, true); }


// ---------- ADMIN: CONTESTS ----------
async function renderAdminContests(){
  stopTimer();
  const list=await apiGet('/api/admin/contests');
  const rows=list.map(c=>`
    <div class="card prow">
      <div><div class="t">${esc(c.title)}</div><div class="tags">${new Date(c.startAt).toLocaleString()} · ${c.problems} problems · ${c.batchNames.length?('for '+c.batchNames.map(esc).join(', ')):'all batches'}</div></div>
      <span class="grow"></span>
      <span class="pill ${c.status==='running'?'pill-easy':(c.status==='upcoming'?'pill-medium':'pill-hard')}">${c.status}</span>
      <button class="btn btn-ghost" onclick="delContest('${c.id}', this)">Delete</button>
    </div>`).join('') || '<p class="muted">No contests yet.</p>';
  app.innerHTML=`<div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Contests</h1><span class="grow"></span>
      <button class="btn btn-primary" onclick="renderContestForm()">+ New contest</button></div>
    <p class="muted">Timed competitions with a live ICPC-style leaderboard.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
async function delContest(id,btn){ const t=btn.closest('.prow').querySelector('.t').textContent;
  if(!confirm('Delete "'+t+'"?'))return; await fetch('/api/admin/contests/'+id,{method:'DELETE'}); renderAdminContests(); }
async function renderContestForm(){
  stopTimer();
  const [questions, batches, days] = await Promise.all([apiGet('/api/admin/questions'), apiGet('/api/admin/batches'), apiGet('/api/admin/challenge')]);
  const items=[...questions.map(q=>({id:q.id,label:q.title,d:q.difficulty})), ...days.map(q=>({id:q.id,label:'Day '+q.day+': '+q.title,d:q.difficulty}))];
  const qChecks = items.map(x=>`<label class="chk"><input type="checkbox" class="c-q" value="${x.id}"> ${esc(x.label)} <span class="muted">(${esc(x.d)})</span></label>`).join('') || '<span class="muted">No problems yet.</span>';
  const bChecks = batches.length? batches.map(b=>`<label class="chk"><input type="checkbox" class="c-b" value="${b.id}"> ${esc(b.name)}</label>`).join('') : '<span class="muted">No batches.</span>';
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderAdminContests()">← Contests</button></div>
    <h1>New contest</h1><div id="cterr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="ct-title" placeholder="Weekly Contest 1"></div>
      <div class="field"><label>Description (optional)</label><textarea id="ct-desc" style="height:60px"></textarea></div>
      <div class="split">
        <div class="field"><label>Start time</label><input id="ct-start" type="datetime-local"></div>
        <div class="field"><label>Duration (minutes)</label><input id="ct-dur" value="90"></div>
      </div>
      <h2 style="margin-top:14px">Problems</h2><div class="checks">${qChecks}</div>
      <h2 style="margin-top:16px">Assign to batches (leave empty = everyone)</h2><div class="checks">${bChecks}</div>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="submitContest()">Create contest</button></div>
    </div>`;
}
async function submitContest(){
  const problemIds=[...document.querySelectorAll('.c-q:checked')].map(x=>x.value);
  const batchIds=[...document.querySelectorAll('.c-b:checked')].map(x=>x.value);
  const sv=val('ct-start'); const startAt=sv? new Date(sv).getTime():0;
  const { status, body } = await apiPost('/api/admin/contests',{ title:val('ct-title'), description:val('ct-desc'), startAt, durationMin:val('ct-dur'), problemIds, batchIds });
  if(status!==200){ document.getElementById('cterr').textContent=body.error||'Could not create contest'; return; }
  renderAdminContests();
}

// ---------- STUDENT: CONTESTS ----------
async function renderContests(){
  stopTimer();
  const list=await apiGet('/api/contests');
  const rows=list.map(c=>`
    <div class="card prow" onclick="openContest('${c.id}')">
      <div><div class="t">${esc(c.title)}</div><div class="tags">${new Date(c.startAt).toLocaleString()} · ${c.problems} problems</div></div>
      <span class="grow"></span>
      <span class="pill ${c.status==='running'?'pill-easy':(c.status==='upcoming'?'pill-medium':'pill-hard')}">${c.status}</span>
      <button class="btn btn-ghost">Open →</button></div>`).join('') || '<p class="muted">No contests for you yet.</p>';
  app.innerHTML=`<h1>Contests</h1><p class="muted">Timed competitions for your batch.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
async function openContest(id){
  stopTimer();
  window.__examKind='contest';              // lighter exam mode (no camera / clipboard lock)
  window.__examBack=()=>openContest(id);
  const c=await apiGet('/api/contests/'+id); lastStandings=(c.standings||[]);
  const probs=(c.problems||[]).map((p,i)=>`<div class="card prow" onclick="openExamProblem('${p.id}')">
      <div><div class="t">${String.fromCharCode(65+i)}. ${esc(p.title)}</div></div>
      <span class="grow"></span><span class="pill ${pillClass(p.difficulty)}">${esc(p.difficulty)}</span><button class="btn btn-ghost">Solve →</button></div>`).join('') || '<p class="muted">Problems unlock when the contest starts.</p>';
  const stand=(c.standings||[]).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.batch)}</td><td>${r.solved}</td><td>${r.penalty}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No submissions yet.</td></tr>';
  app.innerHTML=`<div class="test-top"><button class="btn btn-ghost" onclick="renderContests()">← Contests</button>
      <span class="proctor" id="ct-count"></span></div>
    <h1 style="display:flex;align-items:center;gap:8px">${esc(c.title)} <span class="pill ${c.status==='running'?'pill-easy':(c.status==='upcoming'?'pill-medium':'pill-hard')}">${c.status}</span></h1>
    ${c.description?`<p class="muted">${esc(c.description)}</p>`:''}
    <div class="split">
      <div class="card"><h2>Problems</h2><div class="plist">${probs}</div></div>
      <div class="card"><h2>Live standings</h2><table><tr><th>#</th><th>Name</th><th>Batch</th><th>Solved</th><th>Penalty</th></tr>${stand}</table>
        <button class="btn btn-ghost" style="margin-top:10px" onclick="openContest('${c.id}')">↻ Refresh</button>
        ${ME.role!=='student'?`<button class="btn btn-ghost" style="margin-top:10px" onclick="exportStandings()">Export CSV</button>`:''}</div>
    </div>`;
  function tick(){ const el=document.getElementById('ct-count'); if(!el){ if(contestTimer)clearInterval(contestTimer); return; }
    const now=Date.now(); let t,label;
    if(now<c.startAt){ t=c.startAt-now; label='Starts in '; }
    else if(now<=c.endAt){ t=c.endAt-now; label='Ends in '; }
    else { el.textContent='Contest ended'; if(contestTimer)clearInterval(contestTimer); return; }
    const sec=Math.max(0,Math.floor(t/1000)); const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),ss=sec%60;
    el.textContent=label+(h?h+'h ':'')+m+'m '+ss+'s'; }
  if(contestTimer)clearInterval(contestTimer); tick(); contestTimer=setInterval(tick,1000);
}


// ---------- REPORTS & CSV EXPORT ----------
function downloadCSV(filename, rows){
  if(!rows || !rows.length){ toast('Nothing to export'); return; }
  const cols=Object.keys(rows[0]);
  const cell=v=>{ v=(v==null?'':String(v)); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; };
  const csv=[cols.join(',')].concat(rows.map(r=>cols.map(c=>cell(r[c])).join(','))).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=filename; a.click();
}
let lastResults=[], lastLeaderboard=[], lastStandings=[];
function exportResults(){ downloadCSV('results.csv', lastResults); }
function exportLeaderboard(){ downloadCSV('leaderboard.csv', lastLeaderboard); }
function exportStandings(){ downloadCSV('contest-standings.csv', lastStandings); }
function exportReportData(){ downloadCSV('top-students.csv', (window.__report&&window.__report.top)||[]); }

async function renderReports(){ stopTimer();
  const d=await apiGet('/api/admin/reports'); window.__report=d;
  const st=(v,l)=>`<div class="statcard" style="cursor:default"><div class="statval">${v}</div><div class="statlabel">${l}</div></div>`;
  const most=(d.mostSolved||[]).map(m=>`<div class="actrow"><span>${esc(m.title)}</span><span class="pill pill-easy">${m.count} solves</span></div>`).join('')||'<p class="muted">No data yet.</p>';
  const top=(d.top||[]).map((t,i)=>`<div class="actrow"><span>#${i+1} ${esc(t.name)}</span><span class="t">${t.solved} solved</span><span class="pill pill-medium">${t.xp} XP</span></div>`).join('')||'<p class="muted">No data yet.</p>';
  app.innerHTML=`<div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Reports</h1><span class="grow"></span>
      <button class="btn btn-ghost" onclick="exportReportData()">Export top students (CSV)</button></div>
    <p class="muted">Activity and performance overview for your placement team.</p>
    <div class="statgrid" style="margin-top:12px">
      ${st(d.totalStudents,'Students')}
      ${st(d.activeToday,'Active today')}
      ${st(d.activeWeek,'Active this week')}
      ${st(d.submissionsToday,'Submissions today')}
      ${st(d.submissionsWeek,'Submissions this week')}
      ${st(d.totalSubmissions,'Total submissions')}
    </div>
    <div class="split" style="margin-top:16px">
      <div class="card"><h2>Most-solved problems</h2>${most}</div>
      <div class="card"><h2>Top students (by XP)</h2>${top}</div>
    </div>`;
}


// ---------- EXAM MODE (fullscreen lockdown; hardened for Tests) ----------
// window.__examKind is set to 'test' (hardened + camera) or 'contest' (light) by
// whoever launched the exam, before openExamProblem runs.
function examCancel(){ if(typeof window.__examBack==='function'){ try{ window.__examBack(); return; }catch(e){} } renderDashboard(); }
async function openExamProblem(id){
  stopTimer();
  window.__test=null;                                  // single-problem (contest) path
  let r=await fetch('/api/problems/'+id); if(!r.ok) r=await fetch('/api/challenge/'+id);
  if(!r.ok){ toast('Problem not found'); return; }
  const d=await r.json(); window.__examDetail=d;
  renderExamGate(d.meta.title);
}
async function beginExam(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;
  if(req){ try{ req.call(el); }catch(e){} }            // synchronous — uses the click gesture
  if((window.__examKind||'')==='test'){
    // Camera is required. Acquire it now (this click is the permission gesture).
    try{ (cam=cam||{}).stream = await navigator.mediaDevices.getUserMedia({ video:{width:320,height:240}, audio:false }); }
    catch(e){ const err=document.getElementById('gate-err');
      if(err) err.textContent='Camera access is required for this test — please allow it and click Start again.';
      try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); }catch(_){}
      return; }
  }
  window.__autoSubmitting=false;
  examMode=true; examKind=window.__examKind||'test';
  if(window.__test){ await loadExamQuestion(); } else { renderTest(window.__examDetail); }
}
function startExam(){
  if(examSession) return;                          // already running (e.g. advancing between Test questions)
  examSession=true;
  document.addEventListener('fullscreenchange', onFsChange);
  window.addEventListener('beforeunload', onExamUnload);
  document.addEventListener('contextmenu', preventCtx);
  if(examKind==='test'){
    document.addEventListener('copy', blockClipboard, true);
    document.addEventListener('cut', blockClipboard, true);
    document.addEventListener('paste', blockPaste, true);
    document.addEventListener('dragstart', preventSelect, true);
    document.addEventListener('keydown', blockKeys, true);
    window.addEventListener('blur', onExamBlur);
    startCam(false);
  }
}
function stopExam(){
  if(advancing) return;                          // moving to the next question within a Test — keep the session alive
  if(!examSession){ return; }                    // don't null examKind here: it must survive the render transition
  examSession=false; examMode=false;
  document.removeEventListener('fullscreenchange', onFsChange);
  window.removeEventListener('beforeunload', onExamUnload);
  document.removeEventListener('contextmenu', preventCtx);
  document.removeEventListener('copy', blockClipboard, true);
  document.removeEventListener('cut', blockClipboard, true);
  document.removeEventListener('paste', blockPaste, true);
  document.removeEventListener('dragstart', preventSelect, true);
  document.removeEventListener('keydown', blockKeys, true);
  window.removeEventListener('blur', onExamBlur);
  stopCam();
  const o=document.getElementById('exam-block'); if(o) o.remove();
  try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); }catch(e){}
  examKind=null;
}
function onFsChange(){ if(examSession && !document.fullscreenElement){ proctor.fs++; updateProctorBadge();
  if(examKind==='test') showExamBlock('fullscreen'); else toast('⚠ You left full screen — recorded'); } }
function onExamUnload(e){ if(examSession){ e.preventDefault(); e.returnValue=''; return ''; } }
function preventCtx(e){ if(examSession) e.preventDefault(); }
function blockClipboard(e){ if(examSession && examKind==='test'){ e.preventDefault(); bumpCopy(); toast('⚠ Copying is disabled during the test'); } }
function blockPaste(e){ if(examSession && examKind==='test'){ e.preventDefault(); toast('⚠ Pasting is disabled during the test'); } }
function preventSelect(e){ if(examSession && examKind==='test') e.preventDefault(); }
function blockKeys(e){ if(!examSession || examKind!=='test') return;
  const k=(e.key||'').toLowerCase(), ctrl=e.ctrlKey||e.metaKey;
  if(k==='f12'){ e.preventDefault(); return; }
  if(ctrl && e.shiftKey && (k==='i'||k==='j'||k==='c')){ e.preventDefault(); return; }   // devtools
  // Block copy/cut/paste keys too — the editor (Monaco) can bypass the clipboard events.
  if(ctrl && (k==='c'||k==='x'||k==='v')){ e.preventDefault(); e.stopPropagation(); bumpCopy(); toast('⚠ Copy/paste is disabled during the test'); return; }
  if(ctrl && (k==='p'||k==='s'||k==='u')){ e.preventDefault(); return; }                 // print / save / view-source
}

// A full-screen overlay that blocks the test and forces the student to return.
function showExamBlock(reason){
  if(examKind!=='test') return;
  let o=document.getElementById('exam-block');
  if(!o){ o=document.createElement('div'); o.id='exam-block'; document.body.appendChild(o); }
  const msg = reason==='camera' ? 'Your camera is off or covered. Please face the camera to continue.'
    : reason==='hidden' ? 'You left the test window — this has been recorded.'
    : 'You left full screen — this has been recorded.';
  o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(14,14,20,.97);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px';
  o.innerHTML=`<div style="max-width:440px"><div style="font-size:42px">🔒</div>
    <h2 style="margin:8px 0">Test paused</h2>
    <p style="opacity:.85;line-height:1.5">${msg}</p>
    <button id="exam-resume-btn" style="margin-top:14px;padding:12px 24px;font-size:15px;border:0;border-radius:10px;background:#e8a33d;color:#1a1205;font-weight:700;cursor:pointer">Return to test</button></div>`;
  o.style.display='flex';
  const btn=document.getElementById('exam-resume-btn'); if(btn) btn.onclick=examResume;
}
function hideExamBlock(){ const o=document.getElementById('exam-block'); if(o) o.style.display='none'; }
async function examResume(){
  if(!document.fullscreenElement){ const el=document.documentElement; const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen; if(req){ try{ await req.call(el); }catch(e){} } }
  if(cam && cam.trackDead){ await startCam(true); }
  if(document.fullscreenElement && !document.hidden && !(cam && cam.lost)) hideExamBlock();
}

// Webcam proctoring: periodic snapshots + covered/lost detection.
async function startCam(reacquire){
  cam = cam || {};
  if(reacquire || !cam.stream){
    try{ cam.stream = await navigator.mediaDevices.getUserMedia({ video:{width:320,height:240}, audio:false }); cam.trackDead=false; }
    catch(e){ cam.lost=true; cam.trackDead=true; if(examMode&&examKind==='test'){ proctor.cam++; updateProctorBadge(); showExamBlock('camera'); } return false; }
  }
  cam.lost=false;
  if(!cam.video){
    cam.wrap=document.createElement('div'); cam.wrap.id='cam-preview';
    cam.wrap.style.cssText='position:fixed;right:14px;bottom:14px;z-index:90;width:160px;border-radius:10px;overflow:hidden;border:2px solid #e8a33d;box-shadow:0 6px 18px rgba(0,0,0,.35);background:#000';
    cam.video=document.createElement('video'); cam.video.autoplay=true; cam.video.muted=true; cam.video.playsInline=true;
    cam.video.style.cssText='width:160px;height:120px;object-fit:cover;display:block;transform:scaleX(-1)';   // mirror for a natural self-view
    const badge=document.createElement('div');
    badge.innerHTML='<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff4d4d;margin-right:5px;vertical-align:middle"></span>Proctoring';
    badge.style.cssText='position:absolute;top:5px;left:7px;color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.85)';
    cam.wrap.appendChild(cam.video); cam.wrap.appendChild(badge); document.body.appendChild(cam.wrap);
  }
  cam.video.srcObject=cam.stream; try{ await cam.video.play(); }catch(e){}
  if(!cam.canvas){ cam.canvas=document.createElement('canvas'); cam.canvas.width=320; cam.canvas.height=240; }
  const track=cam.stream.getVideoTracks()[0];
  if(track){ track.onended=()=>{ cam.lost=true; cam.trackDead=true; if(examMode&&examKind==='test'){ proctor.cam++; updateProctorBadge(); showExamBlock('camera'); } }; }
  if(!cam.timer){ cam.timer=setInterval(()=>camSnap('interval'), 30000); setTimeout(()=>camSnap('start'), 1500); }
  return true;
}
function camSnap(kind){
  try{
    if(!cam || !cam.video || !cam.canvas || cam.trackDead) return;
    const ctx=cam.canvas.getContext('2d'); ctx.drawImage(cam.video,0,0,cam.canvas.width,cam.canvas.height);
    let avg=255; try{ const data=ctx.getImageData(0,0,cam.canvas.width,cam.canvas.height).data; let s=0,n=0;
      for(let i=0;i<data.length;i+=40){ s+=data[i]+data[i+1]+data[i+2]; n++; } avg=s/(n*3); }catch(e){}
    if(avg<12){ cam.dark=(cam.dark||0)+1;
      if(cam.dark>=2 && !cam.lost){ cam.lost=true; proctor.cam++; updateProctorBadge(); if(examMode&&examKind==='test') showExamBlock('camera'); }
    } else { cam.dark=0; if(cam.lost && !cam.trackDead) cam.lost=false; }
    if(avg>=12){ const img=cam.canvas.toDataURL('image/jpeg',0.5);
      apiPost('/api/proctor/snapshot',{ problemId:(curProblem&&curProblem.meta&&curProblem.meta.id)||'', image:img, kind }).catch(()=>{}); }
  }catch(e){}
}
function stopCam(){
  if(!cam) return;
  if(cam.timer){ clearInterval(cam.timer); cam.timer=null; }
  try{ if(cam.stream) cam.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
  try{ if(cam.video) cam.video.srcObject=null; if(cam.wrap) cam.wrap.remove(); else if(cam.video) cam.video.remove(); }catch(e){}
  cam=null;
}

// ---------- IMAGE UPLOAD ----------
function uploadImage(targetId){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f) return;
    toast('Processing image…');
    const rd=new FileReader();
    rd.onload=()=>{
      const img=new Image();
      img.onload=async()=>{
        // Downscale large images (phone photos, big screenshots) so the encoded
        // payload stays under the server's 2 MB cap instead of being rejected.
        const MAXDIM=1400; let w=img.width, h=img.height;
        if(w>MAXDIM||h>MAXDIM){ const s=Math.min(MAXDIM/w, MAXDIM/h); w=Math.round(w*s); h=Math.round(h*s); }
        const canvas=document.createElement('canvas'); canvas.width=w||1; canvas.height=h||1;
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        // Keep PNG (crisp for diagrams/screenshots) unless it's too big, then JPEG.
        let dataUrl=canvas.toDataURL('image/png'); const CAP=2.5*1024*1024;
        if(dataUrl.length>CAP){ dataUrl=canvas.toDataURL('image/jpeg',0.9);
          for(let q=0.85; q>0.4 && dataUrl.length>CAP; q-=0.1) dataUrl=canvas.toDataURL('image/jpeg',q); }
        if(dataUrl.length>2.6*1024*1024){ toast('Image is too large even after resizing — please pick a smaller one'); return; }
        const { status, body } = await apiPost('/api/admin/upload', { dataUrl });
        if(status!==200){ toast(body.error||'Upload failed'); return; }
        const ta=document.getElementById(targetId);
        if(ta){ ta.value += (ta.value.endsWith('\n')||!ta.value?'':'\n')+'![image]('+body.url+')\n'; showImagePreview(targetId, body.url); }
        toast('Image uploaded & inserted ✓');
      };
      img.onerror=()=>toast('Could not read that image file');
      img.src=rd.result;
    };
    rd.onerror=()=>toast('Could not read that file');
    rd.readAsDataURL(f); };
  inp.click();
}
// Visible confirmation that the image was uploaded (the statement box only holds
// markdown text, which previously made a successful upload look like it failed).
function showImagePreview(targetId, url){
  const ta=document.getElementById(targetId); if(!ta) return;
  let box=document.getElementById(targetId+'-imgprev');
  if(!box){ box=document.createElement('div'); box.id=targetId+'-imgprev';
    box.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
    ta.parentNode.insertBefore(box, ta.nextSibling); }
  const im=document.createElement('img'); im.src=url; im.title=url;
  im.style.cssText='max-height:72px;border-radius:6px;border:1px solid #e5ddc8';
  box.appendChild(im);
}
