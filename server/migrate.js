import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
const LOCK_ID = 726354; // arbitrary advisory-lock key so concurrent starts don't race

// Applies db/migrations/*.sql in filename order, each once, each in its own transaction.
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS "finance-schema".schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM "finance-schema".schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files.filter((f) => !applied.has(f))) {
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO "finance-schema".schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[migrate] ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// CLI: `npm run db:migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
    console.log('[migrate] up to date');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
