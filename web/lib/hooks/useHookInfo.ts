"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { createPublicClient, type Address } from "viem";
import { arcMainnet } from "@/lib/chains";
import { chain } from "@/lib/config";
import { appTransport } from "@/lib/rpc";
import { fetchHook } from "@/lib/index-client";

// The Hook Reader describes Arc mainnet, whichever network the app trades on (direct with
// the same-origin relay as fallback, see lib/rpc.ts).
const mainnet = createPublicClient({ chain: arcMainnet, transport: appTransport(arcMainnet) });

/**
 * Bytecode and index stats for any address on Arc mainnet, for the Hook Reader.
 * `onAppChain` reads the bytecode from the app's own network instead — used for this
 * platform's kernel before it exists on mainnet. Index stats are always mainnet.
 */
export function useHookInfo(address: Address | undefined, onAppChain = false) {
  const appClient = usePublicClient({ chainId: chain.id });
  const client = onAppChain && appClient ? appClient : mainnet;
  const code = useQuery({
    queryKey: ["hook-code", onAppChain ? chain.id : arcMainnet.id, address],
    queryFn: () => client.getCode({ address: address! }),
    enabled: Boolean(address),
    staleTime: 5 * 60_000,
  });
  const stats = useQuery({
    queryKey: ["hook-stats", address],
    queryFn: () => fetchHook(address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });

  const bytecode = code.data;
  return {
    hasCode: bytecode !== undefined && bytecode !== "0x",
    codeSize: bytecode ? (bytecode.length - 2) / 2 : 0,
    codeLoading: code.isLoading,
    codeError: code.error,
    stats: stats.data,
    statsLoading: stats.isLoading,
    statsError: stats.error,
  };
}
