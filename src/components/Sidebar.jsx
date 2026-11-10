import { useEffect, useState } from 'react';

export default function Sidebar({ views, active }) {
  const [dbOk, setDbOk] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setDbOk(h.status === 'ok'))
      .catch(() => setDbOk(false));
  }, []);

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">Finance</div>
      <ul>
        {views.map((v) => (
          <li key={v.id}>
            <a href={`#/${v.id}`} className={v.id === active ? 'active' : undefined}
               aria-current={v.id === active ? 'page' : undefined}>
              {v.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="status" title="API / database status">
        <span className={`dot ${dbOk === null ? '' : dbOk ? 'ok' : 'bad'}`} />
        {dbOk === null ? 'Checking…' : dbOk ? 'Database connected' : 'Database unavailable'}
      </div>
    </nav>
  );
}
