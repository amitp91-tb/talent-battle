// demo.js — one-click demo data for testing/demos. Idempotent.
const auth = require('./auth');
const groups = require('./groups');
const store = require('./store');
const tests = require('./tests');
const contests = require('./contests');
const fs = require('fs');
const path = require('path');

const Q = [
  { title:'Add Two Numbers', difficulty:'easy', tags:['math'], statement:'Read two integers A and B on one line. Print A+B.',
    reference:'a,b=map(int,input().split())\nprint(a+b)', samples:[{input:'3 5\n',expected:'8\n'}], hidden:[{input:'10 20\n',expected:'30\n'},{input:'-1 1\n',expected:'0\n'}] },
  { title:'Multiply', difficulty:'easy', tags:['math'], statement:'Read A and B. Print A*B.',
    reference:'a,b=map(int,input().split())\nprint(a*b)', samples:[{input:'4 6\n',expected:'24\n'}], hidden:[{input:'7 8\n',expected:'56\n'},{input:'0 9\n',expected:'0\n'}] },
  { title:'Maximum of Two', difficulty:'easy', tags:['implementation'], statement:'Read A and B. Print the larger.',
    reference:'a,b=map(int,input().split())\nprint(max(a,b))', samples:[{input:'3 9\n',expected:'9\n'}], hidden:[{input:'10 2\n',expected:'10\n'},{input:'-5 -1\n',expected:'-1\n'}] },
  { title:'Reverse a String', difficulty:'easy', tags:['strings'], statement:'Read a word. Print it reversed.',
    reference:'print(input().strip()[::-1])', samples:[{input:'hello\n',expected:'olleh\n'}], hidden:[{input:'abc\n',expected:'cba\n'},{input:'racecar\n',expected:'racecar\n'}] },
  { title:'Count Vowels', difficulty:'easy', tags:['strings'], statement:'Read a lowercase word. Print the number of vowels (aeiou).',
    reference:"w=input().strip()\nprint(sum(w.count(v) for v in 'aeiou'))", samples:[{input:'education\n',expected:'5\n'}], hidden:[{input:'sky\n',expected:'0\n'},{input:'aeiou\n',expected:'5\n'}] },
  { title:'Sum of Array', difficulty:'easy', tags:['arrays'], statement:'Line1: N. Line2: N integers. Print their sum.',
    reference:'input()\nprint(sum(map(int,input().split())))', samples:[{input:'3\n1 2 3\n',expected:'6\n'}], hidden:[{input:'4\n5 5 5 5\n',expected:'20\n'},{input:'1\n7\n',expected:'7\n'}] },
  { title:'Even or Odd', difficulty:'easy', tags:['math'], statement:"Read N. Print 'Even' or 'Odd'.",
    reference:"n=int(input())\nprint('Even' if n%2==0 else 'Odd')", samples:[{input:'4\n',expected:'Even\n'}], hidden:[{input:'7\n',expected:'Odd\n'},{input:'0\n',expected:'Even\n'}] },
  { title:'Factorial', difficulty:'easy', tags:['math'], statement:'Read N (0<=N<=20). Print N!.',
    reference:'import math\nprint(math.factorial(int(input())))', samples:[{input:'5\n',expected:'120\n'}], hidden:[{input:'0\n',expected:'1\n'},{input:'6\n',expected:'720\n'}] },
  { title:'Is Palindrome', difficulty:'medium', tags:['strings'], statement:"Read a word. Print 'Yes' if it reads the same backwards, else 'No'.",
    reference:"w=input().strip()\nprint('Yes' if w==w[::-1] else 'No')", samples:[{input:'racecar\n',expected:'Yes\n'}], hidden:[{input:'hello\n',expected:'No\n'},{input:'noon\n',expected:'Yes\n'}] },
  { title:'GCD', difficulty:'medium', tags:['math','number-theory'], statement:'Read A and B. Print gcd(A,B).',
    reference:'import math\na,b=map(int,input().split())\nprint(math.gcd(a,b))', samples:[{input:'12 18\n',expected:'6\n'}], hidden:[{input:'7 5\n',expected:'1\n'},{input:'100 40\n',expected:'20\n'}] },
  { title:'Nth Fibonacci', difficulty:'medium', tags:['dp'], statement:'Read N (0-indexed, F0=0,F1=1). Print the Nth Fibonacci number.',
    reference:'n=int(input())\na,b=0,1\nfor _ in range(n):a,b=b,a+b\nprint(a)', samples:[{input:'10\n',expected:'55\n'}], hidden:[{input:'1\n',expected:'1\n'},{input:'0\n',expected:'0\n'}] },
  { title:'Second Largest', difficulty:'medium', tags:['arrays'], statement:'Line1: N. Line2: N integers. Print the second largest distinct value.',
    reference:'input()\na=sorted(set(map(int,input().split())))\nprint(a[-2])', samples:[{input:'5\n5 3 1 4 2\n',expected:'4\n'}], hidden:[{input:'3\n9 8 7\n',expected:'8\n'},{input:'4\n1 2 3 4\n',expected:'3\n'}] },
];

function loadDemoSol(){ try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-solutions.json'), 'utf8')); } catch { return {}; } }
function seedDemo() {
  const demoSol = loadDemoSol();
  if (auth.findByEmail('prof.rao@demo.tb')) {
    let n = 0; for (const q of Q) if (demoSol[q.title] && store.setSolutionsByTitle(q.title, demoSol[q.title])) n++;
    return { alreadySeeded: true, solutionsUpdated: n };
  }
  const b1 = groups.create({ college: 'ABC College', branch: 'CSE', yearOfPassing: '2027' });
  const b2 = groups.create({ college: 'ABC College', branch: 'IT', yearOfPassing: '2026' });
  const b3 = groups.create({ college: 'XYZ College', branch: 'CSE', yearOfPassing: '2027' });

  const qids = Q.map((q) => store.createQuestion({ ...q, checker: 'token', tags: q.tags, solutions: demoSol[q.title] || (q.reference ? { python: q.reference } : {}) }, null).id);

  const mkSub = (name, email, batchIds) => { const u = auth.createUser({ name, email, password: 'demo1234', role: 'subadmin' });
    auth.updateUser(u.id, { assignedBatches: batchIds }); return u; };
  mkSub('Prof Rao', 'prof.rao@demo.tb', [b1.id]);
  mkSub('Prof Iyer', 'prof.iyer@demo.tb', [b2.id]);
  mkSub('Prof Khan', 'prof.khan@demo.tb', [b3.id]);

  const roster = [
    ['Asha Deshmukh','asha@demo.tb',b1],['Bala Reddy','bala@demo.tb',b1],['Gita Rao','gita@demo.tb',b1],
    ['Chetan Shah','chetan@demo.tb',b2],['Divya Nair','divya@demo.tb',b2],
    ['Esha Roy','esha@demo.tb',b3],['Farhan Ali','farhan@demo.tb',b3],['Hari Kumar','hari@demo.tb',b3],
  ];
  const S = roster.map(([name, email, b]) => auth.createUser({ name, email, password: 'demo1234', role: 'student',
    college: b.college, branch: b.branch, yearOfPassing: b.yearOfPassing, batch: b.name, batchId: b.id }));

  tests.create({ title: 'Week 1 Warmup', description: 'Intro problems for CSE 2027', questionIds: qids.slice(0, 5), batchIds: [b1.id] });
  tests.create({ title: 'Open Practice Set', description: 'Available to every student', questionIds: qids.slice(5, 10), batchIds: [] });

  const now = Date.now();
  contests.create({ title: 'ABC CSE Weekly Contest', startAt: now - 30 * 60000, durationMin: 240, problemIds: [qids[0], qids[1], 'D001', 'D071'], batchIds: [b1.id] });
  contests.create({ title: 'Open Rated Round 1', startAt: now + 2 * 86400000, durationMin: 120, problemIds: [qids[2], qids[3], 'D002'], batchIds: [] });

  const solve = (u, pid, title) => auth.addSubmission({ userId: u.id, problemId: pid, title, tags: [], language: 'python', score: 100, overall: 'Accepted', at: now, source: '', violations: 0 });
  const plan = [[0,6],[1,4],[2,2],[3,5],[4,3],[5,7],[6,1],[7,3]];
  for (const [si, cnt] of plan) for (let k = 0; k < cnt; k++) { const q = store.getById(qids[k]); solve(S[si], qids[k], q ? q.title : 'Problem'); }
  solve(S[0], 'D001', 'Hello, Coder'); solve(S[3], 'D001', 'Hello, Coder');

  return { batches: 3, subadmins: 3, students: S.length, questions: qids.length, tests: 2, contests: 2 };
}
function seedFunctionExamples() {
  const existing = store.listAdmin().some((q) => q.title === 'Sum of Two Numbers (function)');
  if (existing) return { alreadySeeded: true };
  let problems = [];
  try { problems = JSON.parse(fs.readFileSync(path.join(__dirname, 'fn-examples.json'), 'utf8')); } catch (e) { return { error: 'fn-examples.json missing' }; }
  let n = 0;
  for (const q of problems) { store.createQuestion(q, null); n++; }
  return { added: n };
}
module.exports = { seedDemo, seedFunctionExamples };
