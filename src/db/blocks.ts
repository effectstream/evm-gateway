import { getDb } from './index.js';
import type { BlockRow } from '../types.js';

export async function insertBlock(block: {
  number: number;
  headerJson: string;
}): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO blocks (number, header_json)
     VALUES ($1, $2)
     ON CONFLICT (number) DO NOTHING`,
    [block.number, block.headerJson]
  );
}

export async function getBlockByNumber(blockNumber: number): Promise<BlockRow | null> {
  const db = getDb();
  const res = await db.query<BlockRow>(
    `SELECT * FROM blocks WHERE number = $1`,
    [blockNumber]
  );
  return res.rows[0] || null;
}
