import { getDb } from './index.js';
import { setOldestFloor } from './chain-state.js';
import { logger } from '../utils.js';

export async function pruneOldData(currentBlock: number, retentionBlocks: number): Promise<void> {
  if (retentionBlocks <= 0) return;

  const cutoff = currentBlock - retentionBlocks;
  if (cutoff <= 0) return;

  const db = getDb();
  const logsResult = await db.query(`DELETE FROM logs WHERE block_number < $1`, [cutoff]);
  const blocksResult = await db.query(`DELETE FROM blocks WHERE number < $1`, [cutoff]);

  const logsDeleted = logsResult.affectedRows ?? 0;
  const blocksDeleted = blocksResult.affectedRows ?? 0;
  if (blocksDeleted > 0 || logsDeleted > 0) {
    logger.info(`Pruned ${blocksDeleted} blocks and ${logsDeleted} logs below block ${cutoff}`);
  }

  // The floor moved — refresh the cached oldest from the exact value. This is an
  // index scan (first leaf of the PK), runs only on prune (~every 5 min), and
  // keeps the per-request reads off the MIN aggregate.
  if (blocksDeleted > 0) {
    const r = await db.query<{ min: string | null }>(`SELECT MIN(number) AS min FROM blocks`);
    setOldestFloor(r.rows[0]?.min != null ? parseInt(r.rows[0].min, 10) : null);
  }
}

// PGlite runs Postgres in single-user mode with no autovacuum background
// worker, so dead tuples from pruning are never reclaimed automatically and
// the heap bloats without bound. A plain VACUUM (no exclusive lock, no file
// shrink) returns dead space to the freelist so subsequent inserts reuse it
// instead of extending the files — this keeps the on-disk size stable after a
// one-time VACUUM FULL reset. Must run outside a transaction.
export async function vacuum(): Promise<void> {
  const db = getDb();
  await db.query(`VACUUM blocks`);
  await db.query(`VACUUM logs`);
}
