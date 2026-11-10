import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealth({ status: 'error', db: { error: e.message } }));
  }, []);

  return (
    <main>
      <h1>Finance</h1>
      <section>
        <h2>System status</h2>
        {!health && <p>Checking…</p>}
        {health && (
          <dl>
            <dt>API</dt>
            <dd className={health.status === 'ok' ? 'ok' : 'bad'}>{health.status}</dd>
            <dt>Database</dt>
            <dd>{health.db?.database ?? health.db?.error}</dd>
            <dt>Schema</dt>
            <dd>{health.db?.schema ?? '—'}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
