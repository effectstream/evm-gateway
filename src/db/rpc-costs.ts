import { getDb } from './index.js';
import type { RpcCostRow } from '../types.js';

export async function trackRpcCall(method: string): Promise<void> {
  const db = getDb();
  await db.query(
    `UPDATE rpc_costs
     SET total_calls = total_calls + 1,
         total_fcu = total_fcu + fcu_per_call
     WHERE method = $1`,
    [method]
  );
}

export async function getRpcCosts(): Promise<RpcCostRow[]> {
  const db = getDb();
  const res = await db.query<RpcCostRow>(`SELECT * FROM rpc_costs ORDER BY method`);
  return res.rows;
}
