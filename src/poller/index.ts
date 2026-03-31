import type { ContractFilter } from '../types.js';
import { logger } from '../utils.js';
import { getLatestBlockNumber, setLatestBlockNumber } from '../db/chain-state.js';
import { insertBlock } from '../db/blocks.js';
import { insertLogs } from '../db/logs.js';
import { pruneOldData } from '../db/prune.js';
import { RpcClient } from './rpc-client.js';

export class Poller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    private rpcClient: RpcClient,
    private contracts: ContractFilter[],
    private pollIntervalMs: number,
    private retentionBlocks: number = 700000
  ) {}

  start(): void {
    this.poll(); // run immediately
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.doPoll();
    } catch (err) {
      logger.error('Poll cycle failed:', err);
    } finally {
      this.isRunning = false;
    }
  }

  private async doPoll(): Promise<void> {
    const currentBlock = await this.rpcClient.getBlockNumber();
    const lastKnown = await getLatestBlockNumber();
    const startBlock = lastKnown !== null ? lastKnown + 1 : currentBlock;

    if (startBlock > currentBlock) return;

    // Fetch and store block headers
    for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
      const result = await this.rpcClient.getBlockByNumber(blockNum);
      if (!result) {
        logger.warn(`Block ${blockNum} returned null from RPC`);
        continue;
      }
      const { parsed, rawJson } = result;
      await insertBlock({
        number: blockNum,
        headerJson: rawJson,
      });
    }

    // Fetch and store logs for each contract over the full new range
    for (const contract of this.contracts) {
      try {
        const { parsed, rawLogs } = await this.rpcClient.getLogs(
          contract.address,
          contract.topic,
          startBlock,
          currentBlock
        );
        if (parsed.length > 0) {
          const logRows = parsed.map((log: any, i: number) => ({
            blockNumber: parseInt(log.blockNumber, 16),
            logIndex: parseInt(log.logIndex, 16),
            address: log.address.toLowerCase(),
            topics: log.topics,
            logJson: rawLogs[i],
          }));
          await insertLogs(logRows);
          logger.info(`Stored ${logRows.length} logs for ${contract.address} in blocks ${startBlock}-${currentBlock}`);
        }
      } catch (err) {
        logger.error(`Failed to fetch logs for ${contract.address}:`, err);
      }
    }

    // Update chain state only after everything is stored
    await setLatestBlockNumber(currentBlock);

    // Prune old data beyond retention window
    await pruneOldData(currentBlock, this.retentionBlocks);

    const count = currentBlock - startBlock + 1;
    logger.info(`Synced blocks ${startBlock}-${currentBlock} (${count} new)`);
  }
}
