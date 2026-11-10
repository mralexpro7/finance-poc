import { Router } from 'express';
import { pool } from './db.js';
import { getPrice, marketSymbol } from './prices.js';

// Mounted under /api. Numeric columns are returned as strings (pg default) to keep exact decimals;
// the client formats them for display.
export const transactions = Router();

const PRICE_RE = /^\d{1,12}(\.\d{1,8})?$/;      // numeric(20,8)
const QTY_RE = /^\d{1,18}(\.\d{1,10})?$/;       // numeric(28,10)
const ID_RE = /^[1-9]\d{0,17}$/;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

// trim_scale drops padding zeros: 415.25000000 -> 415.25.
// $1 is always the current market price per unit (NULL when unavailable -> market_value NULL).
const COLUMNS = `id, position_id, executed_at, trim_scale(price) AS price, trim_scale(quantity) AS quantity,
  trim_scale(price * quantity) AS total, trim_scale(round(quantity * $1::numeric, 8)) AS market_value`;
const toTx = (r) => ({ ...r, id: Number(r.id), position_id: Number(r.position_id) });

function parseTransaction(body) {
  const fields = {};
  const executedAt = new Date(body?.executed_at ?? '');
  if (!body?.executed_at || Number.isNaN(executedAt.getTime())) fields.executed_at = 'Enter the date and time of purchase.';
  else if (executedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) fields.executed_at = 'Purchase date cannot be in the future.';

  const price = String(body?.price ?? '').replace(/[,\s$]/g, '');
  if (!price) fields.price = 'Price is required.';
  else if (!PRICE_RE.test(price) || Number(price) <= 0) fields.price = 'Enter a positive amount (up to 8 decimals).';

  const quantity = String(body?.quantity ?? '').replace(/[,\s]/g, '');
  if (!quantity) fields.quantity = 'Quantity is required.';
  else if (!QTY_RE.test(quantity) || Number(quantity) <= 0) fields.quantity = 'Enter a positive number (up to 10 decimals).';

  return Object.keys(fields).length
    ? { fields }
    : { value: { executedAt: executedAt.toISOString(), price, quantity } };
}

// Current market price for a position: { symbol, price, as_of, stale, error? } or { symbol: null } when the
// position has no tradable ticker (cash, 401(k) without ticker).
async function positionMarket(positionId) {
  const { rows } = await pool.query(
    `SELECT p.ticker, c.code AS category_code FROM position p
       JOIN position_category c ON c.id = p.category_id WHERE p.id = $1`,
    [positionId]
  );
  if (!rows.length) return undefined;
  const symbol = marketSymbol(rows[0]);
  return symbol ? getPrice(symbol) : { symbol: null };
}

async function summary(positionId, price) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count,
            trim_scale(coalesce(sum(quantity), 0)) AS quantity,
            trim_scale(coalesce(sum(price * quantity), 0)) AS cost,
            CASE WHEN sum(quantity) > 0 THEN trim_scale(round(sum(price * quantity) / sum(quantity), 8)) END AS avg_price,
            trim_scale(round(coalesce(sum(quantity), 0) * $2::numeric, 8)) AS market_value
       FROM position_transaction WHERE position_id = $1`,
    [positionId, price]
  );
  return rows[0];
}

// Common response tail: recalculated summary + the market price it was valued at.
async function totals(positionId, market) {
  return { summary: await summary(positionId, market?.price ?? null), market };
}

async function oneTransaction(id, price) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM position_transaction WHERE id = $2`, [price, id]);
  return toTx(rows[0]);
}

const notFound = (res, what = 'Transaction') => res.status(404).json({ error: `${what} not found.` });
const invalid = (res, fields) => res.status(400).json({ error: 'Invalid input.', fields });

transactions.get('/positions/:id/transactions', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return notFound(res, 'Position');
  try {
    const market = await positionMarket(req.params.id);
    if (!market) return notFound(res, 'Position');
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM position_transaction WHERE position_id = $2 ORDER BY executed_at DESC, id DESC`,
      [market.price ?? null, req.params.id]
    );
    res.json({ transactions: rows.map(toTx), ...(await totals(req.params.id, market)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

transactions.post('/positions/:id/transactions', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return notFound(res, 'Position');
  const { value, fields } = parseTransaction(req.body);
  if (fields) return invalid(res, fields);
  try {
    const { rows } = await pool.query(
      `INSERT INTO position_transaction (position_id, executed_at, price, quantity)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.params.id, value.executedAt, value.price, value.quantity]
    );
    const market = await positionMarket(req.params.id);
    res.status(201).json({
      transaction: await oneTransaction(rows[0].id, market?.price ?? null),
      ...(await totals(req.params.id, market)),
    });
  } catch (err) {
    if (err.code === '23503') return notFound(res, 'Position'); // FK: position deleted meanwhile
    res.status(500).json({ error: err.message });
  }
});

transactions.put('/transactions/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return notFound(res);
  const { value, fields } = parseTransaction(req.body);
  if (fields) return invalid(res, fields);
  try {
    const { rows } = await pool.query(
      `UPDATE position_transaction
          SET executed_at = $2, price = $3, quantity = $4, updated_at = now()
        WHERE id = $1 RETURNING position_id`,
      [req.params.id, value.executedAt, value.price, value.quantity]
    );
    if (!rows.length) return notFound(res);
    const market = await positionMarket(rows[0].position_id);
    res.json({
      transaction: await oneTransaction(req.params.id, market?.price ?? null),
      ...(await totals(rows[0].position_id, market)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

transactions.delete('/transactions/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return notFound(res);
  try {
    const { rows } = await pool.query('DELETE FROM position_transaction WHERE id = $1 RETURNING position_id', [req.params.id]);
    if (!rows.length) return notFound(res);
    res.json(await totals(rows[0].position_id, await positionMarket(rows[0].position_id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
