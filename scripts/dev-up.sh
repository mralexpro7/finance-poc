#!/usr/bin/env bash
# Idempotent: starts Postgres + the web server only if they are not already running.
# Called by the Claude Code SessionStart hook (.claude/settings.json) and by `npm run up`.
set -u
cd "$(dirname "$0")/.."
set -a; source .env; set +a
mkdir -p logs

if ! docker info >/dev/null 2>&1; then
  echo "[dev-up] Docker is not running - start Docker Desktop, then run: npm run up"
  exit 0
fi

docker compose up -d --wait postgres >logs/docker.log 2>&1 \
  && echo "[dev-up] postgres: running ($POSTGRES_CONTAINER on :$POSTGRES_PORT)" \
  || echo "[dev-up] postgres: FAILED - see logs/docker.log"

# A watcher whose server child crashed leaves the port free but the process alive; restart it cleanly.
if [ -f logs/dev.pid ] && kill -0 "$(cat logs/dev.pid)" 2>/dev/null \
   && ! lsof -iTCP:"$APP_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  scripts/dev-down.sh >/dev/null
fi

if lsof -iTCP:"$APP_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "[dev-up] web: already running at http://$APP_HOST:$APP_PORT"
else
  [ -d node_modules ] || npm install --silent >>logs/dev.log 2>&1
  nohup npm run dev >>logs/dev.log 2>&1 </dev/null &
  echo $! > logs/dev.pid
  disown
  echo "[dev-up] web: started at http://$APP_HOST:$APP_PORT (log: logs/dev.log)"
fi
