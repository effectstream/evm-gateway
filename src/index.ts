import { loadConfig } from './config.js';
import { initDb } from './db/index.js';
import { RpcClient } from './poller/rpc-client.js';
import { Poller } from './poller/index.js';
import { createServer } from './server/index.js';
import { setLogPrefix, logger } from './utils.js';

async function main() {
  const config = loadConfig();
  setLogPrefix(config.networkName);

  logger.info(`Starting ETH RPC Cache for ${config.networkName}`);

  const db = await initDb(config.dbPath);
  logger.info(`Database initialized at ${config.dbPath}`);

  const rpcClient = new RpcClient(config.rpcUrl);
  const poller = new Poller(rpcClient, config.contracts, config.pollIntervalMs, config.retentionBlocks);
  poller.start();
  logger.info(`Poller started (${config.pollIntervalMs}ms interval, ${config.contracts.length} contracts)`);

  await createServer(config.port);
  logger.info(`JSON-RPC proxy listening on http://localhost:${config.port}`);
  logger.info(`Cost dashboard at http://localhost:${config.port}/costs`);

  const shutdown = async () => {
    logger.info('Shutting down...');
    poller.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
