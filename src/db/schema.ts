export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS blocks (
  number BIGINT PRIMARY KEY,
  hash TEXT NOT NULL,
  parent_hash TEXT,
  timestamp BIGINT,
  header_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  transaction_index INTEGER,
  address TEXT NOT NULL,
  topics TEXT[] NOT NULL,
  data TEXT,
  removed BOOLEAN DEFAULT FALSE,
  block_hash TEXT,
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
`;
