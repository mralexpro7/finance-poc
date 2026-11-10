# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack and runtime model
- **One Node 26 process** (`server/index.js`) runs Express 5. In development it mounts **Vite 8 in middleware mode**, so there is no separate Vite dev server or proxy. API and React app share `APP_PORT` (3000). In production (`NODE_ENV=production`) Express serves `dist/` instead.
- `/api/*` routes live in `server/api.js` and are mounted before the Vite middleware. Anything that isn't `/api` falls through to Vite/the SPA.
- React 19 SPA in `src/`, entry point `index.html` → `src/main.jsx`.
- PostgreSQL 18 runs in Docker (`docker-compose.yml`, container `finance-postgres`, volume `finance-pgdata`). The database is **`finance-db`** and the schema is **`finance-schema`**. Both names contain hyphens, so **always double-quote them in SQL** (`"finance-schema".table`).
- `db/init/01-schema.sql` creates the schema and sets the app role's `search_path` to `"finance-schema"`, so unqualified table names in `server/db.js` queries resolve there. Init scripts run only on an empty volume. To re-apply them: `docker compose down -v && npm run db:up` (destroys data).
- `.env` (gitignored) is the single source of config for compose, the scripts, and the server (via `dotenv`). Keep `.env.example` in sync when adding keys.

## Commands
- `npm run up` / `npm run down [-- --db]`: idempotent background start/stop (`scripts/dev-up.sh`, `scripts/dev-down.sh`). Logs go to `logs/dev.log`.
- `npm run dev`: foreground server. `node --watch-path=server` restarts on `server/` changes; `src/` uses Vite HMR.
- `npm run build` / `npm start`: production build and serve.
- `npm run db:psql`: psql shell in the container.
- Health check: `curl localhost:3000/api/health` (returns the DB name and current schema).
- No test runner or linter is configured yet.

## Session auto-start
`.claude/settings.json` has a SessionStart hook that runs `scripts/dev-up.sh`. It starts Postgres and launches `npm run dev` in the background only if `APP_PORT` is free. If Docker Desktop isn't running, it prints a message and exits 0.

## Documentation policy (`DOCUMENTATION_UPDATE` in `.env`)
Check this flag before finishing any change that alters infrastructure, the data model, or app behavior.
- `ON`: update the affected files and keep them concise:
  - `documentation/finance-idd.puml`: infrastructure, using the PlantUML stdlib **awslib** (`!include <awslib/...>`). Not every icon name exists in the bundled version (e.g. `Database/RDSPostgreSQLInstance` does not; `Database/AuroraPostgreSQLInstance` does).
  - `documentation/finance-db.puml`: data model in **Information Engineering** (crow's foot) notation. Mirror every table in `finance-schema`.
  - `documentation/finance-process.puml`: sequence diagrams for each user-facing flow and API route.
  - `README.md`: usage instructions.
- `OFF`: do not touch these files.

Validate diagrams after editing:
`docker run --rm -v "$PWD/documentation:/in:ro" -v "$TMPDIR:/out" plantuml/plantuml -tpng -o /out '/in/*.puml'` (prints `Error line N` on failure).
