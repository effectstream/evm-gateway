import { getDb } from './index.js';
import type { BlockRow } from '../types.js';

// Multi-row insert. PGlite's per-query overhead dominates the backfill write
// path (~0.4ms/query), so collapsing N single-row inserts into one statement
// is ~20x faster. 2 params/row; chunk well under Postgres' 65535 param ceiling.
const BLOCK_INSERT_CHUNK = 1000;

export async function insertBlocks(blocks: Array<{
  number: number;
  headerJson: string;
}>): Promise<void> {
  if (blocks.length === 0) return;
  const db = getDb();
  for (let i = 0; i < blocks.length; i += BLOCK_INSERT_CHUNK) {
    const chunk = blocks.slice(i, i + BLOCK_INSERT_CHUNK);
    const values = chunk.map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`).join(',');
    const params = chunk.flatMap(b => [b.number, b.headerJson]);
    await db.query(
      `INSERT INTO blocks (number, header_json)
       VALUES ${values}
       ON CONFLICT (number) DO NOTHING`,
      params
    );
  }
}

export async function getBlockByNumber(blockNumber: number): Promise<BlockRow | null> {
  const db = getDb();
  const res = await db.query<BlockRow>(
    `SELECT * FROM blocks WHERE number = $1`,
    [blockNumber]
  );
  return res.rows[0] || null;
}
