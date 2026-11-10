import { Router } from 'express';
import { dbHealth, pool } from './db.js';
import { catalogStatus, isKnownTicker, searchCatalog, syncCatalog } from './tickers.js';

export const api = Router();

api.get('/health', async (_req, res) => {
  try {
    res.json({ status: 'ok', db: await dbHealth() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: { error: err.message } });
  }
});

// ---- Position categories ----
api.get('/position-categories', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, code, name, description, ticker_policy FROM position_category ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Positions ----
const POSITION_SELECT = `
  SELECT p.id, p.name, p.ticker, p.category_id, c.code AS category_code, c.name AS category_name,
         (SELECT count(*)::int FROM position_transaction t WHERE t.position_id = p.id) AS transaction_count
    FROM %SRC% p JOIN position_category c ON c.id = p.category_id`;
const positionQuery = (src, tail = '') => POSITION_SELECT.replace('%SRC%', src) + tail;

api.get('/positions', async (_req, res) => {
  try {
    const { rows } = await pool.query(positionQuery('position', ' ORDER BY c.sort_order, p.name'));
    res.json(rows.map(toPosition));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,15}$/;
const toPosition = (row) => ({ ...row, id: Number(row.id) }); // pg returns bigint as string

// Normalizes and validates {name, ticker, category_id} against the category's ticker_policy.
// `current` (edit: the stored {ticker, category_id}) exempts the catalog check only when neither the
// ticker nor the category changed, so a delisted stock stays editable, but a ticker moved in from another
// category (e.g. crypto -> investments) is still checked.
// Returns { value } or { status, body } describing the error response.
async function parsePosition(body, current) {
  const name = String(body?.name ?? '').trim();
  let ticker = String(body?.ticker ?? '').trim().toUpperCase() || null;
  const categoryId = Number(body?.category_id);
  const fields = {};

  if (!name) fields.name = 'Name is required.';
  else if (name.length > 200) fields.name = 'Name must be 200 characters or fewer.';

  const category = Number.isInteger(categoryId)
    ? (await pool.query('SELECT id, ticker_policy FROM position_category WHERE id = $1', [categoryId])).rows[0]
    : undefined;
  if (!category) fields.category_id = 'Choose a category.';

  if (category?.ticker_policy === 'none') ticker = null;
  else if (category) {
    if (!ticker && category.ticker_policy === 'free') fields.ticker = 'Ticker is required for this category.';
    else if (ticker && !TICKER_RE.test(ticker)) fields.ticker = 'Use 1–16 letters, digits, "." or "-".';
    else if (ticker && category.ticker_policy === 'catalog' && !(current && ticker === current.ticker && categoryId === current.category_id) &&
      !(await isKnownTicker(ticker))) {
      return { status: 400, body: UNKNOWN_TICKER(ticker) };
    }
  }

  if (Object.keys(fields).length) return { status: 400, body: { error: 'Invalid input.', fields } };
  return { value: { name, ticker, categoryId } };
}

function parseId(raw) {
  return /^[1-9]\d{0,17}$/.test(raw) ? raw : null; // keep as string; bigint-safe
}

const UNKNOWN_TICKER = (t) => ({ error: 'Unknown ticker.', fields: { ticker: `${t} is not in the Twelve Data ticker list.` } });

function sendDbError(res, err, ticker) {
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate ticker.', fields: { ticker: `${ticker} already exists.` } });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Invalid input.', fields: { category_id: 'Choose a category.' } });
  }
  res.status(500).json({ error: err.message });
}

api.post('/positions', async (req, res) => {
  let parsed;
  try {
    parsed = await parsePosition(req.body);
    if (!parsed.value) return res.status(parsed.status).json(parsed.body);
    const { name, ticker, categoryId } = parsed.value;
    const { rows } = await pool.query(
      `WITH ins AS (INSERT INTO position (name, ticker, category_id) VALUES ($1, $2, $3) RETURNING *)` +
        positionQuery('ins'),
      [name, ticker, categoryId]
    );
    res.status(201).json(toPosition(rows[0]));
  } catch (err) {
    sendDbError(res, err, parsed?.value?.ticker);
  }
});

api.put('/positions/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Position not found.' });
  let parsed;
  try {
    const cur = await pool.query('SELECT ticker, category_id FROM position WHERE id = $1', [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Position not found.' });
    parsed = await parsePosition(req.body, cur.rows[0]);
    if (!parsed.value) return res.status(parsed.status).json(parsed.body);
    const { name, ticker, categoryId } = parsed.value;
    const { rows } = await pool.query(
      `WITH upd AS (UPDATE position SET name = $2, ticker = $3, category_id = $4 WHERE id = $1 RETURNING *)` +
        positionQuery('upd'),
      [id, name, ticker, categoryId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Position not found.' });
    res.json(toPosition(rows[0]));
  } catch (err) {
    sendDbError(res, err, parsed?.value?.ticker);
  }
});

api.delete('/positions/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Position not found.' });
  try {
    const { rowCount } = await pool.query('DELETE FROM position WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Position not found.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Ticker catalog (Twelve Data) ----
api.get('/tickers', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  try {
    res.json(await searchCatalog(String(req.query.q ?? ''), limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/tickers/status', async (_req, res) => {
  try {
    res.json(await catalogStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.post('/tickers/sync', async (_req, res) => {
  try {
    res.json(await syncCatalog());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
