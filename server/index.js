import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { api } from './api.js';
import { transactions } from './transactions.js';
import { migrate } from './migrate.js';
import { syncCatalogIfStale } from './tickers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? 'localhost';

// Apply pending DB migrations; if the DB is down, keep serving (/api/health reports it).
await migrate().catch((err) => console.error(err.message));
// Refresh the Twelve Data ticker catalog in the background when empty or stale.
syncCatalogIfStale().catch((err) => console.error(`[tickers] ${err.message}`));

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use('/api', api);
app.use('/api', transactions);

if (isProd) {
  // Serve the output of `npm run build`.
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // Vite in middleware mode: HMR + on-the-fly transforms for the React app.
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    // HMR websocket shares APP_PORT instead of a separate port that can collide across restarts.
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.listen(port, host, () => {
  console.log(`finance-poc listening on http://${host}:${port} (${isProd ? 'production' : 'development'})`);
});
