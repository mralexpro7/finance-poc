// Latest prices from Twelve Data /price, cached in memory per symbol.
// Free plan = 8 requests/min, so: cache for PRICE_CACHE_SECONDS, share in-flight requests, and fall back
// to the last known (stale) price when the API errors or rate-limits.
const BASE_URL = process.env.TWELVE_DATA_BASE_URL ?? 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const TTL_MS = Number(process.env.PRICE_CACHE_SECONDS ?? 60) * 1000;

const cache = new Map();    // symbol -> { price: string, asOf: Date }
const inflight = new Map(); // symbol -> Promise

// Which Twelve Data symbol prices a position, by category. null = no market price (cash, no ticker).
export function marketSymbol({ ticker, category_code }) {
  if (!ticker || category_code === 'cash') return null;
  if (category_code === 'crypto') return `${ticker}/USD`;
  return ticker;
}

async function fetchPrice(symbol) {
  const url = new URL('/price', BASE_URL);
  url.searchParams.set('symbol', symbol);
  const res = await fetch(url, { headers: { Authorization: `apikey ${API_KEY}` }, signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === 'error' || body.price == null) {
    const err = new Error(body.code === 429 ? 'Twelve Data rate limit reached; try again in a minute.'
      : body.code === 404 ? `No market price for ${symbol}.`
      : `Twelve Data /price failed (${body.message ?? res.status}).`);
    err.code = body.code ?? res.status;
    throw err;
  }
  const entry = { price: String(body.price), asOf: new Date() };
  cache.set(symbol, entry);
  return entry;
}

// Returns { symbol, price, as_of, stale } or { symbol, error }. Never throws.
export async function getPrice(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.asOf.getTime() < TTL_MS) return { symbol, price: hit.price, as_of: hit.asOf, stale: false };
  if (!API_KEY) return { symbol, error: 'TWELVE_DATA_API_KEY is not set.' };

  if (!inflight.has(symbol)) inflight.set(symbol, fetchPrice(symbol).finally(() => inflight.delete(symbol)));
  try {
    const fresh = await inflight.get(symbol);
    return { symbol, price: fresh.price, as_of: fresh.asOf, stale: false };
  } catch (err) {
    if (hit) return { symbol, price: hit.price, as_of: hit.asOf, stale: true, error: err.message };
    return { symbol, error: err.message };
  }
}
