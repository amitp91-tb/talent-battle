# Putting Talent Battle online (pilot)

Right now the app runs on your computer (localhost). To let colleges open it in a
browser from anywhere, it needs to run on a server. Here is the simplest path.
Take it slowly — do it with me one step at a time, no rush.

## What you'll need (all free to start)
1. A **GitHub** account (github.com) — stores the code online.
2. A **Render** account (render.com) — runs the app and gives you a public web link.

## The 3 stages
### 1. Put the code on GitHub
- Create a new empty repository on github.com (e.g. `talent-battle`).
- Upload this project's files to it. (I can generate the exact steps, or Claude
  Code on your computer can push it for you in one go.)

### 2. Deploy on Render
- On render.com: **New → Web Service** → connect your GitHub repo.
- Render sees the included **Dockerfile** and builds everything automatically
  (Node + all 4 compilers). No settings to fiddle with.
- Click **Create Web Service**. In a few minutes you get a link like
  `https://talent-battle.onrender.com` — that's your live platform.

### 3. Share the link with colleges
- Anyone can open it, create an account, and start solving. No install needed.

## Two honest notes before a real rollout
- **Security:** in this pilot setup, student code runs inside the app's own
  server container. Fine for a demo/pilot with known students; before a large
  public rollout we should run each submission in its own isolated container
  (the production hardening described in `docs/deployment.md`).
- **Data:** free servers may wipe the local `server/data` files on each redeploy.
  For real use, move accounts & results to a database (Supabase) so nothing is
  lost. This is a planned next step, not needed just to demo.
