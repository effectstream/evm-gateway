import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from './schema.js';

let db: PGlite;

export async function initDb(dbPath: string): Promise<PGlite> {
  mkdirSync(dbPath, { recursive: true });
  db = new PGlite(dbPath);
  await db.waitReady;
  await db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): PGlite {
  if (!db) throw new Error('Database not initialized');
  return db;
}
