import { cached } from "@/lib/server/cache";
import { fetchPoolCandles, fetchPoolSwaps, type PoolHistory } from "@/lib/subgraph";

const POOL_ID = /^0x[0-9a-fA-F]{64}$/;

/** Candles and recent trades for one pool on Arc mainnet, cached for three minutes (the index allowance is small). */
export async function GET(request: Request, context: RouteContext<"/api/pool-history/[poolId]">) {
  const { poolId } = await context.params;
  if (!POOL_ID.test(poolId)) return Response.json({ error: "Not a pool id." }, { status: 400 });
  const interval = new URL(request.url).searchParams.get("interval") === "day" ? "day" : "hour";

  try {
    const id = poolId.toLowerCase();
    const history = await cached<PoolHistory>(`pool:${id}:${interval}`, 180, async () => {
      const [candles, swaps] = await Promise.all([fetchPoolCandles(id, interval, interval === "hour" ? 336 : 365), fetchPoolSwaps(id, 50)]);
      return { candles, swaps };
    }, { keep: true });
    return Response.json(history, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "The Arc index didn't answer." }, { status: 502 });
  }
}
