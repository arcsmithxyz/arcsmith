"use client";

import { shortAddress } from "@/lib/format";
import { useHookSource } from "@/lib/hooks/useHookSource";

/** A hook's published contract name when it has one, otherwise its short address. */
export function HookName({ address }: { address: string }) {
  const source = useHookSource(address);
  if (source?.published) {
    return (
      <span title={address}>
        <span className="font-medium">{source.name}</span>
        <span className="ml-1.5 font-mono text-xs text-subtle">{shortAddress(address)}</span>
      </span>
    );
  }
  return (
    <span className="font-mono text-xs">
      {shortAddress(address)}
      {source && !source.published && <span className="ml-1.5 font-sans text-subtle">source not published</span>}
    </span>
  );
}
