# Talent Battle — Coding Platform (project brief for Claude Code)

A LeetCode/HackerRank-style coding assessment platform for engineering colleges.
Built with a deliberately lean, ZERO-npm-dependency stack so it runs anywhere with just Node.

## How to run locally
    cd server
    node server.js          # then open http://localhost:3000
- Needs Node.js 22+ (uses the built-in `node:sqlite` module).
- To execute student code you need: python3, gcc, g++, a JDK (javac), node. Code execution works best on Linux/the server.
- The FIRST account registered becomes the Super Admin. Everyone else is a student.
- Env: PORT (default 3000), TB_DATA (default server/data) for the DB + uploads dir.
- Email (forgot-password): set TB_SMTP_HOST, TB_SMTP_PORT (587), TB_SMTP_SECURE (ssl|starttls|none), TB_SMTP_USER, TB_SMTP_PASS, TB_SMTP_FROM, and TB_PUBLIC_URL (e.g. https://code.talentbattle.in) for reset links. Without SMTP, forgot-password still works but the reset link is only printed to the server log. Zero-dep SMTP client in server/mailer.js.

## Architecture / tech
- Backend: server/server.js — a single Node HTTP server (no framework, no npm deps). Handmade router; JSON APIs under /api/...; serves the SPA from server/public/; serves uploads from /uploads/.
- Frontend: server/public/ — vanilla JS SPA (app.js), styles.css, index.html. Monaco editor via CDN with a <textarea> fallback. No build step.
- Database: SQLite via Node's built-in node:sqlite, file at ${TB_DATA}/talent-battle.db. Schema + migrations in server/db.js (uses addColumn() guards, safe to add columns).
- Judge: judge/ — runner.js compiles & runs untrusted code in child processes with wall-clock timeout + ulimit -v memory floor (>=3GB virtual so Node/JVM/Go can start). languages.js defines each language (compile/run/probe). checker.js = token/exact/float. loader.js reads folder problems in problems/.

## Server modules (server/)
- auth.js — users, scrypt password hashing, in-memory sessions (cookie tb_session), submissions. Roles: admin, subadmin, student.
- store.js — admin questions (SQLite). Supports mode: 'stdio'|'function', per-language harness (starter+driver with {{SOLUTION}}), multi-language solutions, time/space complexity.
- challenge.js — the fixed 100 Days set, seeded from server/challenge-days.json, admin-editable. Backfills multi-language solutions from that JSON on startup.
- groups.js — batches (college / branch / year of passing).
- tests.js — named tests (question sets assigned to batches).
- contests.js — timed contests; contestStandings() (in server.js) = ICPC scoring.
- demo.js — seedDemo() and seedFunctionExamples() (from server/fn-examples.json). Demo solutions from server/demo-solutions.json. Idempotent; backfill solutions on re-run.
- feedback.js — legacy; live feedback is buildFeedback2() in server.js.

## Features already built & tested
Judge (C/C++/Java/Python/JS/Bash/Go/Ruby/PHP/Rust per installed compiler) · 100 Days challenge (admin-editable) · admin question bank · Tests · Contests (live leaderboard) · batches by college/branch/year · students + bulk CSV upload · sub-admins with SCOPED access · group-wise analytics · Reports + CSV export · gamification (XP/levels/streaks/badges/leaderboard/daily challenge) · proctoring/exam-mode (fullscreen lockdown, tab-switch + paste detection, flags reported to admin/sub-admin) · image upload in questions · function mode (write only the function) · multi-language solutions + complexity.

## Roles & flow
Admin creates content -> assigns to batches -> sub-admins are assigned batches -> students in those batches see it. Sub-admins only see their assigned students.

## Deploy (live at https://code.talentbattle.in)
- Host: AWS Lightsail (Ubuntu). App on internal PORT=3000 under pm2. Caddy reverse-proxies 80/443 with auto-HTTPS. DB/uploads persist in ~/app/server/data (outside git).
- Update: push to GitHub -> on server: cd ~/app && git pull && pm2 restart talent-battle
- Repo: github.com/amitp91-tb/talent-battle (branch main). SQLite DB lives on the server disk, never committed.

## Conventions / gotchas
- NO npm dependencies — keep it that way unless truly necessary.
- SQLite writes are synchronous; fine at pilot scale. For 500-1000 simultaneous submissions: add a submission queue + bigger server (or worker pool), optionally Postgres (db.js schema maps cleanly).
- Judge floors virtual memory ~3GB so VM runtimes don't die on startup.
- On Windows, .js/.bat from a downloaded zip get blocked — right-click zip -> Properties -> Unblock before extracting.

## What's left / roadmap
- 100-Day multi-language solutions: days 1-35 DONE (Python/C/C++/Java; C/C++/Python verified vs test cases; Java authored). Days 36-70 (medium) and 71-100 (hard) still need C/C++/Java — author each, verify against its samples+hidden in server/challenge-days.json, then they backfill automatically on startup.
- Deliberately deferred (not needed for college pilots): Kubernetes, Elasticsearch, native mobile, payments. See docs/ and the feasibility assessment for the 36-module business checklist.

## Verifying a solution when adding one
Compile+run it against the problem's samples+hidden (from server/challenge-days.json or the question) and compare token-normalized output to expected. C/C++/Python/JS verify locally; Java needs a JDK.
