import type { AppConfig, ContractFilter } from './types.js';

export function loadConfig(): AppConfig {
  const networkName = requireEnv('NETWORK_NAME');
  const rpcUrl = requireEnv('RPC_URL');
  const contractsRaw = process.env.CONTRACTS || '';
  const port = parseInt(process.env.PORT || '3100', 10);
  const dbPath = process.env.DB_PATH || './data/pgdata';
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '1000', 10);
  const retentionBlocks = parseInt(process.env.RETENTION_BLOCKS || '700000', 10);

  const contracts: ContractFilter[] = contractsRaw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(pair => {
      const [address, topic] = pair.split(':');
      if (!address || !topic) {
        throw new Error(`Invalid CONTRACTS format: "${pair}". Expected address:topic`);
      }
      return { address: address.toLowerCase(), topic: topic.toLowerCase() };
    });

  return { networkName, rpcUrl, contracts, port, dbPath, pollIntervalMs, retentionBlocks };
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
