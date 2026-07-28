# How to run Talent Battle on your computer

You only need **Node.js** installed. To also *run* student code, you need the
language compilers (Python is the easiest to add on Windows).

## One-time setup
1. Install **Node.js** (LTS) from https://nodejs.org  → just click through the installer.
2. (To run code) install **Python** from https://python.org. C/C++/Java are optional.

## Start the app
- **Windows:** double-click **START-HERE-Windows.bat**
- **Mac/Linux:** run **./start-mac-linux.sh** in a terminal
- Or, from the `server` folder: `node server.js`

Your browser opens at **http://localhost:3000**. That's it.

## What works
- Browse problems, open one, pick a language, write code.
- **Run** checks the sample case. **Submit** grades all hidden tests, scores you,
  and shows feedback + the correct solution.
- **My Dashboard** tallies your submissions.

Note: the app itself runs anywhere with Node. Judging a language needs that
language's compiler on the machine — which is exactly why, for real scale, the
judge runs on a Linux server (see docs/deployment.md).

## Accounts
The first time it opens, create an account (choose **Student** or **Faculty**).
- Students see their own scores and dashboard.
- Faculty see a batch dashboard across all students.
Accounts are saved in `server/data/` on your computer.
