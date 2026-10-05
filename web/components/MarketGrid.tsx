"use client";

import { deployment } from "@/lib/config";
import { useMarkets, type MarketSummary } from "@/lib/hooks/useMarkets";
import { useNow } from "@/lib/hooks/useNow";
import { MarketCard } from "./MarketCard";
import { EmptyState, Skeleton } from "./ui";

type Props = {
  /** Show at most this many; all when omitted. */
  limit?: number;
  filter?: (market: MarketSummary) => boolean;
  empty?: { title: string; body: string };
};

/** Pools on this platform, newest first. */
export function MarketGrid({ limit, filter, empty }: Props) {
  const { markets, isLoading, error } = useMarkets();
  const now = useNow();

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="Pools will show up here once the contracts are live on this network." />;
  }
  if (error) {
    return <EmptyState title="Couldn't load pools" body="The network didn't answer. It will retry on its own." />;
  }
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: limit ? Math.min(limit, 6) : 6 }, (_, i) => (
          <Skeleton key={i} className="h-[196px]" />
        ))}
      </div>
    );
  }

  const shown = (filter ? markets.filter(filter) : markets).slice(0, limit);
  if (shown.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? "No pools yet"}
        body={empty?.body ?? "Be the first: compose a few blocks and launch."}
        action={{ href: "/build", label: "Launch token" }}
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((m) => (
        <MarketCard key={m.id.toString()} market={m} now={now} />
      ))}
    </div>
  );
}
