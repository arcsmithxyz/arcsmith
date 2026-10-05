import { launchpadAbi } from "../abi/Launchpad";
import { arcMainnet } from "../chains";
import { deployments } from "../deployments";
import { poolPaths } from "../pool-path";
import { fetchRecentSwaps, type FeedSwap, type SubgraphToken } from "../subgraph";
import { kernelPools } from "./kernel-pools";
import { cached } from "./cache";
import { serverClient } from "./chain";

export type FeedScope = "arcsmith" | "hooked";

type FeedToken = { id: string; symbol: string };

export type FeedItem =
  | {
      kind: "swap";
      id: string;
      time: number;
      poolId: string;
      hook: string;
      /** Arcsmith market number when the pool is one of ours. */
      marketId: string | null;
      /** Its page (/pool/<token>) when the pool is one of ours. */
      poolPath: string | null;
      base: FeedToken;
      quote: FeedToken;
      side: "buy" | "sell";
      baseAmount: number;
      valueUSD: number;
      trader: string;
      tx: string;
    }
  | {
      kind: "pool";
      id: string;
      time: number;
      poolId: string;
      hook: string;
      marketId: string | null;
      poolPath: string | null;
      base: FeedToken;
      quote: FeedToken;
    };

// Quote-side tokens on Arc, most "money-like" first; the other token in a pair is the one traded.
const USDC = "0x3600000000000000000000000000000000000000";

const mainnet = deployments[arcMainnet.id];

/**
 * The latest swaps (and, for Arcsmith, new pools) on Arc mainnet, newest first. Cached five
 * minutes: the index allows 3,000 queries a day in total, and every page shares this answer.
 */
export function getFeed(scope: FeedScope): Promise<FeedItem[]> {
  return cached(`feed:${scope}`, 300, () => loadFeed(scope), { keep: true });
}

async function loadFeed(scope: FeedScope): Promise<FeedItem[]> {
  if (scope === "hooked" || !mainnet) {
    const [swaps, markets] = await Promise.all([fetchRecentSwaps("hooked", 30), ourMarkets().catch(() => new Map<string, OurMarket>())]);
    return swaps.map((s) => toSwapItem(s, markets));
  }

  const [swaps, pools, markets] = await Promise.all([
    fetchRecentSwaps({ hook: mainnet.kernel }, 30),
    kernelPools(mainnet.kernel),
    ourMarkets().catch(() => new Map<string, OurMarket>()),
  ]);
  const opened: FeedItem[] = pools.slice(-10).map((p) => {
    const [base, quote] = orient(p.token0, p.token1);
    return {
      kind: "pool",
      id: `pool-${p.id}`,
      time: Number(p.createdAtTimestamp),
      poolId: p.id,
      hook: mainnet.kernel.toLowerCase(),
      marketId: markets.get(p.id.toLowerCase())?.id ?? null,
      poolPath: markets.get(p.id.toLowerCase())?.path ?? null,
      base,
      quote,
    };
  });
  return [...swaps.map((s) => toSwapItem(s, markets)), ...opened].sort((a, b) => b.time - a.time).slice(0, 30);
}

function toSwapItem(swap: FeedSwap, markets: Map<string, OurMarket>): FeedItem {
  const { token0, token1 } = swap.pool;
  const [base, quote] = orient(token0, token1);
  // Amounts are from the pool's side: a negative base amount means the trader received it.
  const baseAmount = Number(base.id === token0.id.toLowerCase() ? swap.amount0 : swap.amount1);
  return {
    kind: "swap",
    id: swap.id,
    time: Number(swap.timestamp),
    poolId: swap.pool.id,
    hook: swap.pool.hooks,
    marketId: markets.get(swap.pool.id.toLowerCase())?.id ?? null,
    poolPath: markets.get(swap.pool.id.toLowerCase())?.path ?? null,
    base,
    quote,
    side: baseAmount < 0 ? "buy" : "sell",
    baseAmount: Math.abs(baseAmount),
    valueUSD: Number(swap.amountUSD),
    trader: swap.origin,
    tx: swap.transaction.id,
  };
}

/** [traded token, quote token]: USDC is the quote when present, otherwise token0. */
function orient(token0: SubgraphToken, token1: SubgraphToken): [FeedToken, FeedToken] {
  const t0 = { id: token0.id.toLowerCase(), symbol: token0.symbol };
  const t1 = { id: token1.id.toLowerCase(), symbol: token1.symbol };
  return t1.id === USDC ? [t0, t1] : [t1, t0];
}

type OurMarket = { id: string; path: string };

/** Arcsmith pool id → market number and page, from the Launchpad. Cached a minute. */
function ourMarkets(): Promise<Map<string, OurMarket>> {
  return cached("feed:markets:v2", 60, async () => {
    if (!mainnet) return [] as [string, OurMarket][];
    const client = serverClient(arcMainnet);
    const count = await client.readContract({ address: mainnet.launchpad, abi: launchpadAbi, functionName: "marketCount" });
    if (count === 0n) return [] as [string, OurMarket][];
    const markets = await client.readContract({ address: mainnet.launchpad, abi: launchpadAbi, functionName: "getMarkets", args: [0n, count] });
    const paths = poolPaths(markets.map((m, i) => ({ id: i, subject: m.subject, isLaunch: m.isLaunch })));
    return markets.map((m, i) => [m.poolId.toLowerCase(), { id: String(i), path: paths.get(i)! }] as [string, OurMarket]);
  }).then((entries) => new Map(entries));
}
