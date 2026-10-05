"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { arcMainnet } from "@/lib/chains";
import { chain, deployment, explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import { formatAmount, formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import type { FeedItem, FeedScope } from "@/lib/server/feed";
import { Badge, Skeleton, Tabs } from "./ui";

const SCOPES: { value: FeedScope; label: string }[] = [
  { value: "hooked", label: "All hooked pools" },
  { value: "arcsmith", label: "Arcsmith pools" },
];

/**
 * Recent trades and new pools on Arc mainnet, from the index through /api/feed, which refreshes
 * every five minutes (the index allows 3,000 queries a day). Only shown on mainnet builds, where its links
 * point at the right pools.
 */
export function ActivityFeed({ limit = 12, defaultScope = "hooked" }: { limit?: number; defaultScope?: FeedScope }) {
  const [scope, setScope] = useState<FeedScope>(defaultScope);
  const now = useNow();
  const live = chain.id === arcMainnet.id;

  const feed = useQuery({
    queryKey: ["feed", scope],
    queryFn: async (): Promise<FeedItem[]> => {
      const response = await fetch(`/api/feed?scope=${scope}`);
      if (!response.ok) throw new Error("The Arc index didn't answer.");
      return response.json();
    },
    enabled: live,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  if (!live) return null;
  const items = (feed.data ?? []).slice(0, limit);
  const kernel = deployment?.kernel.toLowerCase();

  return (
    <div className="rounded-[28px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-buy/60" />
            <span className="relative inline-flex size-2 rounded-full bg-buy" />
          </span>
          Latest on Arc
        </p>
        <Tabs label="Show activity from" value={scope} options={SCOPES} onChange={setScope} />
      </div>

      {feed.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-[320px]" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">
          {feed.isError ? "The Arc index didn't answer. Retrying…" : "Nothing yet. Trades show up here within a few minutes."}
        </p>
      ) : (
        <ul className={`divide-y divide-line/70 transition-opacity ${feed.isPlaceholderData ? "opacity-60" : ""}`} aria-live="polite">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} now={now} ours={item.hook.toLowerCase() === kernel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedRow({ item, now, ours }: { item: FeedItem; now: number; ours: boolean }) {
  // Our pools open their own page; any other hooked pool opens its hook in the reader.
  const href = item.poolPath ?? `/hooks/${item.hook}`;
  const pair = `${item.base.symbol} / ${item.quote.symbol}`;
  const when = now > 0 ? timeAgo(item.time, now) : "";

  return (
    <li className="feed-in flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
      <span className="w-20 shrink-0">
        {item.kind === "pool" ? (
          <Badge>New pool</Badge>
        ) : item.side === "buy" ? (
          <Badge tone="good">Buy</Badge>
        ) : (
          <Badge tone="bad">Sell</Badge>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {item.kind === "swap" ? (
          <>
            <span className="tabular text-ink">
              {formatAmount(item.baseAmount)} {item.base.symbol}
            </span>
            <span className="text-muted"> for </span>
            <span className="tabular text-ink">{formatUsd(item.valueUSD)}</span>
          </>
        ) : (
          <span className="text-ink">Opened with the Arcsmith kernel</span>
        )}
        <Link href={href} className="ml-2 text-muted underline-offset-4 hover:text-ink hover:underline">
          {pair}
        </Link>
        {ours && item.kind === "swap" && (
          <span className="ml-2">
            <Badge tone="good">Arcsmith</Badge>
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
        {item.kind === "swap" && <TraderLink address={item.trader} />}
        {item.kind === "swap" && explorerTxUrl(item.tx) ? (
          <a href={explorerTxUrl(item.tx)} target="_blank" rel="noreferrer" className="tabular hover:text-ink hover:underline">
            {when}
          </a>
        ) : (
          <span className="tabular">{when}</span>
        )}
      </span>
    </li>
  );
}

function TraderLink({ address }: { address: string }) {
  const href = explorerAddressUrl(address);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono hover:text-ink hover:underline">
      {shortAddress(address)}
    </a>
  ) : (
    <span className="font-mono">{shortAddress(address)}</span>
  );
}
