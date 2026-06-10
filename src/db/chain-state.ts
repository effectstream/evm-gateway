import { getDb } from './index.js';
import type { ChainStateRow } from '../types.js';

// In-memory cache of the chain tip and cache floor. The poller is the only
// writer of blocks/chain_state and the server runs in the same single-threaded
// process, so these can be served from memory — no DB round-trip per request,
// no locking. Without this, every eth_getBlockByNumber/eth_getLogs ran a
// chain_state read AND a MIN(number) aggregate over millions of rows.
let latestCache: number | null = null;
let oldestCache: number | null = null;

// Load once at startup (after initDb, before the server accepts traffic).
// Also re-syncs the cache from the DB on every restart, so it can never drift
// permanently even if a future code path forgets to update it.
export async function initChainCache(): Promise<void> {
  const db = getDb();
  const ls = await db.query<ChainStateRow>(
    `SELECT value FROM chain_state WHERE key = 'latest_block_number'`
  );
  latestCache = ls.rows.length ? parseInt(ls.rows[0].value, 10) : null;

  const os = await db.query<{ min: string | null }>(
    `SELECT MIN(number) AS min FROM blocks`
  );
  oldestCache = os.rows[0]?.min != null ? parseInt(os.rows[0].min, 10) : null;
}

export async function getLatestBlockNumber(): Promise<number | null> {
  return latestCache;
}

export async function getOldestBlockNumber(): Promise<number | null> {
  return oldestCache;
}

// Write-through: persist the checkpoint (for restart durability) and update the
// in-memory tip atomically.
export async function setLatestBlockNumber(blockNumber: number): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO chain_state (key, value) VALUES ('latest_block_number', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [blockNumber.toString()]
  );
  latestCache = blockNumber;
}

// Floor maintenance, no per-request query:
//  - backfill inserts only ever lower the floor (noteOldestFloor)
//  - prune raises it and refreshes the exact value (setOldestFloor)
export function noteOldestFloor(blockNumber: number): void {
  if (oldestCache === null || blockNumber < oldestCache) oldestCache = blockNumber;
}

export function setOldestFloor(blockNumber: number | null): void {
  oldestCache = blockNumber;
}
