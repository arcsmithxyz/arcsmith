"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import { Badge, Skeleton } from "@/components/ui";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { arcMainnet } from "@/lib/chains";
import { chain, deployment, explorerAddressUrl, USDC_DECIMALS } from "@/lib/config";
import { formatBps, formatUsd, shortAddress } from "@/lib/format";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fetchPools } from "@/lib/index-client";

type AuthorRow = {
  author: Address;
  blocks: { address: Address; name: string; royaltyBps: number; native: boolean }[];
  pools: number;
  /** Royalties from launch fees so far, in USD; an estimate from the index's pool fees. */
  earnedUSD: number;
  unclaimedUSDC: number;
};

/**
 * Who builds the blocks, and what they've earned. A launch pays each of its blocks' authors a
 * frozen share of the protocol's cut of its fees; open markets pay LPs instead, so they don't
 * count here.
 */
export function AuthorLeaderboard() {
  const catalog = useCatalog();
  const { markets, isLoading } = useMarkets({ all: true });
  const indexed = chain.id === arcMainnet.id;
  const launches = markets.filter((m) => m.isLaunch);

  const rates = useReadContracts({
    contracts: launches.map((m) => ({ address: deployment?.launchpad, abi: launchpadAbi, functionName: "royaltiesOf", args: [m.id] }) as const),
    query: { enabled: launches.length > 0, staleTime: 5 * 60_000 },
  });
  const poolStats = useQuery({
    queryKey: ["author-pools", launches.map((m) => m.poolId).join(",")],
    queryFn: () => fetchPools(launches.map((m) => m.poolId)),
    enabled: indexed && launches.length > 0,
    staleTime: 60_000,
  });

  const authors = [...new Set(catalog.blocks.map((b) => b.author.toLowerCase()))] as Address[];
  const unclaimed = useReadContracts({
    contracts: authors.map((a) => ({ address: deployment?.launchpad, abi: launchpadAbi, functionName: "claimable", args: [a, deployment?.usdc ?? "0x"] }) as const),
    query: { enabled: Boolean(deployment) && authors.length > 0, refetchInterval: 30_000 },
  });

  if (catalog.isLoading || isLoading) return <Skeleton className="h-[260px]" />;

  const feesByPool = new Map((poolStats.data ?? []).map((p) => [p.id.toLowerCase(), Number(p.feesUSD)]));
  const rows = new Map<string, AuthorRow>();
  for (const block of catalog.blocks) {
    if (block.status !== "approved") continue;
    const key = block.author.toLowerCase();
    const row = rows.get(key) ?? { author: block.author, blocks: [], pools: 0, earnedUSD: 0, unclaimedUSDC: 0 };
    row.blocks.push({ address: block.address, name: block.metadata?.name ?? shortAddress(block.address), royaltyBps: block.royaltyBps, native: block.native });
    rows.set(key, row);
  }
  // Pools that use at least one of the author's blocks.
  for (const market of markets) {
    const authorsInPool = new Set(market.blocks.map((b) => catalog.byAddress.get(b.toLowerCase())?.author.toLowerCase()).filter(Boolean));
    for (const author of authorsInPool) {
      const row = rows.get(author!);
      if (row) row.pools += 1;
    }
  }
  // Each launch: fees × protocol share × each block's frozen royalty rate.
  launches.forEach((market, i) => {
    const frozen = rates.data?.[i]?.result as readonly number[] | undefined;
    const fees = feesByPool.get(market.poolId.toLowerCase()) ?? 0;
    if (!frozen || fees === 0) return;
    const protocolCut = (fees * market.protocolShareBps) / 10_000;
    market.blocks.forEach((block, j) => {
      const author = catalog.byAddress.get(block.toLowerCase())?.author.toLowerCase();
      const row = author ? rows.get(author) : undefined;
      if (row) row.earnedUSD += (protocolCut * (frozen[j] ?? 0)) / 10_000;
    });
  });
  authors.forEach((author, i) => {
    const row = rows.get(author);
    const amount = unclaimed.data?.[i]?.result as bigint | undefined;
    if (row && amount) row.unclaimedUSDC = Number(formatUnits(amount, USDC_DECIMALS));
  });

  const ranked = [...rows.values()].sort((a, b) => b.earnedUSD - a.earnedUSD || b.pools - a.pools);
  if (ranked.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-[28px] border border-line bg-panel">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs text-subtle">
          <tr className="border-b border-line">
            <th scope="col" className="px-6 py-3 font-medium">
              Author
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Blocks
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Pools using them
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Earned so far
            </th>
            <th scope="col" className="px-6 py-3 text-right font-medium">
              Waiting to be claimed
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {ranked.map((row, i) => {
            const native = row.blocks.every((b) => b.native);
            const explorer = explorerAddressUrl(row.author);
            return (
              <tr key={row.author} className="border-b border-line/60 last:border-0">
                <td className="px-6 py-3">
                  <span className="mr-3 inline-block w-5 text-subtle">{i + 1}</span>
                  {explorer ? (
                    <a href={explorer} target="_blank" rel="noreferrer" className="font-mono text-ink underline-offset-4 hover:underline">
                      {shortAddress(row.author)}
                    </a>
                  ) : (
                    <span className="font-mono text-ink">{shortAddress(row.author)}</span>
                  )}
                  {native && (
                    <span className="ml-2">
                      <Badge>Native blocks</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ul className="flex flex-wrap gap-1.5">
                    {row.blocks.map((b) => (
                      <li key={b.address}>
                        <Link href={`/blocks/${b.address}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink hover:bg-surface">
                          {b.name}
                          {b.royaltyBps > 0 && <span className="text-muted"> · {formatBps(b.royaltyBps)}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-3 text-right">{row.pools}</td>
                <td className="px-3 py-3 text-right">{indexed ? formatUsd(row.earnedUSD) : "Mainnet only"}</td>
                <td className="px-6 py-3 text-right">{formatUsd(row.unclaimedUSDC)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-6 py-3 text-xs text-muted">
        Royalty rates are a share of the protocol&apos;s cut of each launch&apos;s fees, frozen when the pool opened. &ldquo;Earned so far&rdquo;
        is estimated from each pool&apos;s lifetime fees in the Arc index; &ldquo;Waiting to be claimed&rdquo; is exact, in USDC.
      </p>
    </div>
  );
}
