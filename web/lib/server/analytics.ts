import { blockCatalogAbi } from "../abi/BlockCatalog";
import { launchpadAbi } from "../abi/Launchpad";
import { arcMainnet } from "../chains";
import { deployments } from "../deployments";
import { READ_ENDPOINTS } from "../rpc";
import {
  fetchArcDaily,
  fetchArcTotals,
  fetchPlainPoolTotals,
  fetchTopHooks,
  type ArcDay,
  type IndexMeta,
} from "../subgraph";
import { cached } from "./cache";
import { probeEndpoint, serverClient } from "./chain";
import { kernelPools } from "./kernel-pools";

export type AnalyticsHook = {
  id: string;
  pools: number;
  transactions: number;
  volumeUSD: number;
  feesUSD: number;
  liquidityUSD: number;
  isArcsmith: boolean;
};

export type SourceHealth = { name: string; detail: string; ok: boolean; latencyMs: number | null };

export type ArcsmithAnalytics = {
  markets: number;
  launches: number;
  blocks: number;
  pools: number;
  transactions: number;
  volumeUSD: number;
  feesUSD: number;
  liquidityUSD: number;
  /** Running count of Arcsmith pools at the end of each day a pool was opened. */
  poolsOverTime: { date: number; pools: number }[];
};

export type Analytics = {
  generatedAt: number;
  index: IndexMeta;
  /** Highest block any public RPC reported, to measure how far the index trails. */
  chainHead: number | null;
  totals: {
    pools: number;
    hookedPools: number;
    transactions: number;
    volumeUSD: number;
    feesUSD: number;
    liquidityUSD: number;
    hooks: number;
    hooksCapped: boolean;
  };
  /**
   * Shares of all-time volume and current liquidity that sit in pools with a hook. Volume from
   * the hooks left out of the ranking (see `suspicious`) is taken out of both sides first.
   */
  hookedShare: { volume: number; liquidity: number };
  daily: ArcDay[];
  topHooks: AnalyticsHook[];
  /** Hooks left out of the ranking: huge volume with almost no liquidity behind it. */
  hiddenHooks: number;
  arcsmith: ArcsmithAnalytics | null;
  sources: SourceHealth[];
};

/**
 * Big volume with almost no liquidity behind it is wash trading or a mispriced token, not real
 * use; such hooks would top a volume ranking, so they are counted but not ranked.
 */
function suspicious(hook: AnalyticsHook) {
  return hook.liquidityUSD < WASH_MAX_LIQUIDITY_USD && hook.volumeUSD > WASH_MIN_VOLUME_USD;
}

/** The rule above, exported so the public rankings API can state it. */
export const WASH_MAX_LIQUIDITY_USD = 100;
export const WASH_MIN_VOLUME_USD = 100_000;
/** How many of the highest-volume hooks are scanned to build the ranking and count the left-out ones. */
export const RANKING_SCAN = 300;

// Analytics always describe Arc mainnet: the index only covers mainnet.
const mainnet = deployments[arcMainnet.id];
const TTL_SECONDS = 15 * 60;

/** Everything the analytics page shows, cached for fifteen minutes (it costs several index queries). */
export function getAnalytics(): Promise<Analytics> {
  return cached("analytics:v1", TTL_SECONDS, loadAnalytics, { keep: true });
}

async function loadAnalytics(): Promise<Analytics> {
  const indexStarted = Date.now();
  // The index is the backbone: if it's down there's nothing to show, so these may throw.
  const [daily, totals, plain, topHooks] = await Promise.all([
    fetchArcDaily(),
    fetchArcTotals(),
    fetchPlainPoolTotals(),
    // Many of the highest-volume hooks are wash trading (see `suspicious`), so scan deep enough
    // to fill the ranking with real ones and to size the wash volume.
    fetchTopHooks("volumeUSD", RANKING_SCAN),
  ]);
  const indexLatency = Date.now() - indexStarted;

  // The rest degrades: a failing RPC or Arcsmith read leaves its part empty.
  const [probes, arcsmith] = await Promise.all([
    Promise.all((READ_ENDPOINTS[arcMainnet.id] ?? []).map(async (url) => ({ url, ...(await probeEndpoint(url)) }))),
    loadArcsmith().catch(() => null),
  ]);
  const heads = probes.map((p) => p.block ?? 0).filter((b) => b > 0);
  const chainHead = heads.length > 0 ? Math.max(...heads) : null;

  const ranked: AnalyticsHook[] = topHooks.map((h) => ({
    id: h.id,
    pools: Number(h.poolCount),
    transactions: Number(h.txCount),
    volumeUSD: Number(h.volumeUSD),
    feesUSD: Number(h.feesUSD),
    liquidityUSD: Number(h.totalValueLockedUSD),
    isArcsmith: h.id.toLowerCase() === mainnet?.kernel.toLowerCase(),
  }));
  const plainVolume = Number(plain?.volumeUSD ?? 0);
  const plainLiquidity = Number(plain?.totalValueLockedUSD ?? 0);
  const washVolume = ranked.filter(suspicious).reduce((sum, h) => sum + h.volumeUSD, 0);
  const cleanVolume = totals.volumeUSD - washVolume;

  return {
    generatedAt: Date.now(),
    index: daily.meta,
    chainHead,
    totals: {
      pools: totals.pools,
      hookedPools: Math.max(0, totals.pools - Number(plain?.poolCount ?? 0)),
      transactions: totals.swaps,
      volumeUSD: totals.volumeUSD,
      feesUSD: daily.days.reduce((sum, d) => sum + d.feesUSD, 0),
      liquidityUSD: totals.liquidityUSD,
      hooks: totals.hooks,
      hooksCapped: totals.hooksCapped,
    },
    hookedShare: {
      volume: cleanVolume > 0 ? 1 - plainVolume / cleanVolume : 0,
      liquidity: totals.liquidityUSD > 0 ? 1 - plainLiquidity / totals.liquidityUSD : 0,
    },
    daily: daily.days,
    topHooks: ranked.filter((h) => !suspicious(h)).slice(0, 30),
    hiddenHooks: ranked.filter(suspicious).length,
    arcsmith,
    sources: [
      {
        name: "Arc v4 index",
        detail: daily.meta.hasIndexingErrors ? "Indexing errors reported" : `Block ${daily.meta.block.toLocaleString("en-US")}`,
        ok: !daily.meta.hasIndexingErrors,
        latencyMs: indexLatency,
      },
      ...probes.map((p) => ({
        name: new URL(p.url).hostname,
        detail: p.block ? `Block ${p.block.toLocaleString("en-US")}` : "No answer",
        ok: p.ok,
        latencyMs: p.ok ? p.latencyMs : null,
      })),
    ],
  };
}

/** Arcsmith's own numbers: market counts from the chain, activity from the index. */
async function loadArcsmith(): Promise<ArcsmithAnalytics | null> {
  if (!mainnet) return null;
  const client = serverClient(arcMainnet);
  const [count, blocks, pools] = await Promise.all([
    client.readContract({ address: mainnet.launchpad, abi: launchpadAbi, functionName: "marketCount" }),
    client.readContract({ address: mainnet.catalog, abi: blockCatalogAbi, functionName: "blockCount" }),
    kernelPools(mainnet.kernel),
  ]);
  const markets = count > 0n ? await client.readContract({ address: mainnet.launchpad, abi: launchpadAbi, functionName: "getMarkets", args: [0n, count] }) : [];

  // Cumulative pool count, one point per day that saw a new pool.
  const poolsOverTime: { date: number; pools: number }[] = [];
  pools.forEach((pool, i) => {
    const date = Math.floor(Number(pool.createdAtTimestamp) / 86_400) * 86_400;
    const last = poolsOverTime.at(-1);
    if (last?.date === date) last.pools = i + 1;
    else poolsOverTime.push({ date, pools: i + 1 });
  });

  return {
    markets: Number(count),
    launches: markets.filter((m) => m.isLaunch).length,
    blocks: Number(blocks),
    pools: pools.length,
    transactions: pools.reduce((sum, p) => sum + Number(p.txCount), 0),
    volumeUSD: pools.reduce((sum, p) => sum + Number(p.volumeUSD), 0),
    feesUSD: pools.reduce((sum, p) => sum + Number(p.feesUSD), 0),
    liquidityUSD: pools.reduce((sum, p) => sum + Number(p.totalValueLockedUSD), 0),
    poolsOverTime,
  };
}
