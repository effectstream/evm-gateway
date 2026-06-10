import { getDb } from './index.js';
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
