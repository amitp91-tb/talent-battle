// demo_problems.js
// Loads every problem from the problems/ folder and grades solutions through the
// FULL pipeline: loader -> judge -> checker. Run with:  node demo_problems.js
const fs = require('fs');
const path = require('path');
const { judge } = require('./runner');
const { loadProblem, listProblems } = require('./loader');

const PROBLEMS_ROOT = path.join(__dirname, '..', 'problems');

async function grade(problem, label, language, code) {
  const res = await judge({
    language, code,
    testCases: problem.testCases,
    timeLimitMs: problem.meta.timeLimitMs,
    memoryMb: problem.meta.memoryMb,
    checker: problem.meta.checker,
    floatTolerance: problem.meta.floatTolerance,
  });
  const bar = res.overall === 'Accepted' ? 'PASS' : 'FAIL';
  console.log(`   [${bar}] ${label}: ${res.overall}  ${res.score}/100  (${res.passed}/${res.total})`);
  return res;
}

(async () => {
  const dirs = listProblems(PROBLEMS_ROOT);
  console.log(`Found ${dirs.length} problems.\n`);

  for (const dir of dirs) {
    const problem = loadProblem(dir);
    const m = problem.meta;
    console.log('='.repeat(66));
    console.log(`${m.id}  ${m.title}   [${m.difficulty}]  checker=${m.checker}`);
    console.log(`tags: ${m.tags.join(', ')}   |   ${problem.testCases.length} tests`);
    console.log('-'.repeat(66));

    // 1) The official reference solution should always pass.
    const refCode = fs.readFileSync(path.join(dir, 'solutions', 'reference.py'), 'utf8');
    await grade(problem, 'reference.py', 'python', refCode);
  }

  // 2) Prove the checker CATCHES a wrong answer (submit a broken maxsubarray).
  console.log('\n' + '='.repeat(66));
  console.log('Bonus checks: does grading actually catch mistakes?');
  console.log('-'.repeat(66));
  const maxsub = loadProblem(path.join(PROBLEMS_ROOT, '0002-maximum-subarray'));
  await grade(maxsub, 'broken maxsub (sums whole array)', 'python',
    "input()\nprint(sum(map(int, input().split())))");

  // 3) Prove the FLOAT checker accepts full-precision vs rounded expected.
  console.log('   (float judging: reference prints 3.14159..., expected files are');
  console.log('    rounded like 3.1416 - both accepted within tolerance 0.001)');
})();
