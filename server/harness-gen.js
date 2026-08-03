// harness-gen.js — generate function-mode harnesses (starter + hidden driver)
// from a compact signature spec, so admins define a problem by its function
// signature instead of hand-writing driver code for every language.
//
// spec = { fn, params: [{ name, type }], returns }
// Supported types (Stage 1): int, long, double, bool, string,
//   int[], long[], double[], string[], bool[], int[][], long[][], double[][]
// (int/long are both treated as 64-bit to avoid overflow.)
//
// Input format the generated drivers read (whitespace-separated token stream,
// matching the existing 100-Days convention): each parameter in order —
//   scalar -> 1 token;  array -> N then N tokens;  matrix -> R C then R*C tokens.
// Output: the return value printed token-style (arrays space-joined, bool as
// true/false, matrix one row per line). The token checker ignores spacing.

function parseType(t) {
  t = String(t || '').trim(); let dims = 0;
  while (t.endsWith('[]')) { dims++; t = t.slice(0, -2).trim(); }
  let base = t.toLowerCase();
  if (base === 'integer') base = 'int';
  if (base === 'str') base = 'string';
  if (base === 'boolean') base = 'bool';
  if (base === 'float') base = 'double';
  return { base, dims };
}
const SCALARS = ['int', 'long', 'double', 'bool', 'string'];
function validType(t) {
  const { base, dims } = parseType(t);
  return SCALARS.includes(base) && dims >= 0 && dims <= 2;
}

// ---------------- Python ----------------
const PY_PRE = `import sys
_toks = sys.stdin.buffer.read().split()
_pos = 0
def _next():
    global _pos; v = _toks[_pos]; _pos += 1; return v.decode()
def _int(): return int(_next())
def _flt(): return float(_next())
def _bool(): return _next().lower() in ('1', 'true', 'yes')
def _str(): return _next()
def _arr(f):
    n = int(_next()); return [f() for _ in range(n)]
def _mat(f):
    r = int(_next()); c = int(_next()); return [[f() for _ in range(c)] for _ in range(r)]`;
const PY_BASE = { int: '_int', long: '_int', double: '_flt', bool: '_bool', string: '_str' };
function pyRead(t) { const { base, dims } = parseType(t); const b = PY_BASE[base];
  if (dims === 0) return `${b}()`; if (dims === 1) return `_arr(${b})`; return `_mat(${b})`; }
function pyPrint(t, v) { const { base, dims } = parseType(t);
  if (dims === 0) return base === 'bool' ? `print('true' if ${v} else 'false')` : `print(${v})`;
  if (dims === 1) return base === 'bool' ? `print(*['true' if _x else 'false' for _x in ${v}])` : `print(*${v})`;
  return `for _row in ${v}:\n    print(*_row)`; }
function genPython(spec) {
  const starter = `def ${spec.fn}(${spec.params.map((p) => p.name).join(', ')}):\n    # Write your logic and return the answer.\n    pass`;
  const reads = spec.params.map((p) => `${p.name} = ${pyRead(p.type)}`).join('\n');
  const driver = `{{SOLUTION}}\n${PY_PRE}\n${reads}\n_res = ${spec.fn}(${spec.params.map((p) => p.name).join(', ')})\n${pyPrint(spec.returns, '_res')}`;
  return { starter, driver };
}

// ---------------- JavaScript ----------------
const JS_PRE = `const _toks = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(x => x.length);
let _pos = 0;
const _next = () => _toks[_pos++];
const _int = () => parseInt(_next(), 10);
const _flt = () => parseFloat(_next());
const _bool = () => ['1','true','yes'].includes(String(_next()).toLowerCase());
const _str = () => _next();
const _arr = (f) => { const n = _int(); const a = []; for (let i=0;i<n;i++) a.push(f()); return a; };
const _mat = (f) => { const r=_int(), c=_int(); const m=[]; for(let i=0;i<r;i++){const row=[];for(let j=0;j<c;j++)row.push(f());m.push(row);} return m; };`;
const JS_BASE = { int: '_int', long: '_int', double: '_flt', bool: '_bool', string: '_str' };
function jsRead(t) { const { base, dims } = parseType(t); const b = JS_BASE[base];
  if (dims === 0) return `${b}()`; if (dims === 1) return `_arr(${b})`; return `_mat(${b})`; }
function jsPrint(t, v) { const { base, dims } = parseType(t);
  if (dims === 0) return base === 'bool' ? `console.log(${v} ? 'true' : 'false')` : `console.log(String(${v}))`;
  if (dims === 1) return base === 'bool' ? `console.log(${v}.map(x=>x?'true':'false').join(' '))` : `console.log(${v}.join(' '))`;
  return `${v}.forEach(_row => console.log(_row.join(' ')))`; }
function genJs(spec) {
  const starter = `function ${spec.fn}(${spec.params.map((p) => p.name).join(', ')}) {\n  // Write your logic and return the answer.\n}`;
  const reads = spec.params.map((p) => `const ${p.name} = ${jsRead(p.type)};`).join('\n');
  const driver = `${JS_PRE}\n{{SOLUTION}}\n${reads}\nconst _res = ${spec.fn}(${spec.params.map((p) => p.name).join(', ')});\n${jsPrint(spec.returns, '_res')};`;
  return { starter, driver };
}

// ---------------- C++ ----------------
const CPP_PRE = `#include <bits/stdc++.h>
using namespace std;
static long long _int(){ long long x; cin>>x; return x; }
static double _flt(){ double x; cin>>x; return x; }
static bool _bool(){ string s; cin>>s; for(auto&c:s)c=tolower(c); return s=="1"||s=="true"||s=="yes"; }
static string _str(){ string s; cin>>s; return s; }
template<class F> auto _arr(F f)->vector<decltype(f())>{ int n; cin>>n; vector<decltype(f())> a; for(int i=0;i<n;i++) a.push_back(f()); return a; }
template<class F> auto _mat(F f)->vector<vector<decltype(f())>>{ int r,c; cin>>r>>c; vector<vector<decltype(f())>> m(r); for(int i=0;i<r;i++) for(int j=0;j<c;j++) m[i].push_back(f()); return m; }`;
const CPP_BASE = { int: 'long long', long: 'long long', double: 'double', bool: 'bool', string: 'string' };
const CPP_READ = { int: '_int', long: '_int', double: '_flt', bool: '_bool', string: '_str' };
function cppType(t) { const { base, dims } = parseType(t); const b = CPP_BASE[base];
  if (dims === 0) return b; if (dims === 1) return `vector<${b}>`; return `vector<vector<${b}>>`; }
function cppRead(t) { const { base, dims } = parseType(t); const r = CPP_READ[base];
  if (dims === 0) return `${r}()`; if (dims === 1) return `_arr(${r})`; return `_mat(${r})`; }
function cppPrint(t, v) { const { base, dims } = parseType(t);
  if (dims === 0) return base === 'bool' ? `cout << (${v} ? "true" : "false") << "\\n";` : `cout << ${v} << "\\n";`;
  const cell = base === 'bool' ? `(_x ? "true" : "false")` : `_x`;
  if (dims === 1) return `for(auto&_x : ${v}) cout << ${cell} << " "; cout << "\\n";`;
  return `for(auto&_row : ${v}){ for(auto&_x : _row) cout << ${cell} << " "; cout << "\\n"; }`; }
function genCpp(spec) {
  const sig = `${cppType(spec.returns)} ${spec.fn}(${spec.params.map((p) => cppType(p.type) + ' ' + p.name).join(', ')})`;
  const starter = `${sig} {\n    // Write your logic and return the answer.\n}`;
  const reads = spec.params.map((p) => `    auto ${p.name} = ${cppRead(p.type)};`).join('\n');
  const driver = `${CPP_PRE}\n{{SOLUTION}}\nint main(){\n${reads}\n    auto _res = ${spec.fn}(${spec.params.map((p) => p.name).join(', ')});\n    ${cppPrint(spec.returns, '_res')}\n    return 0;\n}`;
  return { starter, driver };
}

// ---------------- Java ----------------
const JAVA_PRE = `  static java.util.Scanner _sc = new java.util.Scanner(System.in);
  static long _int(){ return _sc.nextLong(); }
  static double _flt(){ return _sc.nextDouble(); }
  static boolean _bool(){ String s=_sc.next().toLowerCase(); return s.equals("1")||s.equals("true")||s.equals("yes"); }
  static String _str(){ return _sc.next(); }
  static long[] _intA(){ int n=(int)_sc.nextLong(); long[] a=new long[n]; for(int i=0;i<n;i++) a[i]=_sc.nextLong(); return a; }
  static double[] _fltA(){ int n=(int)_sc.nextLong(); double[] a=new double[n]; for(int i=0;i<n;i++) a[i]=_sc.nextDouble(); return a; }
  static String[] _strA(){ int n=(int)_sc.nextLong(); String[] a=new String[n]; for(int i=0;i<n;i++) a[i]=_sc.next(); return a; }
  static boolean[] _boolA(){ int n=(int)_sc.nextLong(); boolean[] a=new boolean[n]; for(int i=0;i<n;i++) a[i]=_bool(); return a; }
  static long[][] _intM(){ int r=(int)_sc.nextLong(),c=(int)_sc.nextLong(); long[][] m=new long[r][c]; for(int i=0;i<r;i++)for(int j=0;j<c;j++) m[i][j]=_sc.nextLong(); return m; }
  static double[][] _fltM(){ int r=(int)_sc.nextLong(),c=(int)_sc.nextLong(); double[][] m=new double[r][c]; for(int i=0;i<r;i++)for(int j=0;j<c;j++) m[i][j]=_sc.nextDouble(); return m; }`;
const JAVA_BASE = { int: 'long', long: 'long', double: 'double', bool: 'boolean', string: 'String' };
function javaType(t) { const { base, dims } = parseType(t); const b = JAVA_BASE[base];
  if (dims === 0) return b; if (dims === 1) return `${b}[]`; return `${b}[][]`; }
function javaRead(t) { const { base, dims } = parseType(t);
  if (dims === 0) return ({ int: '_int', long: '_int', double: '_flt', bool: '_bool', string: '_str' })[base] + '()';
  if (dims === 1) return ({ int: '_intA', long: '_intA', double: '_fltA', bool: '_boolA', string: '_strA' })[base] + '()';
  return ({ int: '_intM', long: '_intM', double: '_fltM' })[base] + '()'; }
function javaPrint(t, v) { const { base, dims } = parseType(t);
  if (dims === 0) return base === 'bool' ? `System.out.println(${v} ? "true" : "false");` : `System.out.println(${v});`;
  const cell = base === 'bool' ? `(${'_res'}[_i] ? "true" : "false")` : `${'_res'}[_i]`;
  if (dims === 1) return `{ StringBuilder _b=new StringBuilder(); for(int _i=0;_i<${v}.length;_i++){ if(_i>0)_b.append(' '); _b.append(${base === 'bool' ? `(${v}[_i]?"true":"false")` : `${v}[_i]`}); } System.out.println(_b); }`;
  return `for(${javaType(base + '[]')} _row : ${v}){ StringBuilder _b=new StringBuilder(); for(int _i=0;_i<_row.length;_i++){ if(_i>0)_b.append(' '); _b.append(_row[_i]); } System.out.println(_b); }`; }
function genJava(spec) {
  const sig = `static ${javaType(spec.returns)} ${spec.fn}(${spec.params.map((p) => javaType(p.type) + ' ' + p.name).join(', ')})`;
  const starter = `${sig} {\n    // Write your logic and return the answer.\n}`;
  const reads = spec.params.map((p) => `    ${javaType(p.type)} ${p.name} = ${javaRead(p.type)};`).join('\n');
  const driver = `import java.util.*;\npublic class Main {\n${JAVA_PRE}\n{{SOLUTION}}\n  public static void main(String[] _args){\n${reads}\n    ${javaType(spec.returns)} _res = ${spec.fn}(${spec.params.map((p) => p.name).join(', ')});\n    ${javaPrint(spec.returns, '_res')}\n  }\n}`;
  return { starter, driver };
}

// Generate { starter, driver } for every language from a spec.
function generate(spec) {
  if (!spec || !spec.fn || !Array.isArray(spec.params)) throw new Error('bad spec');
  for (const p of spec.params) if (!p.name || !validType(p.type)) throw new Error('unsupported param type: ' + p.type);
  if (!validType(spec.returns)) throw new Error('unsupported return type: ' + spec.returns);
  return {
    python: genPython(spec),
    javascript: genJs(spec),
    cpp: genCpp(spec),
    java: genJava(spec),
  };
}

module.exports = { generate, validType, parseType, SUPPORTED_TYPES: SCALARS };
