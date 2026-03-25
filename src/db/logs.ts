import { getDb } from './index.js';
import type { LogRow } from '../types.js';

export async function insertLogs(logs: Array<{
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  transactionIndex: number;
  address: string;
  topics: string[];
  data: string;
  removed: boolean;
  blockHash: string;
  logJson: string;
}>): Promise<void> {
  if (logs.length === 0) return;
  const db = getDb();
  for (const log of logs) {
    await db.query(
      `INSERT INTO logs (block_number, log_index, transaction_hash, transaction_index, address, topics, data, removed, block_hash, log_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (block_number, log_index) DO NOTHING`,
      [
        log.blockNumber,
        log.logIndex,
        log.transactionHash,
        log.transactionIndex,
        log.address,
        log.topics,
        log.data,
        log.removed,
        log.blockHash,
        log.logJson,
      ]
    );
  }
}

export async function queryLogs(filter: {
  address?: string;
  topics?: (string | string[] | null)[];
  fromBlock: number;
  toBlock: number;
}): Promise<LogRow[]> {
  const db = getDb();
  const conditions: string[] = ['block_number >= $1', 'block_number <= $2'];
  const params: unknown[] = [filter.fromBlock, filter.toBlock];
  let paramIdx = 3;

  if (filter.address) {
    conditions.push(`address = $${paramIdx}`);
    params.push(filter.address.toLowerCase());
    paramIdx++;
  }

  // Handle Ethereum topics filter spec:
  // topics is an array where each position can be:
  //   null     = match any
  //   string   = exact match at that position
  //   string[] = OR match at that position
  if (filter.topics) {
    for (let i = 0; i < filter.topics.length; i++) {
      const topicFilter = filter.topics[i];
      if (topicFilter === null || topicFilter === undefined) continue;

      const pgIdx = i + 1; // postgres arrays are 1-indexed
      if (typeof topicFilter === 'string') {
        conditions.push(`topics[${pgIdx}] = $${paramIdx}`);
        params.push(topicFilter.toLowerCase());
        paramIdx++;
      } else if (Array.isArray(topicFilter)) {
        const lowerTopics = topicFilter.map(t => t.toLowerCase());
        conditions.push(`topics[${pgIdx}] = ANY($${paramIdx})`);
        params.push(lowerTopics);
        paramIdx++;
      }
    }
  }

  const sql = `SELECT * FROM logs WHERE ${conditions.join(' AND ')} ORDER BY block_number ASC, log_index ASC`;
  const res = await db.query<LogRow>(sql, params);
  return res.rows;
}
