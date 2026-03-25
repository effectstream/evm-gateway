import type { JsonRpcRequest, JsonRpcResponse } from '../../types.js';
import { getLatestBlockNumber } from '../../db/chain-state.js';
import { numberToHex, sleep } from '../../utils.js';

const MAX_WAIT_MS = 10_000;
const RETRY_MS = 250;

export async function handleEthBlockNumber(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const blockNumber = await getLatestBlockNumber();
    if (blockNumber !== null) {
      return { jsonrpc: '2.0', id: req.id, result: numberToHex(blockNumber) };
    }
    await sleep(RETRY_MS);
  }
  // Service not yet synced — this should resolve soon after startup
  return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'Cache not yet populated' } };
}
