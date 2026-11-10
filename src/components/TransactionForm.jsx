import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '../format.js';

// Add (no `transaction`) or edit a purchase. Calls onSaved(responseBody) with {transaction, summary}.
export default function TransactionForm({ positionId, transaction, onSaved, onCancel }) {
  const isEdit = Boolean(transaction);
  const [executedAt, setExecutedAt] = useState(toLocalInput(transaction?.executed_at));
  const [price, setPrice] = useState(transaction?.price ?? '');
  const [quantity, setQuantity] = useState(transaction?.quantity ?? '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const r = await fetch(isEdit ? `/api/transactions/${transaction.id}` : `/api/positions/${positionId}/transactions`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executed_at: fromLocalInput(executedAt), price, quantity }),
      });
      const body = await r.json();
      if (!r.ok) {
        setFieldErrors(body.fields ?? {});
        if (!body.fields) setFormError(body.error ?? 'Could not save.');
        return;
      }
      onSaved(body);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const err = (k) => fieldErrors[k] && <span className="field-error">{fieldErrors[k]}</span>;

  return (
    <form className="form tx-form" onSubmit={submit} noValidate aria-label={isEdit ? 'Edit transaction' : 'Add transaction'}>
      <div className="tx-fields">
        <div className="field">
          <label htmlFor="tx-at">Purchased</label>
          <input id="tx-at" type="datetime-local" value={executedAt} max={toLocalInput()} autoFocus
                 onChange={(e) => setExecutedAt(e.target.value)} aria-invalid={!!fieldErrors.executed_at} />
          {err('executed_at')}
        </div>
        <div className="field">
          <label htmlFor="tx-price">Price per unit ($)</label>
          <input id="tx-price" inputMode="decimal" value={price} placeholder="0.00"
                 onChange={(e) => setPrice(e.target.value)} aria-invalid={!!fieldErrors.price} />
          {err('price')}
        </div>
        <div className="field">
          <label htmlFor="tx-qty">Quantity</label>
          <input id="tx-qty" inputMode="decimal" value={quantity} placeholder="0"
                 onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!fieldErrors.quantity} />
          {err('quantity')}
        </div>
      </div>
      {formError && <p className="bad">{formError}</p>}
      <div className="actions">
        <button type="submit" className="btn primary small" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save transaction' : 'Add transaction'}
        </button>
        <button type="button" className="btn small" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
