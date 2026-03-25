export interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ContractFilter {
  address: string; // lowercase hex
  topic: string;   // topic[0] to filter on
}

export interface BlockRow {
  number: string; // bigint comes as string from pglite
  hash: string;
  parent_hash: string;
  timestamp: string;
  header_json: string;
  created_at: string;
}

export interface LogRow {
  id: number;
  block_number: string;
  log_index: number;
  transaction_hash: string;
  transaction_index: number;
  address: string;
  topics: string[];
  data: string;
  removed: boolean;
  block_hash: string;
  log_json: string;
}

export interface ChainStateRow {
  key: string;
  value: string;
}

export interface RpcCostRow {
  id: number;
  method: string;
  fcu_per_call: number;
  total_calls: string;
  total_fcu: string;
}

export interface AppConfig {
  networkName: string;
  rpcUrl: string;
  contracts: ContractFilter[];
  port: number;
  dbPath: string;
  pollIntervalMs: number;
}
