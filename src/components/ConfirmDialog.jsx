import { useEffect, useRef } from 'react';

// Modal confirmation built on native <dialog> (focus trap, Esc to cancel, backdrop).
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, busy, error, onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title"
            onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="confirm-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      {error && <p className="bad">{error}</p>}
      <div className="actions">
        <button className="btn" onClick={onCancel} disabled={busy} autoFocus>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
