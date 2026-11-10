#!/usr/bin/env bash
# Stops the web server; pass --db to also stop the Postgres container (data volume is kept).
cd "$(dirname "$0")/.."
set -a; source .env; set +a
pids=$(lsof -tiTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null)
[ -n "$pids" ] && kill $pids && echo "[dev-down] web stopped" || echo "[dev-down] web was not running"
rm -f logs/dev.pid
[ "${1:-}" = "--db" ] && docker compose stop postgres
