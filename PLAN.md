# Plan: Reduce DB Storage Growth

## Problem

DB storage grows too fast. Two causes:

1. **No pruning** — blocks and logs accumulate forever (~345,600 blocks/day on Arbitrum One)
2. **Redundant columns** — both tables store parsed columns that are never queried or served, alongside the raw JSON that is actually used

Additionally, pruned data would silently return `null` / empty results. Queries for pruned blocks should fall back to the upstream RPC. Unsupported methods currently error instead of forwarding.

## Column audit

### `blocks` table

| Column | Keep | Reason |
|---|---|---|
| `number` | yes | Primary key, used in lookups |
| `header_json` | yes | Served to clients via JSON-RPC |
| `hash` | **drop** | Never queried, already in `header_json` |
| `parent_hash` | **drop** | Never queried, already in `header_json` |
| `timestamp` | **drop** | Never queried, already in `header_json` |
| `created_at` | **drop** | Never queried or served |

### `logs` table

| Column | Keep | Reason |
|---|---|---|
| `block_number` | yes | Queried in `WHERE block_number >= / <=` |
| `log_index` | yes | Part of unique constraint |
| `address` | yes | Queried in `WHERE address = $1` |
| `topics` | yes | Queried in `WHERE topics[n] = $1` |
| `log_json` | yes | Served to clients via JSON-RPC |
| `transaction_hash` | **drop** | Never queried, already in `log_json` |
| `transaction_index` | **drop** | Never queried, already in `log_json` |
| `data` | **drop** | Never queried, already in `log_json` |
| `removed` | **drop** | Never queried, already in `log_json` |
| `block_hash` | **drop** | Never queried, already in `log_json` |

## Changes

### 1. Slim down schema (`src/db/schema.ts`)

```sql
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
```

Add new table for tracking forwarded calls:

```sql
CREATE TABLE IF NOT EXISTS rpc_forwards (
  method TEXT PRIMARY KEY,
  total_calls BIGINT NOT NULL DEFAULT 0
);
```

### 2. Update insert functions

- `src/db/blocks.ts` — `insertBlock()` only passes `number` and `headerJson`
- `src/db/logs.ts` — `insertLogs()` only passes `block_number`, `log_index`, `address`, `topics`, `log_json`

### 3. Update types (`src/types.ts`)

- `BlockRow` — remove `hash`, `parent_hash`, `timestamp`, `created_at`
- `LogRow` — remove `transaction_hash`, `transaction_index`, `data`, `removed`, `block_hash`

### 4. Update poller (`src/poller/index.ts`)

- `insertBlock()` call — stop passing `hash`, `parentHash`, `timestamp`
- `insertLogs()` call — stop passing `transactionHash`, `transactionIndex`, `data`, `removed`, `blockHash`

### 5. Retention pruning (already implemented)

- `src/db/prune.ts` — deletes blocks and logs older than `RETENTION_BLOCKS`
- Default: 700,000 blocks (~2 days on Arbitrum One)
- Set `RETENTION_BLOCKS=0` to disable

### 6. Forward all non-cached requests to upstream RPC

All requests that can't be served from cache get forwarded to the upstream RPC. This covers three cases:

- **Pruned data** — cached handler determines data is below cache floor
- **Unsupported methods** — `default` case in `rpc-handler.ts` switch, currently returns -32601

#### Implementation

- `src/poller/rpc-client.ts` — add `forward(req)` method that sends a raw JSON-RPC request to upstream and returns the `JsonRpcResponse`
- Make `RpcClient` accessible to handlers via a module-level getter (like `getDb()`)
- `src/db/chain-state.ts` — add `getOldestBlockNumber()` that queries `MIN(number) FROM blocks`
- `src/db/rpc-forwards.ts` — new file: `trackForwardedCall(method)` increments `total_calls` for the method in `rpc_forwards` table
- `src/server/handlers/eth-get-block.ts` — if requested block < oldest cached block, forward to upstream
- `src/server/handlers/eth-get-logs.ts` — if `fromBlock` < oldest cached block, forward to upstream
- `src/server/rpc-handler.ts` — `default` case forwards to upstream instead of returning error
- `src/server/index.ts` — expose `rpc_forwards` data on `/costs` endpoint (or new `/forwards` endpoint)

### Note

Existing databases will need to be wiped (`rm -rf data/`) since PGlite doesn't support `ALTER TABLE DROP COLUMN` cleanly. The schema uses `IF NOT EXISTS`, so existing tables won't be recreated automatically with the new shape.
