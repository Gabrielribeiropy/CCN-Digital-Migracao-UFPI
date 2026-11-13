import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL antes da migração.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  const sql = await readFile(fileURLToPath(new URL('../db/001_initial.sql', import.meta.url)), 'utf8');
  await pool.query(sql);
  console.log('Esquema PostgreSQL do CCN Digital pronto.');
} finally { await pool.end(); }
