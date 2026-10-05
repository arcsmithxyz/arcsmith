import { overLimit } from "@/lib/server/api";
import { cached } from "@/lib/server/cache";
import { fetchArcTotals, fetchHook, fetchHookedPools, fetchPools, fetchTopHooks, type HookedPoolOrder } from "@/lib/subgraph";

/**
 * The Arc index for browsers (lib/index-client.ts). The index allows 3,000 queries a day in
 * total, so pages read it here, where one cached answer serves every visitor, rather than
 * querying it themselves. Only these reads are offered, with checked parameters: this is not a
 * general proxy to the index.
 */

const ADDRESS = /^0x[0-9a-f]{40}$/;
const POOL_ID = /^0x[0-9a-f]{64}$/;
const HOOK_ORDERS = ["poolCount", "volumeUSD", "totalValueLockedUSD"] as const;
const POOL_ORDERS: readonly HookedPoolOrder[] = ["totalValueLockedUSD", "txCount", "volumeUSD"];
/** Page sizes the site asks for: the hooked-pools table (30) and the homepage marquee (100). */
const POOL_PAGE_SIZES = [30, 100];
const MAX_POOL_IDS = 50;

/** How long each answer is reused, in seconds: as long as its page can bear, to stay inside the allowance. */
const TTL = { pools: 300, hookedPools: 600, topHooks: 600, hook: 600, arcTotals: 600 };

type Read = { key: string; ttl: number; keep?: boolean; load: () => Promise<unknown> };

const READS: Record<string, (params: URLSearchParams) => Read | null> = {
  // Stats for specific pools (ours, by pool id).
  pools: (params) => {
    const ids = [...new Set((params.get("ids") ?? "").toLowerCase().split(",").filter(Boolean))].sort();
    if (ids.length === 0 || ids.length > MAX_POOL_IDS || !ids.every((id) => POOL_ID.test(id))) return null;
    return { key: `pools:${ids.join(",")}`, ttl: TTL.pools, load: () => fetchPools(ids) };
  },
  // The busiest hooked pools on Arc.
  "hooked-pools": (params) => {
    const order = params.get("order") as HookedPoolOrder;
    const first = Number(params.get("first") ?? 30);
    if (!POOL_ORDERS.includes(order) || !POOL_PAGE_SIZES.includes(first)) return null;
    return { key: `hooked-pools:${order}:${first}`, ttl: TTL.hookedPools, keep: true, load: () => fetchHookedPools(order, first) };
  },
  // The hooks with the most pools, volume or liquidity.
  "top-hooks": (params) => {
    const order = params.get("order") as (typeof HOOK_ORDERS)[number];
    if (!HOOK_ORDERS.includes(order)) return null;
    return { key: `top-hooks:${order}`, ttl: TTL.topHooks, keep: true, load: () => fetchTopHooks(order) };
  },
  // One hook's stats and busiest pools.
  hook: (params) => {
    const address = (params.get("address") ?? "").toLowerCase();
    if (!ADDRESS.test(address)) return null;
    return { key: `hook:${address}`, ttl: TTL.hook, load: () => fetchHook(address) };
  },
  // Network-wide Uniswap v4 totals on Arc.
  "arc-totals": () => ({ key: "arc-totals", ttl: TTL.arcTotals, keep: true, load: fetchArcTotals }),
};

export async function GET(request: Request, context: RouteContext<"/api/index/[name]">) {
  const { name } = await context.params;
  const build = Object.hasOwn(READS, name) ? READS[name] : undefined;
  if (!build) return Response.json({ error: "Unknown index read." }, { status: 404 });
  const read = build(new URL(request.url).searchParams);
  if (!read) return Response.json({ error: "Bad parameters." }, { status: 400 });

  const limited = await overLimit(request);
  if (limited) return limited;
  try {
    const data = await cached(read.key, read.ttl, read.load, { keep: read.keep });
    return Response.json(data, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "The Arc index didn't answer." }, { status: 502 });
  }
}
