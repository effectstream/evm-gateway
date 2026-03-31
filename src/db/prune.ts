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
