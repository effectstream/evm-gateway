# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ETH RPC caching proxy (`eth-rpc-cache`) — polls an upstream Ethereum JSON-RPC endpoint (e.g. Alchemy), stores blocks and event logs in an embedded PGlite database, and serves cached results over a local JSON-RPC 2.0 API. Designed to reduce RPC costs for multiple apps sharing the same chain data.

## Commands

```bash
# Development (hot-reload via tsx watch)
npm run dev:arb-sep        # Arbitrum Sepolia
npm run dev:arb-main       # Arbitrum Mainnet

# Production
npm run start:arb-sep
npm run start:arb-main

# E2E tests (requires .env.arb-sep with valid RPC_URL)
npm run test:e2e
```

No build step — runs TypeScript directly via `tsx`. No unit test framework; tests are a custom E2E runner in `test/e2e.test.ts`.

## Architecture

**Three-layer design:**

1. **Poller** (`src/poller/`) — Background loop that polls upstream RPC on an interval. Fetches new block headers and event logs for configured contract/topic pairs. Writes to PGlite.

2. **Database** (`src/db/`) — PGlite (PostgreSQL in WASM). Four tables: `blocks`, `logs`, `chain_state`, `rpc_costs`. Data persists to disk at `DB_PATH`. All queries use parameterized SQL.

3. **Server** (`src/server/`) — Fastify JSON-RPC 2.0 endpoint. Routes requests through `rpc-handler.ts` to method-specific handlers in `src/server/handlers/`. Supports batch requests. Also exposes `/health` and `/costs` HTTP endpoints.

**Supported RPC methods:**
- `eth_blockNumber` — returns cached chain tip
- `eth_getBlockByNumber` — returns cached block (supports "latest"/"pending" tags)
- `eth_getLogs` — filters cached logs by address, topics, block range

All three handlers retry for up to 10 seconds (250ms intervals) if the requested data isn't cached yet, allowing near-real-time serving during initial sync.

**Startup flow** (`src/index.ts`): load config → init DB → create RPC client → start poller → start Fastify server → register shutdown handlers.

## Configuration

Environment variables loaded via `dotenv-cli` from `.env.arb-sep` or `.env.arb-main`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NETWORK_NAME` | yes | — | Network identifier for logs |
| `RPC_URL` | yes | — | Upstream RPC endpoint |
| `CONTRACTS` | yes | — | Comma-separated `address:topic` pairs |
| `PORT` | no | `3100` | Server port |
| `DB_PATH` | no | `./data/pgdata` | PGlite data directory |
| `POLL_INTERVAL_MS` | no | `1000` | Polling interval in ms |

## Key Patterns

- **ES Modules** — `"type": "module"` in package.json, `NodeNext` module resolution
- **RPC cost tracking** — every upstream call increments FCU counters in `rpc_costs` table (10/20/60 FCU for blockNumber/getBlock/getLogs)
- **Topic filtering** — `eth_getLogs` handler uses PostgreSQL array operations for Ethereum topic matching, supporting null (any) and arrays (OR) per EIP spec
- **No external test framework** — `test/e2e.test.ts` boots the full service on port 3199 and uses a custom assert/runner
