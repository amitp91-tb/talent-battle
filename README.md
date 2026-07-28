# Talent Battle — Coding Test Platform

The technical engine behind the Talent Battle Technical Assessment Ecosystem (TAE):
students write code, it runs against open + hidden test cases in **C, C++, Java,
and Python**, gets scored, and receives detailed feedback.

Built step by step. This is the current state of the prototype.

## Approved architecture (Step 1)

| Layer | Technology | Plain-English job |
|-------|-----------|-------------------|
| Web App | React + Monaco editor | The screen students code on (VS Code's editor). |
| Backend API | Node.js + TypeScript | The brain: logins, tests, scoring, orchestration. |
| Database | PostgreSQL | Stores users, problems, test cases, results. |
| Job Queue | Redis + BullMQ | Lines up submissions during exam rushes. |
| **Judge** | **Our own engine (Docker sandbox in production)** | Compiles & runs untrusted code safely. |
| AI Feedback | LLM API | Explains mistakes, shows solutions, weak areas. |
| Hosting | AWS | Add judge workers on demand at exam time. |

## What's built so far (Step 2): the Judge

Folder: `judge/`
- `languages.js` — how each language is compiled/run (add a language = 1 entry).
- `runner.js`    — the judge: compile -> run each test with time/memory limits -> grade.
- `demo.js`      — a live demo you can run.

### Try it
```
cd judge
node demo.js            # runs 4 languages + every verdict type
node demo_problems.js   # loads real problems from disk and grades them
```

## Authoring problems (Step 2 + 3, no coding needed)
Each problem is a folder under `problems/` — see `problems/0001-sum-of-two-numbers/`:
- `problem.json` — title, difficulty, tags, time/memory limits, checker, points
- `statement.md` — the question shown to the student
- `tests/sample/*.in|*.out` — visible examples
- `tests/hidden/*.in|*.out` — hidden cases (never shown)
- `solutions/reference.py` — official solution (also powers feedback later)

Checkers (chosen per problem): `token` (default), `exact`, `float` (tolerance).
This same model handles basics, DSA, greedy/DP, geometry, and competitive problems.

See `docs/deployment.md` for the full hosting plan (Vercel + Supabase + judge server).

### Verdicts it produces (same vocabulary as Codeforces/LeetCode)
Accepted · Wrong Answer · Time Limit Exceeded · Memory Limit Exceeded ·
Runtime Error · Compilation Error

### Security: prototype vs production
- **Prototype (now):** each run is a child process with a wall-clock timeout and a
  memory cap (`ulimit -v`). Proves the grading logic works end to end.
- **Production:** each run is wrapped in a throwaway **Docker container** with no
  network and a read-only filesystem, so untrusted student code can never reach
  your server. This is isolated to ONE function (`execWithLimits`) — swapping it
  in does not touch any other code.

## Run the whole app (localhost:3000)
See **HOW-TO-RUN.md**. Short version: install Node.js, then double-click
`START-HERE-Windows.bat` (or `node server.js` from the `server/` folder).
The app has no database or build step — it runs with just Node.

## Roadmap
1. [x] Architecture & tech stack
2. [x] Code execution engine (the judge)  <-- you are here
3. [x] Problem & test-case model (folder-per-problem, checkers, tags, scoring)
4. [ ] Test-taking web interface
5. [ ] Feedback, solutions & scoring
6. [x] Dashboards, accounts & analytics (illustrated)
7. [x] **Connected runnable app** — all screens wired to the judge, runs at localhost:3000
8. [x] **Login accounts** — students & faculty sign in; per-user scores; faculty batch dashboard
9. [x] **Deploy-ready** — Dockerfile bundles all 4 compilers; see GO-LIVE.md to publish

## Newer features
- **100 Days of Code** — a separate section: 100 daily problems from easiest
  (Day 1) to hardest (Day 100), progressive unlock, with reference solutions.
- **View solution** — students can reveal the reference solution after attempting.
- **Bulk student upload** — admin uploads a CSV (Excel → Save As CSV), auto-creates
  batches, assigns students.
- **Password reset** — admin resets any user's password.
- Security notes in docs/SECURITY.md.

## Data & database
Data is stored in a real **SQLite** database (Node's built-in engine) at
`server/data/talent-battle.db` — no installs, no accounts, and it survives
restarts. The schema (`server/db.js`) maps directly onto PostgreSQL/Supabase for
when you move to the cloud, so that migration is a contained change.

## Admin system
- [x] Roles: **Super Admin** (first account), Sub-Admin, Student
- [x] **Question management** — admin creates/deletes questions with open + hidden tests; students see them
- [x] Batches + student management
- [x] Sub-admins + assign batches (scoped access)
- [x] Scoped results & analytics
- [x] Test groups / challenges

The **first account** you register becomes the Super Admin. Log in as admin →
**Questions** tab to create coding questions.
