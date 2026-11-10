# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack and runtime model
- **One Node 26 process** (`server/index.js`) runs Express 5. In development it mounts **Vite 8 in middleware mode**, so there is no separate Vite dev server or proxy. API and React app share `APP_PORT` (3000). In production (`NODE_ENV=production`) Express serves `dist/` instead.
- `/api/*` routes live in `server/api.js` and are mounted before the Vite middleware. Anything that isn't `/api` falls through to Vite/the SPA. Write endpoints validate through `parsePosition()` and return `{error, fields:{<field>: message}}` on 400/409; the React forms show `fields` messages next to the matching inputs. Postgres unique violations (`23505`) map to 409.
- Vite's HMR websocket is attached to the Express `http.Server` (`hmr: { server }`), so it shares `APP_PORT`. A separate HMR port would collide when the server restarts.
- React 19 SPA in `src/`, entry point `index.html` → `src/main.jsx`. There is no router library: the `VIEWS` array in `src/App.jsx` drives both the sidebar (`src/components/Sidebar.jsx`) and the hash-based navigation (`#/positions`). To add a page, create `src/views/XView.jsx` and add an entry to `VIEWS`. For destructive actions, use `src/components/ConfirmDialog.jsx` (native modal `<dialog>`).
- **Ticker catalog** (`server/tickers.js`): downloads Twelve Data `/stocks` + `/etfs` filtered by `TWELVE_DATA_COUNTRY`, dedupes per symbol (stock beats ETF; then exchange rank NYSE > NASDAQ > CBOE > IEX > OTC) and atomically replaces `ticker_catalog`. Sync runs in the background at start-up when the catalog is empty or older than `TICKER_CATALOG_TTL_HOURS`; concurrent calls share one in-flight promise. The API key goes in an `Authorization: apikey …` header, never in the URL or the client bundle. Free plan: 8 requests/min, 800/day, and one sync costs 2.
- **Categories drive ticker rules.** `position.category_id` is a required foreign key to `position_category` (ON DELETE RESTRICT). Each category's `ticker_policy` decides how the ticker is validated (`parsePosition` in `server/api.js`) and which input the form shows (`PositionForm.jsx`):
  - `catalog` (Investments): ticker optional; when given, it must be in `ticker_catalog`.
  - `free` (Crypto): ticker required.
  - `none` (Cash): ticker stored as NULL.

  `position.ticker` is nullable but UNIQUE when present. To add a category, insert a row with a policy in a migration; no code change is needed. The catalog check is skipped when the catalog is empty, and on edit only when **both** the ticker and the category are unchanged (so a crypto symbol can't slip into Investments). `src/components/TickerCombobox.jsx` is a WAI-ARIA combobox over `GET /api/tickers`. Options whose `in_positions` is true are disabled, except `allowTicker` (the edited row's own ticker).
- **Transactions** live in `server/transactions.js` (a separate router mounted at `/api`) and in the `position_transaction` table, which references `position` with ON DELETE CASCADE. Money and quantity are `numeric` and are sent as exact decimal strings, with padding zeros removed by `trim_scale()`. Only `src/format.js` turns them into numbers, for display. Every write returns the recalculated `summary`, so the client never adds amounts up itself. `executed_at` is `timestamptz`: the form's `datetime-local` value is local time and is converted to ISO/UTC (`fromLocalInput`). `GET /api/positions` includes `transaction_count`.
- **Market value** (`server/prices.js`): Twelve Data `/price`, in-memory cache per symbol (`PRICE_CACHE_SECONDS`), shared in-flight requests, and the last known price returned as `stale` on errors. `getPrice` never throws. `marketSymbol()` maps position to symbol: no ticker or cash gives null; crypto gives `TICKER/USD`; anything else uses the ticker as is. In SQL, `$1` in `COLUMNS` is always the market price (NULL leaves `market_value` NULL); `market_value` is computed in SQL, not JS. Every transaction response carries `market`, and the panel reloads when a write comes back with a different price, so all rows use one price. Prices are not persisted. `.env` values with spaces must be quoted, because `dev-up.sh` sources the file in the shell.
- `pg` returns `bigint` as a string, so API handlers convert ids with `Number()`.
- PostgreSQL 18 runs in Docker (`docker-compose.yml`, container `finance-postgres`, volume `finance-pgdata`). The database is **`finance-db`** and the schema is **`finance-schema`**. Both names contain hyphens, so **always double-quote them in SQL** (`"finance-schema".table`).
- **Schema changes = new file in `db/migrations/NNN_name.sql`** (never edit an applied one). `server/migrate.js` applies pending files in name order, each in its own transaction, tracked in `"finance-schema".schema_migrations`, under an advisory lock. It runs automatically before the server listens (the dev watcher also restarts on `db/migrations/` changes) or via `npm run db:migrate`. Seed data is also a migration; write it to be idempotent (`ON CONFLICT DO NOTHING`).
- `db/init/01-schema.sql` creates the schema and sets the app role's `search_path` to `"finance-schema"`, so unqualified table names in `server/db.js` queries resolve there. Init scripts run only on an empty volume. To re-apply them: `docker compose down -v && npm run db:up` (destroys data).
- `.env` (gitignored) is the single source of config for compose, the scripts, and the server (via `dotenv`). Keep `.env.example` in sync when adding keys.

## Commands
- `npm run up` / `npm run down [-- --db]`: idempotent background start/stop (`scripts/dev-up.sh`, `scripts/dev-down.sh`). Logs go to `logs/dev.log`. `logs/dev.pid` holds the `npm` pid, and `dev-down` kills that whole tree (npm, then `node --watch`, then the server). Killing only the port listener leaves an orphaned watcher that respawns the server and holds the port.
- `npm run dev`: foreground server. Node `--watch-path` restarts it on `server/` or `db/migrations/` changes; `src/` uses Vite HMR.
- `npm run build` / `npm start`: production build and serve.
- `npm run db:psql`: psql shell in the container.
- `npm run db:migrate`: apply pending migrations by hand.
- `npm run tickers:sync`: download the Twelve Data catalog again.
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
