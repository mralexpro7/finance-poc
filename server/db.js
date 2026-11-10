import 'dotenv/config'; // load .env before the pool reads DATABASE_URL (also covers CLI entry points)
import pg from 'pg';

// search_path is set to "finance-schema" on the DB role (db/init/01-schema.sql),
// so unqualified table names resolve to the app schema.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function dbHealth() {
  const { rows } = await pool.query(
    'SELECT current_database() AS database, current_schema() AS schema, version() AS version'
  );
  return rows[0];
}
