# finance-poc

Web application: React 19 front end, Express 5 API, PostgreSQL 18 in Docker. One Node 26 process serves both the API and the React app (Vite runs as Express middleware).

## Prerequisites
- Node 26+ (`.nvmrc`)
- Docker Desktop (running)

## Quick start
```bash
cp .env.example .env   # first time only: set POSTGRES_PASSWORD and DATABASE_URL
npm install
npm run up             # starts Postgres + web server in the background
```
Open http://localhost:3000. The status panel shows whether the API can reach `finance-db` and the `finance-schema` schema.

When you open a Claude Code session in this folder, `npm run up` runs automatically (see `.claude/settings.json`).

## Commands
| Command | What it does |
|---|---|
| `npm run up` / `npm run down` | Start / stop everything in the background (`down -- --db` also stops Postgres) |
| `npm run dev` | Run the web server in the foreground (restarts when `server/` changes; HMR for `src/`) |
| `npm run build` then `npm start` | Production build in `dist/`, served by Express |
| `npm run db:up` / `npm run db:down` | Start / remove the Postgres container (data stays in volume `finance-pgdata`) |
| `npm run db:psql` | Open a psql shell in `finance-db` |

Logs: `logs/dev.log` (web), `logs/docker.log` (container start-up).

## Configuration
Every setting lives in `.env`: app host and port, Postgres connection, and `DOCUMENTATION_UPDATE`.
`db/init/*.sql` runs only when the data volume is first created. To re-run it, reset the volume with `docker compose down -v` (this deletes all data).

## Documentation
`documentation/` holds PlantUML sources:
- `finance-idd.puml`: infrastructure (awslib icons)
- `finance-db.puml`: data model (Information Engineering notation)
- `finance-process.puml`: process sequence diagrams

To render them:
```bash
docker run --rm -v "$PWD/documentation:/data" plantuml/plantuml -tsvg '/data/*.puml'
```
