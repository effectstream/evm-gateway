import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { getRpcClient } from '../poller/rpc-client.js';
import { handleEthBlockNumber } from './handlers/eth-block-number.js';
import { handleEthGetBlockByNumber } from './handlers/eth-get-block.js';
import { handleEthGetLogs } from './handlers/eth-get-logs.js';

export async function handleRpcRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  if (!req || !req.method) {
    return {
      jsonrpc: '2.0',
      id: req?.id ?? null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }

  switch (req.method) {
    case 'eth_blockNumber':
      return handleEthBlockNumber(req);
    case 'eth_getBlockByNumber':
      return handleEthGetBlockByNumber(req);
    case 'eth_getLogs':
      return handleEthGetLogs(req);
    default:
      return getRpcClient().forward(req);
  }
}
