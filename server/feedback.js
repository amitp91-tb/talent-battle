// feedback.js
// Turns a judged result into human feedback. For now this is rule-based and
// includes the official solution. In production, this is where a call to the
// Claude API drops in to write personalized, natural-language feedback.
const fs = require('fs');
const path = require('path');

function buildFeedback(problemDir, meta, result) {
  let referenceSolution = '';
  try {
    referenceSolution = fs.readFileSync(
      path.join(problemDir, 'solutions', 'reference.py'), 'utf8');
  } catch (e) { referenceSolution = '(reference solution not available)'; }

  const failed = result.results.filter((r) => r.verdict !== 'Accepted');
  let summary;
  if (result.overall === 'Accepted') {
    summary = `Excellent — all ${result.total} tests passed. Your solution is correct.`;
  } else if (result.overall === 'Compilation Error') {
    summary = `Your code did not compile. Fix the syntax errors shown, then resubmit.`;
  } else if (result.overall === 'Time Limit Exceeded') {
    summary = `Your logic may be correct but it is too slow. Look for a more efficient approach (lower time complexity).`;
  } else {
    summary = `You passed ${result.passed} of ${result.total} tests. `
      + `The cases you missed usually involve tricky inputs (negatives, edge values, or larger data). `
      + `Compare your approach with the reference solution below.`;
  }

  return {
    summary,
    weakArea: meta.tags && meta.tags.length ? meta.tags[meta.tags.length - 1] : null,
    failedCount: failed.length,
    referenceSolution,
    improve: {
      note: 'Re-attempt after reviewing the solution to lock in the concept.',
    },
  };
}
module.exports = { buildFeedback };
