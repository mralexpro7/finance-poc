import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const BASE_URL = process.env.TWELVE_DATA_BASE_URL ?? 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const COUNTRY = process.env.TWELVE_DATA_COUNTRY ?? 'United States';
const TTL_HOURS = Number(process.env.TICKER_CATALOG_TTL_HOURS ?? 24);

// When a symbol is listed on several exchanges, keep the primary listing.
const EXCHANGE_RANK = ['NYSE', 'NASDAQ', 'CBOE', 'NYSE ARCA', 'IEX', 'OTC'];
const rank = (ex) => {
  const i = EXCHANGE_RANK.indexOf(ex);
  return i === -1 ? EXCHANGE_RANK.length : i;
};

function isBetterListing(a, b) {
  const aStock = a.type !== 'ETF';
  if (aStock !== (b.type !== 'ETF')) return aStock;
  return rank(a.exchange) < rank(b.exchange);
}

let syncing = null; // in-flight sync promise, shared by concurrent callers

async function fetchList(endpoint) {
  const url = new URL(`/${endpoint}`, BASE_URL);
  url.searchParams.set('country', COUNTRY);
  // Key goes in a header, not the URL, so it never lands in logs or error messages.
  const res = await fetch(url, { headers: { Authorization: `apikey ${API_KEY}` }, signal: AbortSignal.timeout(120_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === 'error' || !Array.isArray(body.data)) {
    throw new Error(`Twelve Data /${endpoint} failed: ${body.message ?? res.status}`);
  }
  return body.data;
}

async function doSync() {
  if (!API_KEY) throw new Error('TWELVE_DATA_API_KEY is not set in .env');
  const started = Date.now();
  const [stocks, etfs] = await Promise.all([fetchList('stocks'), fetchList('etfs')]);

  // Stocks win over ETFs on symbol collisions; then best-ranked exchange wins.
  const bySymbol = new Map();
  for (const r of [...stocks, ...etfs.map((e) => ({ ...e, type: 'ETF' }))]) {
    const symbol = String(r.symbol ?? '').trim().toUpperCase();
    if (!symbol || symbol.length > 16 || !r.name) continue;
    const cur = bySymbol.get(symbol);
    if (!cur || isBetterListing(r, cur)) bySymbol.set(symbol, { ...r, symbol });
  }
  const rows = [...bySymbol.values()];
  const col = (k) => rows.map((r) => r[k] || null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ticker_catalog');
    await client.query(
      `INSERT INTO ticker_catalog (symbol, name, exchange, mic_code, type, currency, country)
       SELECT * FROM unnest($1::varchar[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])`,
      [col('symbol'), col('name'), col('exchange'), col('mic_code'), col('type'), col('currency'), col('country')]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const result = { count: rows.length, ms: Date.now() - started };
  console.log(`[tickers] synced ${result.count} symbols (${COUNTRY}) in ${result.ms} ms`);
  return result;
}

export function syncCatalog() {
  syncing ??= doSync().finally(() => { syncing = null; });
  return syncing;
}

export async function catalogStatus() {
  const { rows } = await pool.query('SELECT count(*)::int AS count, max(synced_at) AS synced_at FROM ticker_catalog');
  return { ...rows[0], country: COUNTRY, syncing: Boolean(syncing), configured: Boolean(API_KEY) };
}

// Called at server start: refresh in the background when empty or older than TTL.
export async function syncCatalogIfStale() {
  const { count, synced_at } = await catalogStatus();
  const stale = !count || Date.now() - new Date(synced_at).getTime() > TTL_HOURS * 3600_000;
  if (stale) syncCatalog().catch((err) => console.error(`[tickers] ${err.message}`));
}

// Ranked search: exact symbol, then symbol prefix, then name match.
export async function searchCatalog(q, limit = 20) {
  const term = q.trim();
  if (!term) return [];
  const { rows } = await pool.query(
    `SELECT c.symbol, c.name, c.exchange, c.type,
            (p.id IS NOT NULL) AS in_positions
       FROM ticker_catalog c
       LEFT JOIN position p ON p.ticker = c.symbol
      WHERE c.symbol LIKE upper($1) || '%' OR c.name ILIKE '%' || $1 || '%'
      ORDER BY (c.symbol = upper($1)) DESC,
               (c.symbol LIKE upper($1) || '%') DESC,
               (c.name ILIKE $1 || '%') DESC,
               (c.exchange IS DISTINCT FROM 'OTC') DESC,
               (c.type = 'Common Stock') DESC,
               length(c.symbol), c.symbol
      LIMIT $2`,
    [term.replace(/[%_\\]/g, '\\$&'), limit]
  );
  return rows;
}

export async function isKnownTicker(symbol) {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM ticker_catalog WHERE symbol = $1) AS known,
            NOT EXISTS (SELECT 1 FROM ticker_catalog) AS empty`,
    [symbol]
  );
  // An empty catalog (never synced / API down) must not block data entry.
  return rows[0].known || rows[0].empty;
}

// CLI: `npm run tickers:sync`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await syncCatalog();
  } catch (err) {
    console.error(`[tickers] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
