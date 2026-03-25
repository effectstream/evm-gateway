/**
 * E2E Test for ETH RPC Cache Service
 *
 * Boots the full service against ARB_SEPOLIA, waits for sync,
 * then simulates multiple app clients requesting different data.
 *
 * Run: npm run test:e2e
 */

import { loadConfig } from '../src/config.js';
import { initDb } from '../src/db/index.js';
import { getRpcCosts } from '../src/db/rpc-costs.js';
import { RpcClient } from '../src/poller/rpc-client.js';
import { Poller } from '../src/poller/index.js';
import { createServer } from '../src/server/index.js';
import { setLogPrefix, logger, sleep } from '../src/utils.js';

const TEST_PORT = 3199;
const SERVICE_URL = `http://localhost:${TEST_PORT}`;

// ─── JSON-RPC helpers ────────────────────────────────────────────────

let rpcId = 1;

async function rpcCall(method: string, params: unknown[] = []): Promise<any> {
  const body = { jsonrpc: '2.0', id: rpcId++, method, params };
  const res = await fetch(SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function rpcBatch(requests: { method: string; params?: unknown[] }[]): Promise<any[]> {
  const body = requests.map(r => ({
    jsonrpc: '2.0',
    id: rpcId++,
    method: r.method,
    params: r.params || [],
  }));
  const res = await fetch(SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Test assertions ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

// ─── Simulated app clients ──────────────────────────────────────────

async function simulateApp(name: string, contractAddress: string, topic: string) {
  console.log(`\n--- ${name} ---`);

  // 1. Get chain tip
  const tipRes = await rpcCall('eth_blockNumber');
  assert(tipRes.result !== undefined, `${name}: eth_blockNumber returns result`);
  assert(typeof tipRes.result === 'string' && tipRes.result.startsWith('0x'), `${name}: result is hex string`);
  const tipBlock = parseInt(tipRes.result, 16);
  assert(tipBlock > 0, `${name}: block number is positive (${tipBlock})`);

  // 2. Get latest block header
  const blockRes = await rpcCall('eth_getBlockByNumber', [tipRes.result, false]);
  assert(blockRes.result !== null, `${name}: eth_getBlockByNumber returns block`);
  assert(blockRes.result?.hash !== undefined, `${name}: block has hash`);
  assert(blockRes.result?.number !== undefined, `${name}: block has number`);
  assert(blockRes.result?.timestamp !== undefined, `${name}: block has timestamp`);
  assert(blockRes.result?.gasUsed !== undefined, `${name}: block has gasUsed`);
  assert(blockRes.result?.baseFeePerGas !== undefined, `${name}: block has baseFeePerGas`);

  // 3. Get logs for this contract over last few blocks
  const fromBlock = '0x' + (tipBlock - 5).toString(16);
  const toBlock = tipRes.result;
  const logsRes = await rpcCall('eth_getLogs', [{
    address: contractAddress,
    topics: [topic],
    fromBlock,
    toBlock,
  }]);
  assert(Array.isArray(logsRes.result), `${name}: eth_getLogs returns array`);
  console.log(`  ${name}: got ${logsRes.result.length} logs in block range`);

  // 4. Verify "latest" tag works
  const latestBlock = await rpcCall('eth_getBlockByNumber', ['latest', false]);
  assert(latestBlock.result !== null, `${name}: "latest" tag works`);

  return { tipBlock, logsCount: logsRes.result.length };
}

// ─── Main test runner ────────────────────────────────────────────────

async function runTests() {
  const config = loadConfig();
  setLogPrefix('TEST');

  console.log('=== ETH RPC Cache E2E Test ===');
  console.log(`Network: ${config.networkName}`);
  console.log(`RPC: ${config.rpcUrl.replace(/\/v2\/.*/, '/v2/***')}`);

  // Boot service with test-specific DB and port
  const testDbPath = './data/test-e2e';
  const db = await initDb(testDbPath);
  const rpcClient = new RpcClient(config.rpcUrl);
  const poller = new Poller(rpcClient, config.contracts, 1000);
  poller.start();
  const server = await createServer(TEST_PORT);

  console.log(`\nService started on port ${TEST_PORT}, waiting for initial sync...`);

  // Wait for at least one block to be synced
  const maxWait = 15_000;
  const start = Date.now();
  let synced = false;
  while (Date.now() - start < maxWait) {
    try {
      const res = await rpcCall('eth_blockNumber');
      if (res.result && res.result !== '0x0') {
        synced = true;
        break;
      }
    } catch {}
    await sleep(500);
  }

  if (!synced) {
    console.error('FATAL: Service did not sync within timeout');
    process.exit(1);
  }

  console.log('Service synced. Running tests...\n');

  // Wait a couple more seconds to accumulate a few blocks
  await sleep(3000);

  // ─── Test 1: Multiple simulated apps ──────────────────────────────

  console.log('=== Test: Multiple App Clients ===');

  // App 1: Uses the contract from env
  const app1 = await simulateApp(
    'Midnight Games',
    '0xf579fbf09f8bf1a8c7f0da776cb02f37251752ef',
    '0xffa7cf79b6173c04d5ec2b41bce25acc6e48f9cf86349011288bab7da23fc517'
  );

  // App 2: Uses a different (made-up) contract — should get empty logs
  const app2 = await simulateApp(
    'DeFi Dashboard',
    '0x0000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000001'
  );

  // App 3: Same contract as App 1 but different topic — should get empty logs
  const app3 = await simulateApp(
    'Analytics Service',
    '0xf579fbf09f8bf1a8c7f0da776cb02f37251752ef',
    '0x0000000000000000000000000000000000000000000000000000000000000002'
  );

  // ─── Test 2: Batch requests ────────────────────────────────────────

  console.log('\n=== Test: Batch Requests ===');
  const batchRes = await rpcBatch([
    { method: 'eth_blockNumber' },
    { method: 'eth_getBlockByNumber', params: ['latest', false] },
    { method: 'eth_getLogs', params: [{ fromBlock: 'latest', toBlock: 'latest' }] },
  ]);
  assert(Array.isArray(batchRes), 'Batch returns array');
  assert(batchRes.length === 3, 'Batch returns 3 responses');
  assert(batchRes[0].result !== undefined, 'Batch[0] eth_blockNumber has result');
  assert(batchRes[1].result !== undefined, 'Batch[1] eth_getBlockByNumber has result');
  assert(Array.isArray(batchRes[2].result), 'Batch[2] eth_getLogs returns array');

  // ─── Test 3: Unsupported method ────────────────────────────────────

  console.log('\n=== Test: Unsupported Method ===');
  const unsupported = await rpcCall('eth_sendRawTransaction', ['0x00']);
  assert(unsupported.error !== undefined, 'Unsupported method returns error');
  assert(unsupported.error?.code === -32601, 'Error code is -32601');
  assert(unsupported.error?.message === 'Method not supported', 'Error message is correct');

  // ─── Test 4: Response format matches real RPC ──────────────────────

  console.log('\n=== Test: RPC Format Compatibility ===');
  const blockNumRes = await rpcCall('eth_blockNumber');
  assert(blockNumRes.jsonrpc === '2.0', 'Response has jsonrpc: "2.0"');
  assert(blockNumRes.id !== undefined, 'Response mirrors request id');

  const blockRes = await rpcCall('eth_getBlockByNumber', [blockNumRes.result, false]);
  const block = blockRes.result;
  // Verify all expected fields exist (matching Alchemy response format)
  const expectedFields = [
    'baseFeePerGas', 'difficulty', 'extraData', 'gasLimit', 'gasUsed',
    'hash', 'logsBloom', 'number', 'parentHash', 'timestamp',
  ];
  for (const field of expectedFields) {
    assert(block[field] !== undefined, `Block has field: ${field}`);
  }

  // ─── Test 5: Health check ──────────────────────────────────────────

  console.log('\n=== Test: Health & Costs ===');
  const healthRes = await fetch(`${SERVICE_URL}/health`);
  const health = await healthRes.json() as any;
  assert(health.status === 'ok', 'Health check returns ok');

  const costsRes = await fetch(`${SERVICE_URL}/costs`);
  const costs = await costsRes.json() as any;
  assert(Array.isArray(costs.costs), 'Costs endpoint returns costs array');
  assert(costs.totalFcu > 0, `Total FCU spent: ${costs.totalFcu}`);
  console.log('\n--- RPC Cost Summary ---');
  console.log('Method                    | FCU/call | Calls | Total FCU');
  console.log('--------------------------|----------|-------|----------');
  for (const c of costs.costs) {
    const method = c.method.padEnd(25);
    const fcu = String(c.fcu_per_call).padStart(8);
    const calls = String(c.total_calls).padStart(5);
    const total = String(c.total_fcu).padStart(9);
    console.log(`${method} | ${fcu} | ${calls} | ${total}`);
  }
  console.log(`Total FCU spent: ${costs.totalFcu}`);

  // ─── Summary ───────────────────────────────────────────────────────

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  // Cleanup
  poller.stop();
  await server.close();
  await db.close();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
