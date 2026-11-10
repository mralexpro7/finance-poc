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
Open http://localhost:3000. Use the left sidebar to switch views:
- **Home**: empty for now.
- **Positions**: your holdings, each with a **category** (from the `position_category` table):

  | Category | For | Ticker |
  |---|---|---|
  | Investments | Stocks, ETFs, precious metals, retirement accounts (401(k), IRA) | Optional; picked from the drop-down |
  | Crypto | Bitcoin, Ether, … | Required (e.g. BTC) |
  | Cash | Checking and savings accounts | None |

  - **+ Add position**: choose a **Category** first; the Ticker field changes to match. For Investments, type a symbol or company name in **Ticker** and pick from the drop-down of US stocks and ETFs from [Twelve Data](https://twelvedata.com). The name fills in automatically and can be changed. Tickers you already hold appear as *Already added*. A ticker must be in the list, and all tickers must be unique.
  - **Edit** (on each row): change the category, name and/or ticker. A **Transactions** panel to the right of the form lists the purchases (date and time, price per unit, quantity, total, **market value**) with a totals row (quantity, cost, average price, market value). Market value is quantity × the current price from Twelve Data. It is green when at or above cost and red when below. Crypto is priced in USD (`BTC` uses `BTC/USD`). Cash and positions without a ticker have no market value. Prices are cached for `PRICE_CACHE_SECONDS` (60 by default) because the free plan allows 8 requests/minute. If Twelve Data fails, the last known price is shown and marked *stale*. Use **+ Add transaction**, and **Edit** or **Delete** on each transaction row. Purchases are entered in your local time, and amounts are in USD.
  - **Delete** (on each row): asks for confirmation, then removes the position and all of its transactions permanently.

The dot at the bottom of the sidebar shows whether the database is reachable.

When you open a Claude Code session in this folder, `npm run up` runs automatically (see `.claude/settings.json`).

## Commands
| Command | What it does |
|---|---|
| `npm run up` / `npm run down` | Start / stop everything in the background (`down -- --db` also stops Postgres) |
| `npm run dev` | Run the web server in the foreground (restarts when `server/` changes; HMR for `src/`) |
| `npm run build` then `npm start` | Production build in `dist/`, served by Express |
| `npm run db:up` / `npm run db:down` | Start / remove the Postgres container (data stays in volume `finance-pgdata`) |
| `npm run db:migrate` | Apply pending `db/migrations/*.sql` (this also runs automatically when the server starts) |
| `npm run tickers:sync` | Download the ticker list from Twelve Data again (this also happens at start-up if the list is empty or older than `TICKER_CATALOG_TTL_HOURS`) |
| `npm run db:psql` | Open a psql shell in `finance-db` |

Logs: `logs/dev.log` (web), `logs/docker.log` (container start-up).

## Configuration
Every setting lives in `.env`: app host and port, Postgres connection, Twelve Data (`TWELVE_DATA_API_KEY`, `TWELVE_DATA_COUNTRY`, `TICKER_CATALOG_TTL_HOURS`, `PRICE_CACHE_SECONDS`) and `DOCUMENTATION_UPDATE`. The Twelve Data key is used only by the server. The free plan allows 8 requests/minute and 800/day, and a sync uses 2.
Schema changes go in a new numbered file in `db/migrations/` (e.g. `003_add_x.sql`). Each file is applied once, in name order, and tracked in `schema_migrations`.
`db/init/*.sql` (which creates the schema) runs only when the data volume is first created.

## API
| Route | Returns |
|---|---|
| `GET /api/health` | API and database status |
| `GET /api/position-categories` | `[{id, code, name, description, ticker_policy}]` |
| `GET /api/positions` | `[{id, name, ticker, category_id, category_code, category_name}]`, sorted by category then name |
| `POST /api/positions` | Create from `{name, ticker, category_id}`. Returns 201, 400 (invalid input, with `fields`) or 409 (duplicate ticker) |
| `PUT /api/positions/:id` | Update. Returns 200, 400, 404 or 409 |
| `DELETE /api/positions/:id` | Delete. Returns 204 or 404 |
| `GET /api/positions/:id/transactions` | `{transactions:[{id, executed_at, price, quantity, total, market_value}], summary:{count, quantity, cost, avg_price, market_value}, market:{symbol, price, as_of, stale, error?}}` |
| `POST /api/positions/:id/transactions` | Create from `{executed_at, price, quantity}`. Returns 201 `{transaction, summary, market}`, or 400 / 404 |
| `PUT /api/transactions/:id` / `DELETE /api/transactions/:id` | Update / delete. Returns `{transaction?, summary}` |
| `GET /api/tickers?q=&limit=` | Search the ticker list: `[{symbol, name, exchange, type, in_positions}]` (default 20, max 50) |
| `GET /api/tickers/status` | `{count, synced_at, country, syncing, configured}` |
| `POST /api/tickers/sync` | Download the ticker list again now |

## Documentation
`documentation/` holds PlantUML sources:
- `finance-idd.puml`: infrastructure (awslib icons)
- `finance-db.puml`: data model (Information Engineering notation)
- `finance-process.puml`: process sequence diagrams

To render them:
```bash
docker run --rm -v "$PWD/documentation:/data" plantuml/plantuml -tsvg '/data/*.puml'
```
