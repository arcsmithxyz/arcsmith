import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { arcMainnet } from "../chains";
import { ARC_V4, poolIdOf, rebuildPoolKey, stateViewAbi, v4QuoterAbi, type PoolKey } from "../uniswap";
import { cached } from "./cache";
import { serverClient } from "./chain";

/**
 * What a small trade really costs in a pool, hook included: a buy and a sell of about $5 are run
 * through Uniswap's Quoter and compared with the pool's current price. The Quoter runs the pool's
 * hook, so a tax, a dynamic fee or a refusal shows up here. It is a simulation for one anonymous
 * sender: a hook can treat other senders differently, so a real trade can differ.
 */

/** The dollar stablecoins pools are priced in on Arc (6 decimals each). */
const STABLES: Record<string, string> = {
  "0x3600000000000000000000000000000000000000": "USDC",
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1": "EURC",
};
/** The probe, in whole stablecoin units. Small enough that price impact is negligible in all but the thinnest pools. */
export const PROBE_UNITS = 5;
const STABLE_DECIMALS = 6;
const Q96 = 2 ** 96;
const TTL_SECONDS = 60;

export type TradeCost = { ok: true; cost: number } | { ok: false; reason: string };

export type PoolCost = {
  probe: { amount: number; currency: string };
  /** Pay the stablecoin, get the token. `cost` is the share of the trade's value lost against the pool's price (0.031 = 3.1%). */
  buy: TradeCost;
  /** Sell the token for the stablecoin. */
  sell: TradeCost;
  /** The pool's own LP fee right now, as a share (0.003 = 0.3%); the rest of a cost is the hook's or price impact. */
  poolFee: number;
};

type CostPool = { id: string; feeTier: string; tickSpacing: string; hooks: string; token0: { id: string }; token1: { id: string } };

/** Null when neither side of the pool is a dollar stablecoin (nothing to price the probe in) or the key can't be rebuilt. */
export function poolCost(pool: CostPool): Promise<PoolCost | null> {
  return cached(`pool-cost:${pool.id.toLowerCase()}`, TTL_SECONDS, () => measure(pool));
}

async function measure(pool: CostPool): Promise<PoolCost | null> {
  const stableIsToken0 = pool.token0.id.toLowerCase() in STABLES;
  const stableIsToken1 = pool.token1.id.toLowerCase() in STABLES;
  if (!stableIsToken0 && !stableIsToken1) return null;
  const key = rebuildPoolKey(pool);
  if (!key) return null;

  const client = serverClient(arcMainnet);
  const slot0 = await client.readContract({ address: ARC_V4.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolIdOf(key)] });
  // Raw price: currency1 units per currency0 unit.
  const price = (Number(slot0[0]) / Q96) ** 2;
  if (!(price > 0) || !Number.isFinite(price)) return null;

  const probe = BigInt(PROBE_UNITS * 10 ** STABLE_DECIMALS);
  // Buying pays the stablecoin, so it swaps from the stablecoin's side; selling swaps from the token's.
  const buyZeroForOne = stableIsToken0;
  const tokenProbe = BigInt(Math.max(1, Math.round(stableIsToken0 ? Number(probe) * price : Number(probe) / price)));

  const [buy, sell] = await Promise.all([
    tradeCost(client, key, buyZeroForOne, probe, price),
    tradeCost(client, key, !buyZeroForOne, tokenProbe, price),
  ]);
  const currency = STABLES[(stableIsToken0 ? pool.token0.id : pool.token1.id).toLowerCase()];
  return { probe: { amount: PROBE_UNITS, currency }, buy, sell, poolFee: Number(slot0[3]) / 1_000_000 };
}

async function tradeCost(
  client: ReturnType<typeof serverClient>,
  key: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
  price: number,
): Promise<TradeCost> {
  try {
    const { result } = await client.simulateContract({
      address: ARC_V4.quoter as Address,
      abi: v4QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
    });
    const spotOut = zeroForOne ? Number(amountIn) * price : Number(amountIn) / price;
    // Rounding on tiny amounts can push this a hair below zero.
    return { ok: true, cost: Math.max(0, 1 - Number(result[0]) / spotOut) };
  } catch (error) {
    const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    // A revert is an answer ("this trade would fail"); anything else is the network's trouble.
    if (!(reverted instanceof ContractFunctionRevertedError)) throw error;
    return { ok: false, reason: reverted.data?.errorName ?? reverted.reason ?? "the pool reverted" };
  }
}

/** How many of a token's hooked pools get a cost on its page, most liquid first. */
const PAGE_POOLS = 8;
/** A page shouldn't wait longer than this for the simulations; pools that miss it just show no cost. */
const PAGE_WAIT_MS = 5_000;

/** Costs for a token's hooked pools, keyed by pool id. A pool whose simulation fails or is late is left out. */
export async function poolCostsWithin(pools: (CostPool & { hooks: string })[], zero: string) {
  const costs: Record<string, PoolCost> = {};
  const hooked = pools.filter((p) => p.hooks !== zero).slice(0, PAGE_POOLS);
  const work = Promise.all(
    hooked.map(async (pool) => {
      const cost = await poolCost(pool).catch(() => null);
      if (cost) costs[pool.id] = cost;
    }),
  );
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, PAGE_WAIT_MS))]);
  return { ...costs };
}
