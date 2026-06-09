import type { ContractFilter } from '../types.js';
import { logger, isTransientNetworkError } from '../utils.js';
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
    private retentionBlocks: number = 700000,
    private lookbackBlocks: number = 0
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
      if (isTransientNetworkError(err)) {
        logger.warn('Poll cycle failed (transient network error), retrying next tick:', err);
      } else {
        logger.error('Poll cycle failed:', err);
        process.exit(1);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private static BATCH_SIZE = 2000;

  private async doPoll(): Promise<void> {
    const currentBlock = await this.rpcClient.getBlockNumber();
    const lastKnown = await getLatestBlockNumber();
    const startBlock = lastKnown !== null ? lastKnown + 1 : currentBlock - this.lookbackBlocks;

    if (startBlock > currentBlock) return;

    const totalBlocks = currentBlock - startBlock + 1;
    if (totalBlocks > Poller.BATCH_SIZE) {
      logger.info(`Backfilling ${totalBlocks} blocks (${startBlock}-${currentBlock})...`);
    }

    let lastBatchTime = Date.now();
    for (let batchStart = startBlock; batchStart <= currentBlock; batchStart += Poller.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + Poller.BATCH_SIZE - 1, currentBlock);
      await this.syncRange(batchStart, batchEnd);
      await setLatestBlockNumber(batchEnd);

      const now = Date.now();
      const batchMs = now - lastBatchTime;
      lastBatchTime = now;

      const synced = batchEnd - startBlock + 1;
      const remaining = currentBlock - batchEnd;
      if (remaining > 0) {
        const batchesLeft = Math.ceil(remaining / Poller.BATCH_SIZE);
        const etaMs = batchMs * batchesLeft;
        const etaMin = Math.round(etaMs / 60000);
        const etaSuffix = etaMin >= 10 ? `, ~${etaMin}min remaining` : '';
        logger.info(`Synced blocks ${batchStart}-${batchEnd} (${synced}/${totalBlocks}, ${remaining} remaining${etaSuffix})`);
      }
    }

    await pruneOldData(currentBlock, this.retentionBlocks);

    const count = currentBlock - startBlock + 1;
    logger.info(`Synced blocks ${startBlock}-${currentBlock} (${count} new)`);
  }

  private static RPC_BATCH_SIZE = 50;

  private async syncRange(startBlock: number, endBlock: number): Promise<void> {
    for (let i = startBlock; i <= endBlock; i += Poller.RPC_BATCH_SIZE) {
      const batchEnd = Math.min(i + Poller.RPC_BATCH_SIZE - 1, endBlock);
      const blockNums = Array.from({ length: batchEnd - i + 1 }, (_, k) => i + k);
      const blocks = await this.rpcClient.getBlocksByNumber(blockNums);
      for (const num of blockNums) {
        const rawJson = blocks.get(num);
        if (!rawJson) {
          logger.warn(`Block ${num} returned null from RPC`);
          continue;
        }
        await insertBlock({ number: num, headerJson: rawJson });
      }
    }

    const byTopic = new Map<string, string[]>();
    for (const contract of this.contracts) {
      const addrs = byTopic.get(contract.topic) || [];
      addrs.push(contract.address);
      byTopic.set(contract.topic, addrs);
    }

    for (const [topic, addresses] of byTopic) {
      try {
        const address = addresses.length === 1 ? addresses[0] : addresses;
        const { parsed, rawLogs } = await this.rpcClient.getLogs(
          address,
          topic,
          startBlock,
          endBlock
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
          logger.info(`Stored ${logRows.length} logs for ${addresses.length} addresses in blocks ${startBlock}-${endBlock}`);
        }
      } catch (err) {
        logger.error(`Failed to fetch logs for topic ${topic}:`, err);
      }
    }
  }
}
