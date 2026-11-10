#!/usr/bin/env bash
# Stops the web server (npm -> node --watch -> server, whole tree); --db also stops Postgres (volume kept).
cd "$(dirname "$0")/.."
set -a; source .env; set +a

kill_tree() { local c; for c in $(pgrep -P "$1"); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }

stopped=0
if [ -f logs/dev.pid ] && kill -0 "$(cat logs/dev.pid)" 2>/dev/null; then
  kill_tree "$(cat logs/dev.pid)"; stopped=1
fi
rm -f logs/dev.pid
# Fallback for anything not started via dev-up.sh that still holds the port.
pids=$(lsof -tiTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null)
[ -n "$pids" ] && { kill $pids; stopped=1; }
[ "$stopped" = 1 ] && echo "[dev-down] web stopped" || echo "[dev-down] web was not running"

if [ "${1:-}" = "--db" ]; then docker compose stop postgres; fi
exit 0
