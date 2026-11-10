import { useEffect, useId, useRef, useState } from 'react';

// Searchable ticker drop-down (WAI-ARIA combobox pattern) backed by GET /api/tickers?q=.
// `value` is the ticker text; `onSelect(item)` fires when a catalog entry is picked.
// `allowTicker` (edit mode) keeps the position's own ticker selectable instead of "Already added".
export default function TickerCombobox({ value, onChange, onSelect, invalid, inputId, allowTicker }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(null); // null = user hasn't typed yet (don't search on mount)
  const listRef = useRef(null);
  const taken = (it) => it.in_positions && it.symbol !== allowTicker;

  useEffect(() => {
    if (query === null) return;
    if (!query.trim()) { setItems([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/tickers?q=${encodeURIComponent(query)}&limit=20`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => { setItems(rows); setActive(rows.findIndex((r) => !taken(r))); })
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(item) {
    if (!item || taken(item)) return;
    onChange(item.symbol);
    onSelect(item);
    setOpen(false);
  }

  function move(delta) {
    if (!items.length) return;
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + delta + items.length) % items.length;
      if (!taken(items[i])) break;
    }
    setActive(i);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); open ? move(1) : setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  }

  const showList = open && query?.trim();

  return (
    <div className="combobox">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        className="ticker"
        value={value}
        placeholder="Search symbol or company, e.g. AAPL or Apple"
        autoComplete="off"
        autoFocus
        spellCheck={false}
        maxLength={16}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        // onMouseDown preventDefault keeps focus in the input so onBlur doesn't close before click.
        <ul className="listbox" role="listbox" id={listId} ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {loading && !items.length && <li className="listbox-hint">Searching…</li>}
          {!loading && !items.length && <li className="listbox-hint">No matching tickers</li>}
          {items.map((it, i) => (
            <li
              key={it.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={taken(it) || undefined}
              data-active={i === active}
              onMouseEnter={() => !taken(it) && setActive(i)}
              onClick={() => choose(it)}
            >
              <span className="opt-symbol">{it.symbol}</span>
              <span className="opt-name">{it.name}</span>
              <span className="opt-meta">
                {taken(it) ? 'Already added' : [it.exchange, it.type].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
