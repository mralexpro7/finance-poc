import { useEffect, useRef, useState } from 'react';
import TickerCombobox from './TickerCombobox.jsx';

const TICKER_HINT = {
  catalog: 'Optional. Leave empty for a 401(k), retirement account or physical metal.',
  free: 'Required. The coin symbol, e.g. BTC or ETH.',
};

// Create (no `position`) or edit (`position` given) a position.
// `categories` come from GET /api/position-categories; each has a ticker_policy (catalog | free | none).
export default function PositionForm({ position, categories, onSaved, onCancel }) {
  const isEdit = Boolean(position);
  const [categoryId, setCategoryId] = useState(position?.category_id ?? categories[0]?.id ?? '');
  const [name, setName] = useState(position?.name ?? '');
  const [ticker, setTicker] = useState(position?.ticker ?? '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const autoName = useRef(null); // last name filled from the catalog; user edits stop auto-fill

  const category = categories.find((c) => c.id === Number(categoryId));
  const policy = category?.ticker_policy;

  useEffect(() => {
    fetch('/api/tickers/status').then((r) => r.json()).then(setCatalog).catch(() => setCatalog({ count: 0 }));
  }, []);

  function handleCategoryChange(e) {
    setCategoryId(Number(e.target.value));
    setFieldErrors((f) => ({ ...f, category_id: undefined, ticker: undefined }));
  }

  function handleTickerSelect(item) {
    if (!name.trim() || name === autoName.current) {
      setName(item.name);
      autoName.current = item.name;
    }
    setFieldErrors((f) => ({ ...f, ticker: undefined, name: undefined }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const r = await fetch(isEdit ? `/api/positions/${position.id}` : '/api/positions', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ticker: policy === 'none' ? null : ticker, category_id: Number(categoryId) }),
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

  const catalogHint = !catalog
    ? null
    : catalog.count
      ? `Search ${catalog.count.toLocaleString()} ${catalog.country ?? ''} stocks and ETFs from Twelve Data.`
      : 'Ticker list unavailable. Any valid ticker is accepted.';
  const tickerHint = policy === 'catalog' ? [TICKER_HINT.catalog, catalogHint].filter(Boolean).join(' ') : TICKER_HINT[policy];

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{isEdit ? `Edit ${position.ticker ?? position.name}` : 'New position'}</h2>

      <div className="field">
        <label htmlFor="pf-category">Category</label>
        <select id="pf-category" value={categoryId} onChange={handleCategoryChange}
                aria-invalid={!!fieldErrors.category_id} aria-describedby="pf-category-hint">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {fieldErrors.category_id
          ? <span className="field-error">{fieldErrors.category_id}</span>
          : <span className="field-hint" id="pf-category-hint">{category?.description}</span>}
      </div>

      {policy && policy !== 'none' && (
        <div className="field">
          <label htmlFor="pf-ticker">Ticker{policy === 'catalog' && <span className="optional"> (optional)</span>}</label>
          {policy === 'catalog' ? (
            <TickerCombobox
              inputId="pf-ticker"
              value={ticker}
              onChange={setTicker}
              onSelect={handleTickerSelect}
              invalid={!!fieldErrors.ticker}
              allowTicker={position?.ticker}
            />
          ) : (
            <input id="pf-ticker" className="ticker" value={ticker} maxLength={16} autoComplete="off"
                   spellCheck={false} placeholder="e.g. BTC" aria-invalid={!!fieldErrors.ticker}
                   onChange={(e) => setTicker(e.target.value.toUpperCase())} />
          )}
          {fieldErrors.ticker
            ? <span className="field-error">{fieldErrors.ticker}</span>
            : tickerHint && <span className="field-hint">{tickerHint}</span>}
        </div>
      )}

      <div className="field">
        <label htmlFor="pf-name">Name</label>
        <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200}
               placeholder={policy === 'none' ? 'e.g. Chase Checking' : policy === 'free' ? 'e.g. Bitcoin' : 'Filled in when you pick a ticker'}
               aria-invalid={!!fieldErrors.name} />
        {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
      </div>

      {formError && <p className="bad">{formError}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
