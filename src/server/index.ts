import Fastify from 'fastify';
import type { JsonRpcRequest } from '../types.js';
import { handleRpcRequest } from './rpc-handler.js';
import { getRpcCosts } from '../db/rpc-costs.js';
import { getRpcForwards } from '../db/rpc-forwards.js';

export async function createServer(port: number) {
  const app = Fastify({ logger: false });

  // JSON-RPC endpoint
  app.post('/', async (request, reply) => {
    const body = request.body as JsonRpcRequest | JsonRpcRequest[];

    // Batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(handleRpcRequest));
      return reply.send(results);
    }

    // Single request
    const result = await handleRpcRequest(body);

    // If there's an error with code -32000 (cache issues), return 500
    if (result.error && result.error.code === -32000) {
      return reply.status(500).send(result);
    }

    return reply.send(result);
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // RPC cost tracking endpoint
  app.get('/costs', async () => {
    const costs = await getRpcCosts();
    const forwards = await getRpcForwards();
    const totalFcu = costs.reduce((sum, c) => sum + parseInt(c.total_fcu as string, 10), 0);
    const totalForwards = forwards.reduce((sum, f) => sum + parseInt(f.total_calls, 10), 0);
    return { costs, totalFcu, forwards, totalForwards };
  });

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
