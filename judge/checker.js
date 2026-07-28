// checker.js
// -----------------------------------------------------------------------------
// Decides whether a student's output is "correct" for a test case. Different
// problems need different rules, so each problem picks a checker in problem.json:
//   "exact" - must match character-for-character (after trimming trailing space)
//   "token" - must match token-by-token, ignoring how much whitespace/newlines
//             separate them (the sensible default for most problems)
//   "float" - like token, but numbers only need to match within a tolerance
//             (e.g. 3.14159 vs 3.1415926) - needed for geometry/averages
// A "custom" checker (a small program that decides correctness, for problems with
// many valid answers) plugs in here later without changing anything else.
// -----------------------------------------------------------------------------

function normalizeExact(s) {
  return String(s).replace(/\r\n/g, '\n')
    .split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
}
function tokens(s) {
  return String(s).trim().split(/\s+/).filter((t) => t.length > 0);
}

function check(type, expected, got, opts = {}) {
  if (type === 'exact') {
    return normalizeExact(expected) === normalizeExact(got);
  }
  const e = tokens(expected), g = tokens(got);
  if (e.length !== g.length) return false;

  if (type === 'float') {
    const tol = opts.floatTolerance ?? 1e-6;
    for (let i = 0; i < e.length; i++) {
      const a = parseFloat(e[i]), b = parseFloat(g[i]);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        if (e[i] !== g[i]) return false;          // non-numeric token: exact
      } else if (Math.abs(a - b) > tol) {
        return false;
      }
    }
    return true;
  }

  // default: token
  for (let i = 0; i < e.length; i++) if (e[i] !== g[i]) return false;
  return true;
}

module.exports = { check };
