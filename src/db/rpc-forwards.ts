import { getDb } from './index.js';

export async function trackForwardedCall(method: string): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO rpc_forwards (method, total_calls) VALUES ($1, 1)
     ON CONFLICT (method) DO UPDATE SET total_calls = rpc_forwards.total_calls + 1`,
    [method]
  );
}

export async function getRpcForwards(): Promise<Array<{ method: string; total_calls: string }>> {
  const db = getDb();
  const res = await db.query<{ method: string; total_calls: string }>(
    `SELECT method, total_calls FROM rpc_forwards ORDER BY total_calls DESC`
  );
  return res.rows;
}
