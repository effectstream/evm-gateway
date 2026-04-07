import { trackRpcCall } from '../db/rpc-costs.js';
import { trackForwardedCall } from '../db/rpc-forwards.js';
import { logger } from '../utils.js';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';

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
    const body = { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [hex, false] };
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
    const json = await res.json() as any;
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    await trackRpcCall('eth_getBlockByNumber');
    if (!json.result) return null;
    return { parsed: json.result, rawJson: JSON.stringify(json.result) };
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
    const body = { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params };
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
    const json = await res.json() as any;
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    await trackRpcCall('eth_getLogs');
    const logs = (json.result || []) as any[];
    return {
      parsed: logs,
      rawLogs: logs.map((log: any) => JSON.stringify(log)),
    };
  }

  async forward(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const body = { jsonrpc: '2.0', id: req.id, method: req.method, params: req.params || [] };
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: `Upstream RPC HTTP error: ${res.status}` } };
    }
    const json = await res.json() as JsonRpcResponse;
    await trackForwardedCall(req.method);
    return { jsonrpc: '2.0', id: req.id, result: json.result, error: json.error };
  }

  private async call(method: string, params: unknown[] = []): Promise<unknown> {
    const body = { jsonrpc: '2.0', id: 1, method, params };
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
    const json = await res.json() as any;
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    return json.result;
  }
}
