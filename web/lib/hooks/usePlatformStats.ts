"use client";

import { useQuery } from "@tanstack/react-query";
import { arcMainnet } from "@/lib/chains";
import { chain } from "@/lib/config";
import { fetchArcTotals, fetchPools } from "@/lib/index-client";
import { useCatalog } from "./useCatalog";
import { useMarkets } from "./useMarkets";

/**
 * Platform numbers for the home page. Counts come from the chain; swaps, liquidity and
 * volume come from the Arc v4 index, which only covers mainnet (`fromIndex` says whether
 * they're available). Network-wide Uniswap v4 totals on Arc come from the same index.
 */
export function usePlatformStats() {
  const { markets, total, isLoading } = useMarkets();
  const catalog = useCatalog();
  const onMainnet = chain.id === arcMainnet.id;
  const poolIds = markets.map((m) => m.poolId);

  const ours = useQuery({
    queryKey: ["our-pool-stats", poolIds],
    queryFn: () => fetchPools(poolIds),
    enabled: onMainnet && poolIds.length > 0,
    staleTime: 60_000,
  });
  const arc = useQuery({ queryKey: ["arc-v4-totals"], queryFn: fetchArcTotals, staleTime: 5 * 60_000 });

  const indexed = ours.data ?? [];
  const sum = (key: "txCount" | "volumeUSD" | "totalValueLockedUSD") =>
    indexed.reduce((acc, pool) => acc + Number(pool[key]), 0);
  const approved = catalog.blocks.filter((b) => b.status === "approved");

  return {
    isLoading: isLoading || catalog.isLoading,
    pools: Number(total),
    launches: markets.filter((m) => m.isLaunch).length,
    blocks: approved.length,
    communityBlocks: approved.filter((b) => !b.native).length,
    fromIndex: onMainnet && (ours.isSuccess || poolIds.length === 0),
    swaps: sum("txCount"),
    volumeUSD: sum("volumeUSD"),
    liquidityUSD: sum("totalValueLockedUSD"),
    arc: arc.data,
  };
}
