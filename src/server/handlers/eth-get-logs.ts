import type { JsonRpcRequest, JsonRpcResponse } from '../../types.js';
import { getLatestBlockNumber, getOldestBlockNumber } from '../../db/chain-state.js';
import { queryLogs } from '../../db/logs.js';
import { getRpcClient } from '../../poller/rpc-client.js';
import { hexToNumber, sleep } from '../../utils.js';

const MAX_WAIT_MS = 10_000;
const RETRY_MS = 250;

export async function handleEthGetLogs(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const params = req.params || [];
  const filter = params[0] as any;
  if (!filter) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'Invalid params: missing filter object' } };
  }

  const latest = await waitForSync();
  if (latest === null) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Cache not yet populated' } };
  }

  const fromBlock = resolveBlockTag(filter.fromBlock, latest);
  const toBlock = resolveBlockTag(filter.toBlock, latest);

  // If range falls below cache floor, forward to upstream RPC
  const oldest = await getOldestBlockNumber();
  if (oldest !== null && fromBlock < oldest) {
    return getRpcClient().forward(req);
  }

  // If toBlock is ahead of what we have, wait for it
  if (toBlock > latest) {
    const resolved = await waitForBlock(toBlock);
    if (resolved === null) {
      // Check if it's impossibly far
      const currentLatest = await getLatestBlockNumber();
      if (currentLatest !== null && toBlock > currentLatest + 1000) {
        return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Block range too far ahead' } };
      }
      return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Timeout waiting for blocks in range' } };
    }
  }

  const logs = await queryLogs({
    address: filter.address?.toLowerCase(),
    topics: filter.topics,
    fromBlock,
    toBlock,
  });

  const result = logs.map(log => JSON.parse(log.log_json));
  return { jsonrpc: '2.0', id: req.id, result };
}

function resolveBlockTag(tag: string | undefined, latest: number): number {
  if (!tag || tag === 'latest' || tag === 'pending') return latest;
  if (tag === 'earliest') return 0;
  return hexToNumber(tag);
}

async function waitForSync(): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const latest = await getLatestBlockNumber();
    if (latest !== null) return latest;
    await sleep(RETRY_MS);
  }
  return null;
}

async function waitForBlock(targetBlock: number): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const latest = await getLatestBlockNumber();
    if (latest !== null && latest >= targetBlock) return latest;
    await sleep(RETRY_MS);
  }
  return null;
}
