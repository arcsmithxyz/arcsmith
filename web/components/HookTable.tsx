"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deployment } from "@/lib/config";
import { formatUsd, shortAddress } from "@/lib/format";
import { knownHook } from "@/lib/known-hooks";
import { abilitiesOf } from "@/lib/permissions";
import { fetchTopHooks } from "@/lib/index-client";
import { Badge, EmptyState, Skeleton, Tabs } from "./ui";

type Order = "poolCount" | "volumeUSD" | "totalValueLockedUSD";

const ORDERS: { value: Order; label: string }[] = [
  { value: "poolCount", label: "Most pools" },
  { value: "volumeUSD", label: "Volume" },
  { value: "totalValueLockedUSD", label: "Liquidity" },
];

/** Every Uniswap v4 hook on Arc mainnet with pools, from the community subgraph. */
export function HookTable() {
  const [order, setOrder] = useState<Order>("poolCount");
  const hooks = useQuery({ queryKey: ["top-hooks", order], queryFn: () => fetchTopHooks(order), staleTime: 60_000 });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">All v4 hooks on Arc mainnet, not only this platform&apos;s.</p>
        <Tabs value={order} options={ORDERS} onChange={setOrder} label="Sort hooks" />
      </div>
      {hooks.isLoading ? (
        <Skeleton className="h-[420px]" />
      ) : hooks.error ? (
        <EmptyState title="Couldn't reach the index" body="The Arc v4 subgraph didn't answer. Try again in a minute." />
      ) : !hooks.data?.length ? (
        <EmptyState title="No hooks yet" body="Nothing indexed on Arc mainnet so far." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th className="px-5 py-3 font-normal">Hook</th>
                <th className="px-5 py-3 font-normal">Can do</th>
                <th className="px-5 py-3 text-right font-normal">Pools</th>
                <th className="px-5 py-3 text-right font-normal">Volume</th>
                <th className="px-5 py-3 text-right font-normal">Liquidity</th>
              </tr>
            </thead>
            <tbody>
              {hooks.data.map((h) => {
                const can = abilitiesOf(h.id).filter((a) => a.can);
                const ours = deployment && h.id === deployment.kernel.toLowerCase();
                const known = knownHook(h.id);
                return (
                  <tr key={h.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                    <td className="px-5 py-3">
                      <Link href={`/hooks/${h.id}`} className="hover:underline">
                        {known ? <span className="font-medium">{known.name}</span> : <span className="font-mono text-xs">{shortAddress(h.id)}</span>}
                      </Link>
                      {ours && <span className="ml-2 text-xs text-muted">(this platform)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        {can.map((a) => (
                          <Badge key={a.key} tone={a.severity === "bad" ? "bad" : "warn"}>
                            {a.badge}
                          </Badge>
                        ))}
                        {can.length === 0 && <Badge>Can&apos;t touch trades or liquidity</Badge>}
                      </span>
                    </td>
                    <td className="tabular px-5 py-3 text-right">{h.poolCount}</td>
                    <td className="tabular px-5 py-3 text-right">{formatUsd(Number(h.volumeUSD))}</td>
                    <td className="tabular px-5 py-3 text-right">{formatUsd(Number(h.totalValueLockedUSD))}</td>
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
