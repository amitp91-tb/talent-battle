@echo off
title Talent Battle Coding Platform
cd /d "%~dp0server"
echo ============================================
echo   Starting Talent Battle...
echo   Your browser will open at localhost:3000
echo   Keep this window open while using the app.
echo   Close it (or press Ctrl+C) to stop.
echo ============================================
set NODE_NO_WARNINGS=1
start "" http://localhost:3000
node server.js
pause
