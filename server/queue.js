// queue.js — bound how many judge jobs (compile + run) execute at once.
// A burst of submissions on a small box (e.g. 512 MB / 2 vCPUs) would otherwise
// spawn N compilers + programs simultaneously and thrash RAM/CPU — causing OOM,
// slow responses, and false "Time Limit Exceeded". This limits concurrent jobs
// to TB_JUDGE_CONCURRENCY (default 2, matching typical vCPU count); extra jobs
// wait in a bounded FIFO queue, and if the queue is full the request is rejected
// so callers can retry instead of piling up forever.
//
// Env:
//   TB_JUDGE_CONCURRENCY — max simultaneous judge jobs (default 2)
//   TB_JUDGE_MAX_QUEUE   — max jobs waiting for a slot (default 40)
const MAX = Math.max(1, parseInt(process.env.TB_JUDGE_CONCURRENCY, 10) || 2);
const MAX_QUEUE = Math.max(1, parseInt(process.env.TB_JUDGE_MAX_QUEUE, 10) || 40);

let active = 0;
const waiters = [];

function stats() { return { active, queued: waiters.length, max: MAX, maxQueue: MAX_QUEUE }; }

function acquire() {
  return new Promise((resolve, reject) => {
    if (active < MAX) { active++; return resolve(); }
    if (waiters.length >= MAX_QUEUE) { const e = new Error('overloaded'); e.overloaded = true; return reject(e); }
    waiters.push(resolve);
  });
}

function release() {
  const next = waiters.shift();
  if (next) { next(); }          // hand the held slot straight to the next waiter
  else { active = Math.max(0, active - 1); }
}

// Run fn() while holding one concurrency slot. Rejects immediately with an
// `overloaded` error if the wait queue is already full.
async function run(fn) {
  await acquire();
  try { return await fn(); }
  finally { release(); }
}

module.exports = { run, stats };
