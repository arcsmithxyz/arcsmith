import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAddress, type Address } from "viem";
import { arcMainnet } from "../chains";
import { SITE_URL } from "../config";
import { deployments } from "../deployments";
import { abilityKeysOf, CHECK_ABOUT, describeHook, THIN_LIQUIDITY_USD } from "../hook-check";
import { hookReach } from "../permissions";
import { ZERO } from "../subgraph";
import { getAnalytics, RANKING_SCAN, WASH_MAX_LIQUIDITY_USD, WASH_MIN_VOLUME_USD } from "./analytics";
import { cached } from "./cache";
import { serverClient } from "./chain";
import { hookSource } from "./hook-labels";
import { poolCostsWithin } from "./pool-cost";
import { tokenIdentity } from "./token-identity";
import { tokenPools } from "./hook-reader";

/**
 * The data behind the public hook check API (`/api/v1`). Capabilities only: what a hook's
 * address allows it to do, never a verdict on whether it is safe.
 */

const EXPLORER = arcMainnet.blockExplorers.default.url;
/** The source lookup asks a shared public database that takes ~6 s the first time; past this we answer without it. */
const SOURCE_WAIT_MS = 9_000;

/**
 * One hook. Needs no index: the abilities are decoded from the address, and the contract and
 * source checks degrade to `null` when their upstream is down, so this keeps answering.
 */
export async function checkHook(address: Address) {
  const [contract, source] = await Promise.all([readContract(address), sourceWithin(address)]);
  const mainnet = deployments[arcMainnet.id];
  return {
    address,
    chainId: arcMainnet.id,
    ...describeHook(address),
    /** Whether there is code at this address on Arc, and how big; null when the RPC didn't answer. */
    contract,
    /**
     * Whether the source is published (Arc Explorer's shared database), and under what name.
     * Null means "not known yet": the first lookup of a hook can take several seconds, so ask again.
     */
    source,
    arcsmithKernel: Boolean(mainnet && mainnet.kernel.toLowerCase() === address.toLowerCase()),
    links: {
      reader: `${SITE_URL}/hooks/${address}`,
      explorer: `${EXPLORER}/address/${address}`,
      badge: `${SITE_URL}/api/v1/hooks/${address}/badge.svg`,
    },
    about: CHECK_ABOUT,
  };
}

function readContract(address: Address) {
  return cached(`hook-code:${address.toLowerCase()}`, 600, async () => {
    const code = await serverClient(arcMainnet).getCode({ address });
    const size = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    return { hasCode: size > 0, codeSize: size };
  }).catch(() => null);
}

/**
 * The source status, or null if the shared database takes longer than `waitMs`. The lookup
 * is then left to finish in the background (`waitUntil`) and fills the cache, so asking again a
 * few seconds later gets the answer.
 */
export function sourceWithin(address: Address, waitMs = SOURCE_WAIT_MS) {
  const lookup = hookSource(address);
  const giveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([lookup, giveUp]).then((source) => {
    if (source === null) {
      try {
        getCloudflareContext().ctx.waitUntil(lookup);
      } catch {
        // Outside Cloudflare (next dev) the process keeps running anyway.
      }
    }
    return source;
  });
}

/**
 * Every Uniswap v4 pool a token trades in on Arc, with the hook each one runs. Null when the
 * index doesn't know the address as a token; throws when the index is down.
 */
export async function checkToken(address: Address, withCost = false) {
  const data = await tokenPools(address);
  if (!data.token) return null;
  // Opt-in: each hooked pool costs a few RPC calls to simulate (see lib/server/pool-cost.ts).
  const costs = withCost ? await poolCostsWithin(data.pools, ZERO) : {};
  const identity = await tokenIdentity({ address, symbol: data.token.symbol, name: data.token.name });

  const pools = data.pools.map((pool) => {
    const hook = pool.hooks === ZERO ? null : getAddress(pool.hooks);
    const other = pool.token0.id.toLowerCase() === address.toLowerCase() ? pool.token1 : pool.token0;
    const liquidityUsd = Number(pool.totalValueLockedUSD);
    return {
      id: pool.id,
      pairedWith: { address: getAddress(other.id), symbol: other.symbol },
      /** In millionths; dynamic-fee pools report 8388608. */
      feeTier: Number(pool.feeTier),
      liquidityUsd,
      volumeUsd: Number(pool.volumeUSD),
      swaps: Number(pool.txCount),
      /** Under THIN_LIQUIDITY_USD of liquidity (lib/hook-check.ts): too thin to say much about its price. */
      thin: liquidityUsd < THIN_LIQUIDITY_USD,
      createdAt: new Date(Number(pool.createdAtTimestamp) * 1000).toISOString(),
      hook: hook && {
        address: hook,
        reach: hookReach(hook),
        /** Keys of the abilities this hook has; the questions and answers are at `check`. */
        canDo: abilityKeysOf(hook),
        check: `${SITE_URL}/api/v1/hooks/${hook}`,
      },
      /** With `?cost=true`: a simulated ~$5 buy and sell, hook included (see /api/v1/pools/{id}/cost). Absent when not simulated. */
      ...(costs[pool.id] ? { cost: costs[pool.id] } : {}),
    };
  });
  const hooks = new Set(pools.flatMap((p) => (p.hook ? [p.hook.address] : [])));

  return {
    address,
    chainId: arcMainnet.id,
    token: { symbol: data.token.symbol, name: data.token.name, decimals: Number(data.token.decimals) },
    /**
     * Only for the few tokens Arc's docs list (USDC, EURC, USYC, cirBTC, WETH): `canonical` for the real one, `lookalike` for another
     * token with its symbol or name (then `realAddress` is the real one). Absent for every other token: we say nothing about who made it.
     */
    ...(identity
      ? {
          identity: {
            status: identity.status,
            realSymbol: identity.token.symbol,
            realAddress: identity.token.address,
            ...(identity.status === "lookalike" ? { matchedBy: identity.reason, tokensWithThisSymbol: identity.sameSymbolCount } : {}),
            source: "https://docs.arc.io/arc/references/contract-addresses",
          },
        }
      : {}),
    poolCount: pools.length,
    hookedPoolCount: pools.filter((p) => p.hook).length,
    hookCount: hooks.size,
    /** True when the token is in more pools than are listed; these are then the most liquid. */
    capped: data.capped,
    indexedAt: new Date(data.indexedAt * 1000).toISOString(),
    pools,
    links: { reader: `${SITE_URL}/hooks/${address}` },
    about: CHECK_ABOUT,
  };
}

/** The busiest hooks on Arc by volume, with the ones that have big volume but almost no liquidity left out. */
export async function checkRankings() {
  const analytics = await getAnalytics();
  return {
    chainId: arcMainnet.id,
    generatedAt: new Date(analytics.generatedAt).toISOString(),
    index: { block: analytics.index.block, timestamp: new Date(analytics.index.timestamp * 1000).toISOString() },
    method: {
      scanned: RANKING_SCAN,
      leftOut: analytics.hiddenHooks,
      rule: `Of the ${RANKING_SCAN} highest-volume hooks, those with under $${WASH_MAX_LIQUIDITY_USD} of liquidity and over $${WASH_MIN_VOLUME_USD.toLocaleString("en-US")} of volume are left out: that is wash trading or a mispriced token, not use.`,
      volumeNote: "Volume is priced from pool ratios and can be inflated for thinly traded tokens; liquidity and swap counts are more reliable.",
    },
    totals: analytics.totals,
    hooks: analytics.topHooks.map((hook, i) => {
      const address = getAddress(hook.id);
      return {
        rank: i + 1,
        address,
        pools: hook.pools,
        swaps: hook.transactions,
        volumeUsd: hook.volumeUSD,
        feesUsd: hook.feesUSD,
        liquidityUsd: hook.liquidityUSD,
        arcsmithKernel: hook.isArcsmith,
        reach: hookReach(address),
        check: `${SITE_URL}/api/v1/hooks/${address}`,
      };
    }),
    about: CHECK_ABOUT,
  };
}
