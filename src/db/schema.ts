export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS blocks (
  number BIGINT PRIMARY KEY,
  header_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  address TEXT NOT NULL,
  topics TEXT[] NOT NULL,
  log_json TEXT NOT NULL,
  UNIQUE(block_number, log_index)
);

CREATE INDEX IF NOT EXISTS idx_logs_address ON logs(address);
CREATE INDEX IF NOT EXISTS idx_logs_block_range ON logs(block_number);

CREATE TABLE IF NOT EXISTS chain_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rpc_costs (
  method TEXT PRIMARY KEY,
  fcu_per_call INTEGER NOT NULL,
  total_calls BIGINT NOT NULL DEFAULT 0,
  total_fcu BIGINT NOT NULL DEFAULT 0
);

INSERT INTO rpc_costs (method, fcu_per_call) VALUES
  ('eth_blockNumber', 10),
  ('eth_getBlockByNumber', 20),
  ('eth_getLogs', 60)
ON CONFLICT (method) DO NOTHING;

CREATE TABLE IF NOT EXISTS rpc_forwards (
  method TEXT PRIMARY KEY,
  total_calls BIGINT NOT NULL DEFAULT 0
);
`;
