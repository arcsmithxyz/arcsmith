"use client";

import { useQuery } from "@tanstack/react-query";
import { knownHook, type HookSource } from "@/lib/known-hooks";

/**
 * Whether a hook's source code is published, and under what contract name: instantly for the
 * hand-checked hooks, otherwise from /api/hook-source once the page is up. Undefined while
 * loading; null when it couldn't be checked.
 */
export function useHookSource(address: string) {
  const known = knownHook(address);
  const query = useQuery({
    queryKey: ["hook-source", address.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`/api/hook-source/${address}`);
      if (!res.ok) return null;
      return ((await res.json()) as { source: HookSource | null }).source;
    },
    enabled: !known,
    staleTime: 60 * 60_000,
  });
  return known ? ({ published: true, ...known } as HookSource) : query.data;
}
