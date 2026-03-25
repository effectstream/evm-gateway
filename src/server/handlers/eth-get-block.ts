import type { JsonRpcRequest, JsonRpcResponse } from '../../types.js';
import { getLatestBlockNumber } from '../../db/chain-state.js';
import { getBlockByNumber } from '../../db/blocks.js';
import { hexToNumber, sleep } from '../../utils.js';

const MAX_WAIT_MS = 10_000;
const RETRY_MS = 250;

export async function handleEthGetBlockByNumber(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const params = req.params || [];
  const blockParam = params[0] as string | undefined;

  let blockNumber: number;
  if (!blockParam || blockParam === 'latest') {
    const latest = await getLatestBlockNumber();
    if (latest === null) {
      return awaitSync(req);
    }
    blockNumber = latest;
  } else if (blockParam === 'earliest') {
    // We don't cache from genesis — this will never resolve
    return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Block not available in cache' } };
  } else if (blockParam === 'pending') {
    const latest = await getLatestBlockNumber();
    if (latest === null) return awaitSync(req);
    blockNumber = latest;
  } else {
    blockNumber = hexToNumber(blockParam);
  }

  // Check if this block is way in the future (will never resolve)
  const latest = await getLatestBlockNumber();
  if (latest !== null && blockNumber > latest + 1000) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Block too far ahead, not available' } };
  }

  // Retry loop: block might be arriving soon
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const block = await getBlockByNumber(blockNumber);
    if (block) {
      return { jsonrpc: '2.0', id: req.id, result: JSON.parse(block.header_json) };
    }
    // If block is behind what we've already synced, it's not coming
    const currentLatest = await getLatestBlockNumber();
    if (currentLatest !== null && blockNumber <= currentLatest) {
      // We've synced past this block but don't have it — shouldn't happen, but return null
      return { jsonrpc: '2.0', id: req.id, result: null };
    }
    await sleep(RETRY_MS);
  }

  return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Timeout waiting for block' } };
}

async function awaitSync(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const latest = await getLatestBlockNumber();
    if (latest !== null) {
      const block = await getBlockByNumber(latest);
      if (block) {
        return { jsonrpc: '2.0', id: req.id, result: JSON.parse(block.header_json) };
      }
    }
    await sleep(RETRY_MS);
  }
  return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Cache not yet populated' } };
}
