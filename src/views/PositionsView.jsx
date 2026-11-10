import { useEffect, useState } from 'react';
import PositionForm from '../components/PositionForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TransactionsPanel from '../components/TransactionsPanel.jsx';


export default function PositionsView() {
  const [positions, setPositions] = useState(null);
  const [error, setError] = useState(null);
  // form: null | { mode: 'add' } | { mode: 'edit', position }
  const [form, setForm] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [categories, setCategories] = useState(null);

  useEffect(() => {
    const load = (url) =>
      fetch(url).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))));
    Promise.all([load('/api/positions'), load('/api/position-categories')])
      .then(([pos, cats]) => { setPositions(pos); setCategories(cats); })
      .catch((e) => setError(e.message));
  }, []);

  // Same order as the API: category sort order, then name.
  const order = (a, b) =>
    categories.findIndex((c) => c.id === a.category_id) - categories.findIndex((c) => c.id === b.category_id) ||
    a.name.localeCompare(b.name);

  function handleSaved(saved) {
    setPositions((list) => [...list.filter((p) => p.id !== saved.id), saved].sort(order));
    setHighlight(saved.id);
    setForm(null);
  }

  function askDelete(p) {
    setDeleteError(null);
    setToDelete(p);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/positions/${toDelete.id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error((await r.json()).error ?? 'Delete failed.');
      setPositions((list) => list.filter((p) => p.id !== toDelete.id));
      if (form?.position?.id === toDelete.id) setForm(null);
      setToDelete(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <h1>Positions</h1>
        {!form && positions && (
          <button className="btn primary" onClick={() => setForm({ mode: 'add' })}>+ Add position</button>
        )}
      </div>

      {form && (
        <div className="edit-layout">
          <PositionForm
            key={`form-${form.position?.id ?? 'new'}`}
            position={form.position}
            categories={categories}
            onSaved={handleSaved}
            onCancel={() => setForm(null)}
          />
          {form.position ? (
            <TransactionsPanel
              key={`tx-${form.position.id}`}
              position={form.position}
              onCountChange={(n) => setPositions((list) =>
                list.map((p) => (p.id === form.position.id ? { ...p, transaction_count: n } : p)))}
            />
          ) : (
            <section className="card tx-panel tx-placeholder">
              <h2>Transactions</h2>
              <p className="muted">Save the position first, then use <strong>Edit</strong> to record its purchases.</p>
            </section>
          )}
        </div>
      )}

      {error && <p className="bad">Could not load positions: {error}</p>}
      {!error && !positions && <p>Loading…</p>}
      {positions && positions.length === 0 && <p>No positions yet.</p>}
      {positions && positions.length > 0 && (
        <table className="grid">
          <thead>
            <tr><th>Name</th><th>Ticker</th><th>Category</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className={p.id === highlight ? 'new' : undefined}>
                <td>{p.name}</td>
                <td className="ticker">{p.ticker ?? <span className="muted" aria-label="No ticker">—</span>}</td>
                <td><span className={`badge badge-${p.category_code}`}>{p.category_name}</span></td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setForm({ mode: 'edit', position: p })}
                          aria-label={`Edit ${p.name}`}>Edit</button>
                  <button className="btn small danger-outline" onClick={() => askDelete(p)}
                          aria-label={`Delete ${p.name}`}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete position?"
        confirmLabel="Delete"
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete && (
          <p>
            <strong>{toDelete.name}</strong>
            {toDelete.ticker && <> (<span className="ticker">{toDelete.ticker}</span>)</>}
            {toDelete.transaction_count > 0 && (
              <> and its <strong>{toDelete.transaction_count} transaction{toDelete.transaction_count === 1 ? '' : 's'}</strong></>
            )}{' '}
            will be permanently removed. This cannot be undone.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
