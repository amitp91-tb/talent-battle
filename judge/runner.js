// runner.js
// -----------------------------------------------------------------------------
// THE JUDGE. Given a language, a student's source code, and a list of test cases,
// it: (1) compiles the code, (2) runs it against every test case with strict
// time & memory limits, (3) compares the output to the expected answer, and
// (4) returns a verdict for each test case plus an overall result.
//
// SANDBOXING NOTE (important):
//   In this PROTOTYPE, each run is a child process fenced with a wall-clock
//   timeout and a memory cap (ulimit -v). That proves the grading logic end to
//   end. In PRODUCTION, each run is wrapped in a throwaway Docker container with
//   no network and a read-only filesystem, so untrusted student code can never
//   touch your server. The code below is structured so that swapping in Docker
//   is a change to ONE function (execWithLimits) and nothing else.
// -----------------------------------------------------------------------------

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LANGUAGES } = require('./languages');
const { check } = require('./checker');

// Verdict labels (the same vocabulary real judges like Codeforces use).
const VERDICT = {
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong Answer',
  TIME_LIMIT: 'Time Limit Exceeded',
  MEMORY_LIMIT: 'Memory Limit Exceeded',
  RUNTIME_ERROR: 'Runtime Error',
  COMPILE_ERROR: 'Compilation Error',
};

// Run one command with a wall-clock timeout and a memory cap.
// Returns { stdout, stderr, exitCode, signal, timedOut, durationMs }.
function execWithLimits(cmd, args, { cwd, input = '', timeoutMs, memoryKb }) {
  return new Promise((resolve) => {
    // Wrap the real command in bash so we can apply "ulimit -v" (virtual memory,
    // in KB) to the child before it runs. "$0"/"$@" pass cmd + args through.
    // Floor at ~3 GB of VIRTUAL address space: VM-based runtimes (Node, JVM, Go)
    // reserve a large virtual space at startup even though real RAM use is tiny.
    // A low cap would kill them instantly. This still stops extreme runaway.
    const vmemKb = Math.max(memoryKb, 3145728);
    const wrapper = `ulimit -v ${vmemKb} 2>/dev/null; exec "$0" "$@"`;
    const child = spawn('bash', ['-c', wrapper, cmd, ...args], { cwd });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const started = Date.now();

    const killer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    // Peak-memory probe (Linux only): sample the kernel's high-water RSS counter
    // for the running process. Read-only — it never changes how the child is
    // spawned, timed, or killed. On non-Linux (no /proc) it stays null and the
    // UI falls back to "—". `exec "$0"` above means child.pid is the program.
    let peakKb = null; let memTimer = null;
    const readMem = () => {
      try {
        const s = fs.readFileSync('/proc/' + child.pid + '/status', 'utf8');
        const m = s.match(/VmHWM:\s*(\d+)\s*kB/) || s.match(/VmRSS:\s*(\d+)\s*kB/);
        if (m) { const kb = parseInt(m[1], 10); if (peakKb == null || kb > peakKb) peakKb = kb; }
      } catch (e) { /* process gone or not Linux — ignore */ }
    };
    if (process.platform === 'linux') { readMem(); memTimer = setInterval(readMem, 6); }

    if (input) child.stdin.write(input);
    child.stdin.end();

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 10 * 1024 * 1024) child.kill('SIGKILL'); // 10MB output cap
    });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      clearTimeout(killer); if (memTimer) clearInterval(memTimer);
      resolve({ stdout, stderr: String(err), exitCode: 127, signal: null,
                timedOut, durationMs: Date.now() - started, memoryKb: peakKb });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(killer); if (memTimer) clearInterval(memTimer);
      resolve({ stdout, stderr, exitCode, signal, timedOut,
                durationMs: Date.now() - started, memoryKb: peakKb });
    });
  });
}

// Normalize output for comparison: unify newlines, strip trailing spaces on each
// line, and ignore trailing blank lines. (Standard "token/line" style checking.)
function normalize(s) {
  return String(s)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

// The main entry point.
// options: { language, code, testCases, timeLimitMs, memoryMb }
//   testCases: [{ input, expected, hidden }]
async function judge({ language, code, testCases,
                       timeLimitMs = 2000, memoryMb = 256,
                       checker = 'token', floatTolerance = 1e-6,
                       revealHidden = false }) {
  const lang = LANGUAGES[language];
  if (!lang) throw new Error(`Unsupported language: ${language}`);

  const memoryKb = memoryMb * 1024;

  // Each submission gets its own throwaway working directory.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-judge-'));
  try {
    fs.writeFileSync(path.join(workDir, lang.sourceFile), code);

    // ---- 1. COMPILE (skip for interpreted languages) --------------------------
    if (lang.compile) {
      const [ccmd, ...cargs] = lang.compile;
      const c = await execWithLimits(ccmd, cargs, {
        cwd: workDir, timeoutMs: 10000, memoryKb: 1024 * 1024, // 1GB for compiler
      });
      if (c.exitCode !== 0) {
        return {
          overall: VERDICT.COMPILE_ERROR,
          passed: 0,
          total: testCases.length,
          compileOutput: c.stderr.trim() || c.stdout.trim(),
          results: [],
        };
      }
    }

    // ---- 2. RUN EACH TEST CASE ------------------------------------------------
    const [rcmd, ...rargs] = lang.run;
    const results = [];
    let passed = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const r = await execWithLimits(rcmd, rargs, {
        cwd: workDir, input: tc.input, timeoutMs: timeLimitMs, memoryKb,
      });

      let verdict;
      if (r.timedOut) {
        verdict = VERDICT.TIME_LIMIT;
      } else if (r.exitCode !== 0) {
        // A ulimit memory kill usually surfaces as a crash; classify roughly.
        const memHint = /bad_alloc|out of memory|MemoryError|OutOfMemory/i.test(r.stderr);
        verdict = memHint ? VERDICT.MEMORY_LIMIT : VERDICT.RUNTIME_ERROR;
      } else if (check(checker, tc.expected, r.stdout, { floatTolerance })) {
        verdict = VERDICT.ACCEPTED;
        passed++;
      } else {
        verdict = VERDICT.WRONG_ANSWER;
      }

      const cap = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
      results.push({
        index: i + 1,
        hidden: !!tc.hidden,
        verdict,
        timeMs: r.durationMs,
        memoryKb: r.memoryKb == null ? null : r.memoryKb,
        // Practice-mode feedback (#6): expose input/expected/output for every case
        // — including hidden ones — so students can review and debug failures.
        // In graded contexts (revealHidden=false) hidden cases stay opaque.
        input: (!tc.hidden || revealHidden) ? cap(tc.input, 2000) : undefined,
        expected: (!tc.hidden || revealHidden) ? cap(tc.expected, 2000) : undefined,
        got: (!tc.hidden || revealHidden) ? cap(r.stdout, 2000) : undefined,
        stderr: (!tc.hidden || revealHidden) ? cap(r.stderr, 400) : undefined,
      });
    }

    const allPassed = passed === testCases.length;
    return {
      overall: allPassed ? VERDICT.ACCEPTED
                         : (results.find((x) => x.verdict !== VERDICT.ACCEPTED)?.verdict
                            || VERDICT.WRONG_ANSWER),
      passed,
      total: testCases.length,
      score: Math.round((passed / testCases.length) * 100),
      results,
    };
  } finally {
    // Always destroy the working directory (and compiled binaries) afterward.
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { judge, VERDICT };
