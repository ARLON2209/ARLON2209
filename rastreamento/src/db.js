import { readFile } from 'node:fs/promises';
import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Defina DATABASE_URL (veja .env.example).');
  return new pg.Pool({ connectionString, max: 10 });
}

export async function migrate(pool) {
  const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
