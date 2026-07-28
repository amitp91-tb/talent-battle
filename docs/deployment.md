# Deployment & Hosting Plan

## TL;DR
| Piece | Where it lives | Why |
|-------|----------------|-----|
| Frontend (React) | **Vercel** | Free, fast, auto-deploys from GitHub. |
| Database + Auth | **Supabase** | Managed PostgreSQL + login + storage in one. |
| Backend API + Judge | **Railway/Render** now, dedicated VMs (Hetzner/DO/AWS) at scale | Must run Docker + execute code. Vercel CANNOT do this. |
| Queue (Redis) | **Upstash** or Redis on the backend host | Lines up submissions during exam rushes. |
| Source code | **GitHub** (this repo) | Vercel + Railway auto-deploy on push. |

## The critical constraint
Vercel and other "serverless" hosts run short-lived functions and **cannot run
Docker or execute untrusted code**. The judge does exactly that, so the judge +
the backend that drives it must run on a normal always-on Linux server.

## Flow of a push
```
git push  ->  GitHub
                |-- Vercel picks up /apps/web   -> deploys frontend
                |-- Railway picks up /apps/api  -> deploys backend + judge
Supabase (database) is managed separately; backend connects to it via a URL.
```

## Rough starting cost (all have free tiers to begin)
- Vercel: Free
- Supabase: Free tier, then ~$25/mo
- Railway/Render: Free/Hobby, then ~$5-20/mo
- Upstash: Free tier
At real scale (many colleges, exam-day spikes) the judge VMs become the main
cost, which is why we move them to dedicated servers you control.

## Going live for a pilot (concrete)
The repo now includes a **Dockerfile** (Node + gcc/g++/JDK/python3) and a
**render.yaml**. Easiest path: push to GitHub, then create a Render "Web Service"
from the repo — Render builds the Dockerfile automatically and gives a public URL.
See **GO-LIVE.md** in the project root for the step-by-step.

Caveats for the single-container pilot: (1) student code runs in the app
container — isolate per-submission before a large public rollout; (2) the JSON
data store is ephemeral on free hosts — move to Supabase/Postgres for durability.
