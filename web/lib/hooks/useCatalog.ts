"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address, ContractFunctionReturnType } from "viem";
import { blockCatalogAbi } from "@/lib/abi/BlockCatalog";
import { deployment } from "@/lib/config";
import { BLOCK_STATUSES, blockKind, isNative, parseMetadata, type CatalogBlock } from "@/lib/blocks";

type EntryResult = ContractFunctionReturnType<typeof blockCatalogAbi, "view", "entryOf">;

/** Every block ever submitted to the catalog, with parsed metadata. Small by nature. */
export function useCatalog() {
  const catalog = deployment?.catalog;
  const count = useReadContract({
    address: catalog,
    abi: blockCatalogAbi,
    functionName: "blockCount",
    query: { enabled: Boolean(catalog), refetchInterval: 30_000 },
  });
  const total = count.data ?? 0n;
  const list = useReadContract({
    address: catalog,
    abi: blockCatalogAbi,
    functionName: "getBlocks",
    args: [0n, total],
    query: { enabled: Boolean(catalog) && total > 0n, refetchInterval: 30_000 },
  });
  const addresses = (list.data ?? []) as readonly Address[];
  const entries = useReadContracts({
    contracts: addresses.map((a) => ({ address: catalog, abi: blockCatalogAbi, functionName: "entryOf", args: [a] }) as const),
    query: { enabled: addresses.length > 0, refetchInterval: 30_000 },
  });

  const blocks: CatalogBlock[] = addresses.flatMap((address, i) => {
    const entry = entries.data?.[i]?.result as EntryResult | undefined;
    if (!entry) return [];
    return [
      {
        address,
        author: entry.author,
        codehash: entry.codehash,
        status: BLOCK_STATUSES[entry.status] ?? "none",
        royaltyBps: entry.royaltyBps,
        submittedAt: Number(entry.submittedAt),
        metadataURI: entry.metadataURI,
        metadata: parseMetadata(entry.metadataURI),
        native: isNative(address),
        kind: blockKind(address),
      },
    ];
  });

  return {
    blocks,
    byAddress: new Map(blocks.map((b) => [b.address.toLowerCase(), b])),
    isLoading: count.isLoading || list.isLoading || entries.isLoading,
    refetch: () => Promise.all([count.refetch(), list.refetch(), entries.refetch()]),
  };
}
