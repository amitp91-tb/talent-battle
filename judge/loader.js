// loader.js
// -----------------------------------------------------------------------------
// Reads a problem from a folder on disk and returns it in the shape the judge
// understands. Faculty author problems as plain files (no coding needed):
//
//   problems/0001-sum-of-two-numbers/
//     problem.json          <- title, difficulty, tags, limits, checker, points
//     statement.md          <- the full question shown to the student
//     tests/sample/01.in    <- visible example input
//     tests/sample/01.out   <- its expected output
//     tests/hidden/01.in    <- hidden inputs (student never sees these)
//     tests/hidden/01.out
//     solutions/reference.py<- the official solution (used for feedback)
// -----------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

function readCases(dir, hidden) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.in'))
    .sort()
    .map((inFile) => {
      const base = inFile.slice(0, -3);
      return {
        input: fs.readFileSync(path.join(dir, inFile), 'utf8'),
        expected: fs.readFileSync(path.join(dir, base + '.out'), 'utf8'),
        hidden,
      };
    });
}

function loadProblem(problemDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(problemDir, 'problem.json'), 'utf8'));
  const statementPath = path.join(problemDir, 'statement.md');
  const statement = fs.existsSync(statementPath)
    ? fs.readFileSync(statementPath, 'utf8') : meta.title;
  const testCases = [
    ...readCases(path.join(problemDir, 'tests', 'sample'), false),
    ...readCases(path.join(problemDir, 'tests', 'hidden'), true),
  ];
  return { meta, statement, testCases };
}

// List every problem folder inside a problems/ directory.
function listProblems(problemsRoot) {
  return fs.readdirSync(problemsRoot)
    .filter((d) => fs.existsSync(path.join(problemsRoot, d, 'problem.json')))
    .sort()
    .map((d) => path.join(problemsRoot, d));
}

module.exports = { loadProblem, listProblems };
