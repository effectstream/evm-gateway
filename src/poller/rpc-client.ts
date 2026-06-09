import { trackRpcCall } from '../db/rpc-costs.js';
import { trackForwardedCall } from '../db/rpc-forwards.js';
import { logger, sleep, isTransientNetworkError } from '../utils.js';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

let instance: RpcClient;

export function getRpcClient(): RpcClient {
  if (!instance) throw new Error('RpcClient not initialized');
  return instance;
}

export class RpcClient {
  constructor(private rpcUrl: string) {
    instance = this;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.call('eth_blockNumber') as string;
    await trackRpcCall('eth_blockNumber');
    return parseInt(result, 16);
  }

  async getBlockByNumber(blockNumber: number): Promise<{ parsed: any; rawJson: string } | null> {
    const hex = '0x' + blockNumber.toString(16);
    const json = await this.post({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [hex, false] });
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    await trackRpcCall('eth_getBlockByNumber');
    if (!json.result) return null;
    return { parsed: json.result, rawJson: JSON.stringify(json.result) };
  }

  async getBlocksByNumber(blockNumbers: number[]): Promise<Map<number, string>> {
    const results = new Map<number, string>();
    if (blockNumbers.length === 0) return results;

    const batchBody = blockNumbers.map((num, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'eth_getBlockByNumber',
      params: ['0x' + num.toString(16), false],
    }));

    const jsonArray = await this.post(batchBody) as any[];

    for (const json of jsonArray) {
      if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
      if (json.result) {
        const blockNum = parseInt(json.result.number, 16);
        results.set(blockNum, JSON.stringify(json.result));
      }
      await trackRpcCall('eth_getBlockByNumber');
    }

    return results;
  }

  async getLogs(
    address: string | string[],
    topic: string,
    fromBlock: number,
    toBlock: number
  ): Promise<{ parsed: any[]; rawLogs: string[] }> {
    const params = [{
      address,
      topics: [topic],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
    }];
    const json = await this.post({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params });
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    await trackRpcCall('eth_getLogs');
    const logs = (json.result || []) as any[];
    return {
      parsed: logs,
      rawLogs: logs.map((log: any) => JSON.stringify(log)),
    };
  }

  async forward(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const json = await this.post({ jsonrpc: '2.0', id: req.id, method: req.method, params: req.params || [] }) as JsonRpcResponse;
      await trackForwardedCall(req.method);
      return { jsonrpc: '2.0', id: req.id, result: json.result, error: json.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: `Upstream RPC unavailable: ${message}` } };
    }
  }

  private async call(method: string, params: unknown[] = []): Promise<unknown> {
    const json = await this.post({ jsonrpc: '2.0', id: 1, method, params });
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    return json.result;
  }

  // Single entry point for upstream HTTP. Retries transient network errors
  private async post(body: unknown): Promise<any> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 2));
      }
      try {
        const res = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429 || res.status >= 500) {
          res.body?.cancel().catch(() => {});
          lastErr = new Error(`RPC HTTP error: ${res.status}`);
          logger.warn(`Upstream RPC returned ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
          continue;
        }
        if (!res.ok) {
          res.body?.cancel().catch(() => {});
          throw new Error(`RPC HTTP error: ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        if (!isTransientNetworkError(err)) throw err;
        lastErr = err;
        logger.warn(`Upstream RPC request failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err instanceof Error ? `${err.message} (${(err.cause as Error | undefined)?.message ?? 'no cause'})` : err);
      }
    }
    throw lastErr;
  }
}
