// Display helpers. Amounts arrive from the API as exact decimal strings; Number() is fine for display.
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 });
const money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const avg = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 10 });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatPrice = (v) => (v == null ? '—' : money.format(Number(v)));
export const formatTotal = (v) => (v == null ? '—' : money2.format(Number(v)));
export const formatAverage = (v) => (v == null ? '—' : avg.format(Number(v)));
export const formatQuantity = (v) => (v == null ? '—' : qty.format(Number(v)));
export const formatDateTime = (iso) => dateTime.format(new Date(iso));
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
export const formatTime = (iso) => time.format(new Date(iso));

// <input type="datetime-local"> works in local time without a zone.
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '');
