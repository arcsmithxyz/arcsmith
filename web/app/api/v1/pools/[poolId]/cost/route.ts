import { apiError, apiJson, apiPreflight, overLimit } from "@/lib/server/api";
import { checkPoolCost } from "@/lib/server/pool-check";

export const dynamic = "force-dynamic";

/** What a small buy and sell cost in one pool, hook included. */
export async function GET(request: Request, context: RouteContext<"/api/v1/pools/[poolId]/cost">) {
  const limited = await overLimit(request);
  if (limited) return limited;

  const { poolId } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(poolId)) return apiError(400, "invalid_pool_id", "Give a 66-character pool id starting with 0x.");

  try {
    const check = await checkPoolCost(poolId);
    return check.ok ? apiJson(check.result, 30) : apiError(check.status, check.code, check.message);
  } catch {
    return apiError(502, "upstream_unavailable", "The index or the RPC didn't answer. Try again in a minute.");
  }
}

export const OPTIONS = apiPreflight;
