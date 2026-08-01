// app.js — single-page app with login accounts (students + faculty).
const app = document.getElementById('app');
const userbar = document.getElementById('userbar');
let ME = null, LANGS = { available:{}, labels:{} }, PROBLEMS = [], timer = null, contestTimer = null, examMode = false, examSession = false;

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
        <p class="muted" style="margin-top:10px;font-size:12px;text-align:center">Forgot your password? Ask your administrator to reset it.</p>
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
  ME = body.user; await boot();
}
async function doRegister(){
  const { status, body } = await apiPost('/api/register', { role:val('role'), name:val('name'), email:val('email'),
    password:val('password'), mobile:val('mobile'), college:val('college'), branch:val('branch'), yearOfPassing:val('yearOfPassing') });
  if(status!==200){ document.getElementById('autherr').textContent = body.error||'Could not create account'; return; }
  ME = body.user; await boot();
}
async function doLogout(){ await apiPost('/api/logout', {}); ME=null; stopTimer(); renderAuth('login'); }

function renderUserbar(){
  let nav = '';
  if(ME.role==='admin'){
    nav = `<button onclick="renderAdminQuestions()">Questions</button>
           <button onclick="renderBatches()">Batches</button>
           <button onclick="renderStudents()">Students</button>
           <button onclick="renderSubadmins()">Sub-Admins</button>
           <button onclick="renderFaculty()">Results</button>
           <button onclick="renderReports()">Reports</button>
           <button onclick="renderList()">Preview</button>`;
  } else if(ME.role==='subadmin'){
    nav = `<button onclick="renderFaculty()">Results</button>`;
  } else {
    nav = `<button onclick="renderStudentTests()">My Tests</button>
           <button onclick="renderContests()">Contests</button>
           <button onclick="renderChallenge()">100 Days</button>
           <button onclick="renderLeaderboard()">Leaderboard</button>
           <button onclick="renderList()">All Problems</button>
           <button onclick="renderDashboard()">My Dashboard</button>`;
  }
  userbar.innerHTML = `<nav>${nav}</nav>
    <span class="who">${esc(ME.name)} · ${esc(ME.role)}</span>
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
  const fnMode = !!(d.meta && d.meta.mode==='function');
  const availLangs = (fnMode ? (d.functionLangs||[]) : Object.keys(LANGS.labels)).filter(k=>LANGS.available[k]);
  const startLang = availLangs[0] || firstAvailableLang();
  const langOpts = (availLangs.length?availLangs:Object.keys(LANGS.labels).filter(k=>LANGS.available[k])).map(k=>`<option value="${k}">${esc(LANGS.labels[k]||k)}</option>`).join('');
  app.innerHTML = `
    ${examMode?'<div class="exambar">🔒 Exam in progress — stay in full screen &amp; do not switch tabs. Violations are recorded.</div>':''}
    <div class="test-top">
      <button class="btn btn-ghost" onclick="renderList()">← Problems</button>
      <span class="proctor" id="proctor-badge">Proctoring: on</span>
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
          <button class="btn btn-primary" onclick="doSubmit('${d.meta.id}')">Submit</button>
          <button class="btn btn-ghost" onclick="viewSolution('${d.meta.id}')">Solution</button>
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
  mountEditor(starterFor(startLang), startLang);
  // Restore any previously written code for this problem so a reload/re-attempt never loses work (#3).
  try{ const saved=localStorage.getItem('tb_code_'+(d.meta&&d.meta.id)); if(saved && saved.trim()) setCode(saved); }catch(e){}
  startTimer(); startProctor(); updateProctorBadge();
  if(examMode) startExam();
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
function onLangChange(){ const k=document.getElementById('lang').value;
  const cur=getCode().trim();
  const known=Object.values(starters).map(x=>String(x).trim());
  if(curProblem&&curProblem.starters) known.push(...Object.values(curProblem.starters).map(x=>String(x).trim()));
  if(known.includes(cur)||cur==='') setCode(starterFor(k));
  setEditorLang(k);
  const ef=document.getElementById('editor-file'); if(ef) ef.textContent=fileFor[k]||'main'; }
function startTimer(){ let t=30*60; timer=setInterval(()=>{ if(t>0)t--; const m=Math.floor(t/60),s=t%60;
  const el=document.getElementById('timer'); if(el) el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s; },1000); }

function verdictRow(r){ const cls=r.verdict==='Accepted'?'ok':'bad'; const name=r.hidden?'Hidden test '+r.index:'Sample test '+r.index;
  const t = r.timeMs!=null?` <span class="muted">· ${r.timeMs} ms</span>`:'';
  let extra=''; if(r.verdict!=='Accepted' && r.got!==undefined) extra=` <span class="muted">got "${esc((r.got||'').trim().slice(0,80))}", expected "${esc((r.expected||'').trim().slice(0,80))}"</span>`;
  return `<div class="row"><span class="dot ${cls}"></span>${name}: <b>&nbsp;${esc(r.verdict)}</b>${t}${extra}</div>`; }
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
  const { body:out } = await apiPost('/api/run',{ problemId:id, language:val('lang'), code:getCode() });
  if(out.overall==='Language Unavailable'){ res.innerHTML=`<div class="row"><span class="dot bad"></span>${esc(out.note)}</div>`; return; }
  if(out.overall==='Compilation Error'){ res.innerHTML=`<div class="row"><span class="dot bad"></span><b>Compilation Error</b></div><pre class="code">${esc((out.compileOutput||'').slice(0,600))}</pre>`; return; }
  res.innerHTML='<div class="muted" style="margin-bottom:4px">Sample result</div>'+out.results.map(verdictRow).join(''); }

async function doSubmit(id){ const res=document.getElementById('results'); res.innerHTML='<div class="muted">Judging all tests…</div>';
  try{ localStorage.setItem('tb_code_'+id, getCode()); }catch(e){}   // preserve work so it is never lost (#3)
  let resp;
  try{ resp = await apiPost('/api/submit',{ problemId:id, language:val('lang'), code:getCode(), practice: !examMode, flags:{ tabSwitches:proctor.tab, pasteAttempts:proctor.paste } }); }
  catch(e){ res.innerHTML='<div class="row"><span class="dot bad"></span>Network error — your code is safe. Please try Submit again.</div>'; return; }
  const { status, body:out } = resp;
  if(status===401){ alert('Please log in again.'); renderAuth('login'); return; }
  if(!out || status>=500){ res.innerHTML='<div class="row"><span class="dot bad"></span>The judge could not process this submission. Your code is preserved — please try again.</div>'; return; }
  renderFeedback(await apiGet('/api/problems/'+id), out); }

// ---------- FEEDBACK ----------
function renderFeedback(d,out){
  stopTimer();
  if(out.overall==='Language Unavailable'){ alert(out.note); return; }
  const pass = out.overall==='Accepted'; const fb = out.feedback||{};
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
      <button class="btn btn-primary" onclick="openProblem('${d.meta.id}')">↻ Re-attempt</button></div>
    <div class="scorecard ${pass?'':'fail'}">
      <div class="score-big">${out.score||0}<span style="font-size:16px;color:#8a836f">/100</span></div>
      <div><b>${esc(out.overall)}</b> — ${out.passed} of ${out.total} tests passed<br>
        <span class="muted">${esc(d.meta.title)}</span></div></div>
    <div class="tabs">
      <div class="tab active" data-p="fp1">What happened</div>
      <div class="tab" data-p="fp2">Correct solution</div>
      <div class="tab" data-p="fp3">How to improve</div></div>
    <div class="pane active" id="fp1">${fb.summary?`<p>${esc(fb.summary)}</p>`:''}
      ${statTiles}
      ${pub.length?`<h3 class="fbsec">Public tests</h3>${pub.map(caseCard).join('')}`:''}
      ${hidden.length?`<h3 class="fbsec">Hidden tests <span class="muted" style="font-weight:400;font-size:12px">— ${hiddenPass}/${hidden.length} passed</span></h3>${hidden.map(caseCard).join('')}`:''}
    </div>
    <div class="pane" id="fp2">${renderSolutions(fb.solutions, fb.timeComplexity, fb.spaceComplexity)}</div>
    <div class="pane" id="fp3">${((fb.improve&&fb.improve.videos)||[]).map(v=>`<span class="chip">▶ ${esc(v)}</span>`).join('')}
      <p class="muted" style="margin-top:12px">${esc((fb.improve&&fb.improve.note)||'')}</p></div>`;
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active')); t.classList.add('active');
    document.getElementById(t.dataset.p).classList.add('active'); });
}
function copyRef(){ const t=document.getElementById('refcode').innerText; navigator.clipboard&&navigator.clipboard.writeText(t); }

// ---------- STUDENT DASHBOARD ----------
async function renderDashboard(){ stopTimer();
  const [d, ch, g] = await Promise.all([apiGet('/api/dashboard'), apiGet('/api/challenge').catch(()=>({days:[]})), apiGet('/api/gamify').catch(()=>({}))]);
  const daysSolved = (ch.days||[]).filter(x=>x.solved).length;
  const rows = Object.entries(d.problems||{}).map(([id,x])=>`
    <div class="skill"><div class="r"><span>${esc(x.title)}</span><span>${x.best}/100 · ${x.attempts} tries</span></div>
    <div class="track"><i style="width:${x.best}%"></i></div></div>`).join('') || '<p class="muted">No submissions yet — go solve a problem!</p>';
  const st=(v,l)=>`<div class="statcard" style="cursor:default"><div class="statval">${v}</div><div class="statlabel">${l}</div></div>`;
  const xp=g.xp||0, level=g.level||1, xpToNext=(g.xpToNext==null?100:g.xpToNext);
  const badges=(g.badges||[]).map(b=>`<span class="chip">${b.icon} ${esc(b.name)}</span>`).join('') || '<span class="muted">Solve problems to earn badges.</span>';
  const daily = g.daily? `<div class="card prow" onclick="openChallenge('${g.daily.id}')" style="margin-bottom:14px">
      <div><div class="t">🌟 Daily Challenge — ${esc(g.daily.title)}</div><div class="tags">Today's pick — solve it to keep your streak</div></div>
      <span class="grow"></span><span class="pill ${pillClass(g.daily.difficulty)}">${esc(g.daily.difficulty)}</span><button class="btn btn-primary">Solve →</button></div>` : '';
  app.innerHTML = `
    <div class="hero">
      <div><h1 style="margin:0">Hi ${esc(ME.name.split(' ')[0])} 👋</h1>
        <p class="muted" style="margin:4px 0 0">Level ${level} · ${xp} XP · ${xpToNext} XP to next level</p>
        <div class="track" style="width:240px;margin-top:8px"><i style="width:${100-xpToNext}%"></i></div></div>
      <div style="text-align:center"><div style="font-size:30px;line-height:1">🔥 ${g.streak||0}</div><div class="statlabel">day streak</div></div>
    </div>
    <div class="statgrid">
      ${st(d.solved||0,'Problems solved')}
      ${st(xp,'XP')}
      ${st('#'+(g.rank||'—'),'Leaderboard rank')}
      ${st(daysSolved+' / 100','100 Days progress')}
    </div>
    ${daily}
    <div class="card" style="margin:14px 0"><h2>Badges</h2><div class="qa">${badges}</div></div>
    <div class="qa" style="margin:16px 0">
      <button class="btn btn-primary" onclick="renderStudentTests()">My Tests</button>
      <button class="btn btn-ghost" onclick="renderChallenge()">100 Days</button>
      <button class="btn btn-ghost" onclick="renderLeaderboard()">Leaderboard</button>
      <button class="btn btn-ghost" onclick="renderList()">All Problems</button>
    </div>
    <div class="card"><h2>Best score per problem</h2>${rows}</div>`;
}

async function renderLeaderboard(){ stopTimer();
  const d = await apiGet('/api/leaderboard'); lastLeaderboard = (d.top||[]);
  const rows = (d.top||[]).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.batch)}</td><td>${r.xp}</td><td>${r.level}</td><td>${r.solved}</td><td>🔥 ${r.streak}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No submissions yet.</td></tr>';
  app.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Leaderboard</h1><span class="grow"></span><button class="btn btn-ghost" onclick="exportLeaderboard()">Export CSV</button></div><p class="muted">Top students by XP.</p>
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
  const rows = (d.students||[]).map(s=>`<tr data-batch="${esc(s.batch)}"><td>${esc(s.name)}</td><td>${esc(s.batch)}</td><td>${esc(s.branch)}</td><td>${esc(s.year)}</td><td>${s.avg}</td><td>${s.solved}</td><td>${s.attempts}</td><td>${s.flags?('<span class="badge b-imp">⚠ '+s.flags+'</span>'):'—'}</td><td>${status(s.avg)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="muted">No students yet.</td></tr>';
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
      <table><tr><th>Student</th><th>Batch</th><th>Branch</th><th>Year</th><th>Avg</th><th>Solved</th><th>Attempts</th><th>Flags</th><th>Status</th></tr>
      <tbody id="an-rows">${rows}</tbody></table></div>
    <div class="card"><h2>Weakest topics</h2>${weak}</div>`;
}
function filterStudents(){ const v=document.getElementById('an-filter').value;
  document.querySelectorAll('#an-rows tr').forEach(tr=>{ tr.style.display=(!v||tr.dataset.batch===v)?'':'none'; }); }

// ---------- BOOT ----------
async function boot(){
  renderUserbar();
  LANGS = await apiGet('/api/languages');
  PROBLEMS = await apiGet('/api/problems');
  if(ME.role==='admin') renderAdminHome(); else if(ME.role==='subadmin') renderFaculty(); else renderList();
}
document.addEventListener('keydown', (e)=>{
  if(e.key==='Tab' && e.target && e.target.classList && e.target.classList.contains('editor')){
    e.preventDefault();
    const ta=e.target, a=ta.selectionStart, b=ta.selectionEnd;
    ta.value=ta.value.slice(0,a)+'    '+ta.value.slice(b);
    ta.selectionStart=ta.selectionEnd=a+4;
  }
});
(async function init(){
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
  const rows = list.map(b=>`
    <div class="card prow">
      <div><div class="t">${esc(b.name)}</div><div class="tags">${b.students} student(s)</div></div>
      <span class="grow"></span>
      <button class="btn btn-ghost" onclick="delBatch('${b.id}','${esc(b.name).replace(/'/g,"\\'")}')">Delete</button>
    </div>`).join('') || '<p class="muted">No batches yet. Create one below.</p>';
  app.innerHTML = `<h1>Batches</h1>
    <p class="muted">Group students into batches (e.g. CSE-A 2027). You’ll assign batches to sub-admins later.</p>
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
    <div class="card" style="margin-bottom:14px"><h2>Bulk upload students (CSV)</h2>
      <p class="muted" style="margin-top:0">In Excel choose <b>File → Save As → CSV</b>. Columns: <span class="k">name,email,password,mobile,college,branch,year,batch</span> (only name &amp; email required). <a href="#" onclick="downloadTemplate();return false;">Download template</a></p>
      <div class="split">
        <div class="field"><label>Choose CSV file</label><input type="file" id="bulk-file" accept=".csv"></div>
        <div class="field"><label>Default batch (for rows with no batch)</label><select id="bulk-batch">${opts('')}</select></div>
      </div>
      <div class="field"><label>…or paste CSV here</label><textarea id="bulk-text" style="height:90px" placeholder="name,email,password,batch"></textarea></div>
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
  const qChecks = questions.length ? questions.map(q=>`<label class="chk"><input type="checkbox" class="q-pick" value="${q.id}"> ${esc(q.title)} <span class="muted">(${esc(q.difficulty)})</span></label>`).join('')
    : '<span class="muted">No questions yet — create some in the Questions tab.</span>';
  const bChecks = batches.length ? batches.map(b=>`<label class="chk"><input type="checkbox" class="b-pick" value="${b.id}"> ${esc(b.name)}</label>`).join('')
    : '<span class="muted">No batches yet.</span>';
  app.innerHTML = `<div class="test-top"><button class="btn btn-ghost" onclick="renderAdminTests()">← Tests</button></div>
    <h1>New test / challenge</h1><div id="terr" class="err"></div>
    <div class="card">
      <div class="field"><label>Title</label><input id="t-title" placeholder="Week 1 — Arrays & Strings"></div>
      <div class="field"><label>Description (optional)</label><textarea id="t-desc" style="height:70px"></textarea></div>
      <h2 style="margin-top:14px">Pick questions</h2>
      <div class="checks">${qChecks}</div>
      <h2 style="margin-top:16px">Assign to batches</h2>
      <p class="muted" style="margin-top:0">Leave all unchecked to show this test to every student.</p>
      <div class="checks">${bChecks}</div>
      <div style="margin-top:16px"><button class="btn btn-primary" onclick="submitTest()">Create test</button></div>
    </div>`;
}
async function submitTest(){
  const questionIds = [...document.querySelectorAll('.q-pick:checked')].map(x=>x.value);
  const batchIds = [...document.querySelectorAll('.b-pick:checked')].map(x=>x.value);
  const { status, body } = await apiPost('/api/admin/tests',
    { title:val('t-title'), description:val('t-desc'), questionIds, batchIds });
  if(status!==200){ document.getElementById('terr').textContent = body.error||'Could not create test'; return; }
  renderAdminTests();
}

// ---------- STUDENT: MY TESTS ----------
async function renderStudentTests(){
  stopTimer();
  const list = await apiGet('/api/tests');
  const rows = list.map(t=>`
    <div class="card prow" onclick="openTest('${t.id}')">
      <div><div class="t">${esc(t.title)}</div>
        <div class="tags">${t.questionCount} question(s)${t.description?' · '+esc(t.description):''}</div></div>
      <span class="grow"></span><button class="btn btn-ghost">Open →</button>
    </div>`).join('') || '<p class="muted">No tests assigned to you yet. Try “All Problems” to practise freely.</p>';
  app.innerHTML = `<h1>My Tests</h1><p class="muted">Tests your college has assigned to your batch.</p>
    <div class="plist" style="margin-top:14px">${rows}</div>`;
}
async function openTest(id){
  const t = await apiGet('/api/tests/'+id);
  const rows = (t.questions||[]).map(q=>`
    <div class="card prow" onclick="openExamProblem('${q.id}')">
      <div><div class="t">${esc(q.title)}</div><div class="tags">${esc((q.tags||[]).join(' · '))}</div></div>
      <span class="grow"></span><span class="pill ${pillClass(q.difficulty)}">${esc(q.difficulty)}</span>
      <button class="btn btn-ghost">Solve →</button>
    </div>`).join('') || '<p class="muted">This test has no questions yet.</p>';
  app.innerHTML = `<div class="test-top"><button class="btn btn-ghost" onclick="renderStudentTests()">← My Tests</button></div>
    <h1>${esc(t.title)}</h1>${t.description?`<p class="muted">${esc(t.description)}</p>`:''}
    <div class="plist" style="margin-top:14px">${rows}</div>`;
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
  const csv = 'name,email,password,mobile,college,branch,year,batch\nRahul Sharma,rahul@abc.edu,pass1234,9876543210,ABC College,CSE,2027,\nPriya Patil,priya@abc.edu,,9876500000,ABC College,IT,2026,\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = 'students-template.csv'; a.click();
}
async function bulkUpload(){
  const el = document.getElementById('bulkresult');
  const send = async (csv)=>{
    if(!csv || !csv.trim()){ el.textContent='Please choose a file or paste CSV.'; return; }
    el.textContent='Uploading…';
    const { status, body } = await apiPost('/api/admin/students/bulk', { csv, defaultBatchId: val('bulk-batch') });
    if(status!==200){ el.textContent = body.error||'Upload failed'; return; }
    let msg = 'Added '+body.createdCount+' student(s).';
    if(body.skipped && body.skipped.length) msg += ' Skipped '+body.skipped.length+': '+body.skipped.map(x=>x.email+' ('+x.reason+')').join('; ');
    toast('Added '+body.createdCount+' students ✓');
    renderStudents(); setTimeout(()=>{ const e=document.getElementById('bulkresult'); if(e) e.textContent=msg; }, 50);
  };
  const f = document.getElementById('bulk-file');
  if(f.files && f.files[0]){ const r=new FileReader(); r.onload=()=>send(r.result); r.readAsText(f.files[0]); }
  else send(val('bulk-text'));
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
let proctor={tab:0,paste:0,active:false};
function onProctorVis(){ if(proctor.active && document.hidden){ proctor.tab++; toast('⚠ You left the test tab — this is recorded'); updateProctorBadge(); } }
function onProctorPaste(){ if(proctor.active){ proctor.paste++; toast('⚠ Pasting is recorded during a test'); updateProctorBadge(); } }
function updateProctorBadge(){ const b=document.getElementById('proctor-badge'); if(!b) return;
  const n=proctor.tab+proctor.paste; b.textContent = n? ('⚠ Proctoring: '+n+' warning'+(n===1?'':'s')) : 'Proctoring: on';
  b.style.color = n? '#b23b3b' : 'var(--muted)'; b.style.borderColor = n? '#f0bcbc' : 'var(--line)'; }
function startProctor(){ proctor={tab:0,paste:0,active:true};
  document.addEventListener('visibilitychange', onProctorVis);
  document.addEventListener('paste', onProctorPaste, true); }
function stopProctor(){ proctor.active=false;
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
        <button class="btn btn-ghost" style="margin-top:10px" onclick="exportStandings()">Export CSV</button></div>
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


// ---------- EXAM MODE (fullscreen lockdown for tests & contests) ----------
async function openExamProblem(id){
  stopTimer();
  let r=await fetch('/api/problems/'+id); if(!r.ok) r=await fetch('/api/challenge/'+id);
  if(!r.ok){ toast('Problem not found'); return; }
  const d=await r.json(); window.__examDetail=d;
  app.innerHTML=`<div class="examgate"><div class="examgate-card">
    <div class="auth-logo"></div>
    <h1 style="margin:12px 0 2px">Proctored Test</h1>
    <p class="muted" style="margin:0">${esc(d.meta.title)}</p>
    <ul class="examrules">
      <li>The test opens in <b>full screen</b>.</li>
      <li><b>Do not switch tabs</b> or exit full screen — each time is recorded.</li>
      <li>Leaving or closing the page is logged and reported to your admin.</li>
      <li>Submitting ends the test.</li>
    </ul>
    <button class="btn btn-primary" onclick="beginExam()">Start Test in Full Screen</button>
    <button class="btn btn-ghost" style="margin-left:8px" onclick="history.length>1?history.back():renderList()">Cancel</button>
  </div></div>`;
}
function beginExam(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;
  if(req){ try{ req.call(el); }catch(e){} }
  examMode=true;
  renderTest(window.__examDetail);
}
function startExam(){
  examSession=true;
  document.addEventListener('fullscreenchange', onFsChange);
  window.addEventListener('beforeunload', onExamUnload);
  document.addEventListener('contextmenu', preventCtx);
}
function stopExam(){
  if(!examSession && !examMode){ return; }
  examSession=false; examMode=false;
  document.removeEventListener('fullscreenchange', onFsChange);
  window.removeEventListener('beforeunload', onExamUnload);
  document.removeEventListener('contextmenu', preventCtx);
  try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); }catch(e){}
}
function onFsChange(){ if(examSession && !document.fullscreenElement){ proctor.tab++; updateProctorBadge(); toast('⚠ You left full screen — recorded'); } }
function onExamUnload(e){ if(examSession){ e.preventDefault(); e.returnValue=''; return ''; } }
function preventCtx(e){ if(examSession) e.preventDefault(); }

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
