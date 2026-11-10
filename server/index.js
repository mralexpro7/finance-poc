import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { api } from './api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? 'localhost';

const app = express();
app.use(express.json());
app.use('/api', api);

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
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`finance-poc listening on http://${host}:${port} (${isProd ? 'production' : 'development'})`);
});
