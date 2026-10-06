import { getAddress } from "viem";
import { CHECK_ABOUT } from "../hook-check";
import { hookReach } from "../permissions";
import { fetchHookedPool, ZERO } from "../subgraph";
import { poolCost } from "./pool-cost";

const COST_ABOUT =
  "A simulation of one anonymous sender trading about 5 units of the pool's stablecoin each way, run through Uniswap's Quoter, so the hook's " +
  "charges are included. A hook can treat other senders differently, so a real trade can differ. Cost is the share of the trade's value lost against the pool's current price.";

export type PoolCheck =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; status: 404 | 422; code: "pool_not_found" | "no_stablecoin_side"; message: string };

/**
 * What a small buy and sell cost in one pool, hook included. Shared by GET /api/v1/pools/{poolId}/cost
 * and the MCP `trade_cost` tool. Throws when the index or the RPC doesn't answer.
 */
export async function checkPoolCost(poolId: string): Promise<PoolCheck> {
  const pool = await fetchHookedPool(poolId);
  if (!pool) return { ok: false, status: 404, code: "pool_not_found", message: "The Arc index doesn't know this pool." };
  const cost = await poolCost(pool);
  if (!cost) {
    return {
      ok: false,
      status: 422,
      code: "no_stablecoin_side",
      message: "Neither token in this pool is USDC or EURC, so there is no dollar amount to price a trade in.",
    };
  }
  const hook = pool.hooks === ZERO ? null : getAddress(pool.hooks);
  return {
    ok: true,
    result: {
      poolId: pool.id,
      pair: { token0: pool.token0.symbol, token1: pool.token1.symbol },
      hook: hook && { address: hook, reach: hookReach(hook), reader: `/hooks/${hook}?pool=${pool.id}` },
      ...cost,
      about: `${COST_ABOUT} ${CHECK_ABOUT}`,
    },
  };
}
