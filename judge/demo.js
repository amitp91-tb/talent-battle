// demo.js
// Proves the judge works end to end. Defines one problem with sample + hidden
// test cases, then grades several solutions and prints a report.
// Run with:  node demo.js
const { judge } = require('./runner');

// ---- A PROBLEM (this is the shape Step 3 will formalize) --------------------
const problem = {
  title: 'Sum of Two Numbers',
  statement: 'Read two integers A and B on one line. Print A + B.',
  timeLimitMs: 2000,
  memoryMb: 256,
  testCases: [
    { input: '2 3\n',             expected: '5\n',       hidden: false }, // sample (visible)
    { input: '100 250\n',         expected: '350\n',     hidden: true  },
    { input: '-5 8\n',            expected: '3\n',       hidden: true  },
    { input: '1000000 2000000\n', expected: '3000000\n', hidden: true  },
  ],
};

// ---- SOLUTIONS TO TEST ------------------------------------------------------
const solutions = {
  'Python (correct)': { language: 'python', code:
`a, b = map(int, input().split())
print(a + b)` },

  'C (correct)': { language: 'c', code:
`#include <stdio.h>
int main(){ long a,b; scanf("%ld %ld",&a,&b); printf("%ld\\n",a+b); return 0; }` },

  'C++ (correct)': { language: 'cpp', code:
`#include <bits/stdc++.h>
using namespace std;
int main(){ long a,b; cin>>a>>b; cout<<a+b<<"\\n"; }` },

  'Java (correct)': { language: 'java', code:
`import java.util.*;
public class Main {
  public static void main(String[] args){
    Scanner s = new Scanner(System.in);
    long a = s.nextLong(), b = s.nextLong();
    System.out.println(a + b);
  }
}` },

  'Python (WRONG - prints A-B)': { language: 'python', code:
`a, b = map(int, input().split())
print(a - b)` },

  'Python (TIME LIMIT - infinite loop)': { language: 'python', code:
`while True:
    pass` },

  'C++ (COMPILE ERROR - typo)': { language: 'cpp', code:
`#include <bits/stdc++.h>
int main(){ cout << "oops" }` },
};

// ---- RUN & REPORT -----------------------------------------------------------
(async () => {
  console.log('='.repeat(64));
  console.log('PROBLEM:', problem.title);
  console.log(problem.statement);
  console.log(`Limits: ${problem.timeLimitMs} ms, ${problem.memoryMb} MB`);
  console.log(`Test cases: ${problem.testCases.length} (1 sample + ${problem.testCases.length-1} hidden)`);
  console.log('='.repeat(64));

  for (const [name, sol] of Object.entries(solutions)) {
    const res = await judge({
      language: sol.language,
      code: sol.code,
      testCases: problem.testCases,
      timeLimitMs: problem.timeLimitMs,
      memoryMb: problem.memoryMb,
    });

    console.log(`\n--- ${name}  [${sol.language}] ---`);
    if (res.overall === 'Compilation Error') {
      console.log(`  OVERALL: Compilation Error`);
      console.log('  compiler said:', (res.compileOutput || '').split('\n')[0]);
      continue;
    }
    console.log(`  OVERALL: ${res.overall}   score ${res.score}/100   (${res.passed}/${res.total} passed)`);
    for (const t of res.results) {
      const tag = t.hidden ? 'hidden' : 'sample';
      const detail = t.hidden ? '' : `  (in "${t.input.trim()}" -> got "${(t.got||'').trim()}")`;
      console.log(`   test ${t.index} [${tag}]: ${t.verdict}  ${t.timeMs}ms${detail}`);
    }
  }
  console.log('\n' + '='.repeat(64));
})();
