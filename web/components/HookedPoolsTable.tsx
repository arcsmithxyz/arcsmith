"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { arcMainnet } from "@/lib/chains";
import { chain, deployment } from "@/lib/config";
import { formatFee, formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { fetchHookedPools } from "@/lib/index-client";
import type { HookedPoolOrder } from "@/lib/subgraph";
import { Badge, EmptyState, Skeleton, Tabs } from "./ui";

const ORDERS: { value: HookedPoolOrder; label: string }[] = [
  { value: "totalValueLockedUSD", label: "Liquidity" },
  { value: "txCount", label: "Swaps" },
  { value: "volumeUSD", label: "Volume" },
];

// Pools created with the dynamic-fee flag; the index usually records the last swap's fee instead.
const DYNAMIC_FEE = 0x800000;

/**
 * The busiest Uniswap v4 pools on Arc mainnet that use any hook, from the community index.
 * Volume there is priced from pool ratios and can be wildly inflated for thin tokens, so
 * liquidity is the default sort and pools with big volume but no liquidity are flagged.
 */
export function HookedPoolsTable() {
  const [order, setOrder] = useState<HookedPoolOrder>("totalValueLockedUSD");
  const now = useNow();
  const pools = useQuery({ queryKey: ["hooked-pools", order], queryFn: () => fetchHookedPools(order), staleTime: 60_000 });
  const ourKernel = chain.id === arcMainnet.id ? deployment?.kernel.toLowerCase() : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl font-serif text-muted">
          Every hooked v4 pool on Arc mainnet, not only Arcsmith&apos;s. Liquidity and swap counts are the reliable
          signals; volume can be inflated for thinly traded tokens.
        </p>
        <Tabs value={order} options={ORDERS} onChange={setOrder} label="Sort pools" />
      </div>
      {pools.isLoading ? (
        <Skeleton className="h-[520px]" />
      ) : pools.error ? (
        <EmptyState title="Couldn't reach the index" body="The Arc v4 index didn't answer. Try again in a minute." />
      ) : !pools.data?.length ? (
        <EmptyState title="No hooked pools yet" body="Nothing indexed on Arc mainnet so far." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th className="px-5 py-3 font-normal">Pool</th>
                <th className="px-5 py-3 font-normal">Hook</th>
                <th className="px-5 py-3 font-normal" title="Fee paid by the most recent swap, as recorded by the index. Hooks can also charge in other ways.">Last fee</th>
                <th className="px-5 py-3 text-right font-normal">Liquidity</th>
                <th className="px-5 py-3 text-right font-normal">Swaps</th>
                <th className="px-5 py-3 text-right font-normal">Volume</th>
                <th className="px-5 py-3 text-right font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {pools.data.map((p) => {
                const liquidity = Number(p.totalValueLockedUSD);
                const volume = Number(p.volumeUSD);
                // Big reported volume with next to nothing left in the pool: wash trading or drained.
                const drained = liquidity < 100 && volume > 100_000;
                const ours = ourKernel && p.hooks === ourKernel;
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                    <td className="px-5 py-3">
                      <span className="font-medium">
                        {p.token0.symbol} / {p.token1.symbol}
                      </span>
                      <span className="ml-2 font-mono text-xs text-subtle">{shortAddress(p.id)}</span>
                      {drained && (
                        <span className="ml-2">
                          <Badge tone="bad">No liquidity left</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/hooks/${p.hooks}`} className="font-mono text-xs hover:underline">
                        {shortAddress(p.hooks)}
                      </Link>
                      {ours && (
                        <span className="ml-2">
                          <Badge tone="good">Arcsmith</Badge>
                        </span>
                      )}
                    </td>
                    <td className="tabular px-5 py-3">{Number(p.feeTier) === DYNAMIC_FEE ? "Dynamic" : formatFee(Number(p.feeTier))}</td>
                    <td className="tabular px-5 py-3 text-right">{formatUsd(liquidity)}</td>
                    <td className="tabular px-5 py-3 text-right">{Number(p.txCount).toLocaleString("en-US")}</td>
                    <td className={`tabular px-5 py-3 text-right ${drained ? "text-subtle line-through" : ""}`}>{formatUsd(volume)}</td>
                    <td className="px-5 py-3 text-right text-muted">{now > 0 ? timeAgo(Number(p.createdAtTimestamp), now) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
