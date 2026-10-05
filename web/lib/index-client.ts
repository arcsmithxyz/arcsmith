import type { fetchArcTotals as ArcTotals, fetchHook as Hook, HookedPool, HookedPoolOrder, HookStats, SubgraphPool } from "./subgraph";

/**
 * The Arc index, as browsers read it: through /api/index (app/api/index/[name]/route.ts), where
 * one cached answer serves every visitor. Same functions and shapes as lib/subgraph.ts, which
 * only the server calls, so the index's daily allowance isn't spent once per visitor.
 */

/** The route's limit on pool ids per request (MAX_POOL_IDS there). */
const POOL_IDS_PER_REQUEST = 50;

async function read<T>(name: string, params: Record<string, string> = {}): Promise<T> {
  const search = new URLSearchParams(params).toString();
  const response = await fetch(`/api/index/${name}${search ? `?${search}` : ""}`);
  if (!response.ok) throw new Error(`The Arc index didn't answer (${response.status})`);
  return (await response.json()) as T;
}

/** Pool-level stats for pools we opened, by pool id. */
export async function fetchPools(ids: string[]): Promise<SubgraphPool[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += POOL_IDS_PER_REQUEST) chunks.push(unique.slice(i, i + POOL_IDS_PER_REQUEST));
  const pages = await Promise.all(chunks.map((chunk) => read<SubgraphPool[]>("pools", { ids: chunk.join(",") })));
  return pages.flat();
}

/** The busiest pools on Arc that run any v4 hook (not only ours). `first` is 30 or 100. */
export function fetchHookedPools(order: HookedPoolOrder, first: 30 | 100 = 30): Promise<HookedPool[]> {
  return read("hooked-pools", { order, first: String(first) });
}

/** The hooks with the most pools (or volume, or liquidity) on Arc. */
export function fetchTopHooks(order: "poolCount" | "volumeUSD" | "totalValueLockedUSD" = "poolCount"): Promise<HookStats[]> {
  return read("top-hooks", { order });
}

/** Stats and busiest pools for one hook. `hook` is null when the index has never seen it. */
export function fetchHook(address: string): Promise<Awaited<ReturnType<typeof Hook>>> {
  return read("hook", { address: address.toLowerCase() });
}

/** Network-wide Uniswap v4 totals on Arc, plus how many hooks have pools (capped at 1,000). */
export function fetchArcTotals(): Promise<Awaited<ReturnType<typeof ArcTotals>>> {
  return read("arc-totals");
}
