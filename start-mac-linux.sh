#!/usr/bin/env bash
cd "$(dirname "$0")/server"
( sleep 1; { command -v open >/dev/null && open http://localhost:3000; } || { command -v xdg-open >/dev/null && xdg-open http://localhost:3000; }; ) >/dev/null 2>&1 &
echo "Talent Battle running at http://localhost:3000  (Ctrl+C to stop)"
NODE_NO_WARNINGS=1 node server.js
