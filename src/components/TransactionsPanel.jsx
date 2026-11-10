import { useEffect, useState } from 'react';
import TransactionForm from './TransactionForm.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { formatAverage, formatDateTime, formatPrice, formatQuantity, formatTime, formatTotal } from '../format.js';

// Purchase history of one position, shown next to the position edit form.
// onCountChange(n) lets the parent keep the positions list's transaction_count in sync.
export default function TransactionsPanel({ position, onCountChange }) {
  const [data, setData] = useState(null); // { transactions, summary, market }
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | transaction
  const [highlight, setHighlight] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const load = () =>
    fetch(`/api/positions/${position.id}/transactions`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [position.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDateDesc = (a, b) => new Date(b.executed_at) - new Date(a.executed_at) || b.id - a.id;

  // Writes return the summary valued at the latest price. If that price moved since the list loaded,
  // reload so every row's market value uses the same price.
  function applySummary(summary, market, transactions) {
    setData({ transactions, summary, market });
    onCountChange?.(summary.count);
    if (market?.price !== data.market?.price) load();
  }

  function handleSaved({ transaction, summary, market }) {
    applySummary(summary, market, [...data.transactions.filter((t) => t.id !== transaction.id), transaction].sort(byDateDesc));
    setHighlight(transaction.id);
    setEditing(null);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/transactions/${toDelete.id}`, { method: 'DELETE' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'Delete failed.');
      applySummary(body.summary, body.market, data.transactions.filter((t) => t.id !== toDelete.id));
      if (editing?.id === toDelete.id) setEditing(null);
      setToDelete(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const s = data?.summary;
  const gainClass = (value, cost) =>
    value == null ? undefined : Number(value) >= Number(cost) ? 'gain' : 'loss';

  return (
    <section className="card tx-panel" aria-labelledby="tx-title">
      <div className="tx-header">
        <h2 id="tx-title">Transactions</h2>
        {data && editing === null && (
          <button className="btn primary small" onClick={() => setEditing('new')}>+ Add transaction</button>
        )}
      </div>

      {data && <MarketLine market={data.market} position={position} />}

      {editing && (
        <TransactionForm
          key={editing === 'new' ? 'new' : editing.id}
          positionId={position.id}
          transaction={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {error && <p className="bad">Could not load transactions: {error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && data.transactions.length === 0 && editing === null && (
        <p className="muted">No transactions yet. Add the first purchase of {position.ticker ?? position.name}.</p>
      )}

      {data && data.transactions.length > 0 && (
        <div className="table-scroll">
          <table className="grid tx-table">
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th className="num">Price</th>
                <th className="num">Quantity</th>
                <th className="num">Total</th>
                <th className="num">Market value</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}
                    className={[t.id === highlight && 'new', editing?.id === t.id && 'editing'].filter(Boolean).join(' ') || undefined}>
                  <td>{formatDateTime(t.executed_at)}</td>
                  <td className="num">{formatPrice(t.price)}</td>
                  <td className="num">{formatQuantity(t.quantity)}</td>
                  <td className="num">{formatTotal(t.total)}</td>
                  <td className={['num', gainClass(t.market_value, t.total)].filter(Boolean).join(' ')}>
                    {formatTotal(t.market_value)}
                  </td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setEditing(t)} disabled={editing?.id === t.id}
                            aria-label={`Edit transaction of ${formatDateTime(t.executed_at)}`}>Edit</button>
                    <button className="btn small danger-outline" onClick={() => { setDeleteError(null); setToDelete(t); }}
                            aria-label={`Delete transaction of ${formatDateTime(t.executed_at)}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{s.count} purchase{s.count === 1 ? '' : 's'} · avg {formatAverage(s.avg_price)}</th>
                <td />
                <td className="num">{formatQuantity(s.quantity)}</td>
                <td className="num">{formatTotal(s.cost)}</td>
                <td className={['num', gainClass(s.market_value, s.cost)].filter(Boolean).join(' ')}>
                  {formatTotal(s.market_value)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete transaction?"
        confirmLabel="Delete"
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete && (
          <p>
            The purchase of <strong>{formatQuantity(toDelete.quantity)}</strong> at{' '}
            <strong>{formatPrice(toDelete.price)}</strong> on {formatDateTime(toDelete.executed_at)} will be
            permanently removed.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

// Which price the market values use, and why there is none when unavailable.
function MarketLine({ market, position }) {
  if (!market?.symbol) {
    return <p className="market-line muted">No market value: this position has no ticker to price{position.category_code === 'cash' ? ' (cash)' : ''}.</p>;
  }
  if (market.price == null) {
    return <p className="market-line bad" role="status">Market price unavailable for {market.symbol}: {market.error}</p>;
  }
  return (
    <p className="market-line" role="status">
      <span className="muted">Market price</span> <strong className="ticker">{market.symbol}</strong>{' '}
      <strong>{formatPrice(market.price)}</strong>
      <span className="muted"> · Twelve Data · as of {formatTime(market.as_of)}</span>
      {market.stale && <span className="warn"> · stale (last known price; {market.error})</span>}
    </p>
  );
}
