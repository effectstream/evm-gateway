import { getDb } from './index.js';
import type { ChainStateRow } from '../types.js';

export async function getLatestBlockNumber(): Promise<number | null> {
  const db = getDb();
  const res = await db.query<ChainStateRow>(
    `SELECT value FROM chain_state WHERE key = 'latest_block_number'`
  );
  if (res.rows.length === 0) return null;
  return parseInt(res.rows[0].value, 10);
}

export async function getOldestBlockNumber(): Promise<number | null> {
  const db = getDb();
  const res = await db.query<{ min: string | null }>(
    `SELECT MIN(number) as min FROM blocks`
  );
  if (res.rows.length === 0 || res.rows[0].min === null) return null;
  return parseInt(res.rows[0].min, 10);
}

export async function setLatestBlockNumber(blockNumber: number): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO chain_state (key, value) VALUES ('latest_block_number', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [blockNumber.toString()]
  );
}
