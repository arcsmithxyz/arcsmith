import { getAddress } from "viem";
import { CHECK_ABOUT } from "@/lib/hook-check";
import { hookReach } from "@/lib/permissions";
import { apiError, apiJson, apiPreflight, overLimit } from "@/lib/server/api";
import { poolCost } from "@/lib/server/pool-cost";
import { fetchHookedPool, ZERO } from "@/lib/subgraph";

export const dynamic = "force-dynamic";

const COST_ABOUT =
  "A simulation of one anonymous sender trading about 5 units of the pool's stablecoin each way, run through Uniswap's Quoter, so the hook's " +
  "charges are included. A hook can treat other senders differently, so a real trade can differ. Cost is the share of the trade's value lost against the pool's current price.";

/** What a small buy and sell cost in one pool, hook included. */
export async function GET(request: Request, context: RouteContext<"/api/v1/pools/[poolId]/cost">) {
  const limited = await overLimit(request);
  if (limited) return limited;

  const { poolId } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(poolId)) return apiError(400, "invalid_pool_id", "Give a 66-character pool id starting with 0x.");

  try {
    const pool = await fetchHookedPool(poolId);
    if (!pool) return apiError(404, "pool_not_found", "The Arc index doesn't know this pool.");
    const cost = await poolCost(pool);
    if (!cost) {
      return apiError(422, "no_stablecoin_side", "Neither token in this pool is USDC or EURC, so there is no dollar amount to price a trade in.");
    }
    const hook = pool.hooks === ZERO ? null : getAddress(pool.hooks);
    return apiJson(
      {
        poolId: pool.id,
        pair: { token0: pool.token0.symbol, token1: pool.token1.symbol },
        hook: hook && { address: hook, reach: hookReach(hook), reader: `/hooks/${hook}?pool=${pool.id}` },
        ...cost,
        about: `${COST_ABOUT} ${CHECK_ABOUT}`,
      },
      30,
    );
  } catch {
    return apiError(502, "upstream_unavailable", "The index or the RPC didn't answer. Try again in a minute.");
  }
}

export const OPTIONS = apiPreflight;
