"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { arcMainnet } from "@/lib/chains";
import { chain, isUsdc } from "@/lib/config";
import { formatFee, formatQuoted, timeAgo } from "@/lib/format";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { useNow } from "@/lib/hooks/useNow";
import { ActivityFeed } from "./ActivityFeed";
import { HookTable } from "./HookTable";
import { HookedPoolsTable } from "./HookedPoolsTable";
import { MarketGrid } from "./MarketGrid";
import { TokenAvatar } from "./TokenAvatar";
import { EmptyState, Skeleton, Tabs } from "./ui";

type Tab = "pools" | "tokens" | "live" | "popular" | "hooks";
type Lane = "all" | "launch" | "existing";

const TABS: { value: Tab; label: string }[] = [
  { value: "pools", label: "Pools" },
  { value: "tokens", label: "Tokens" },
  { value: "live", label: "Live" },
  { value: "popular", label: "Popular on Arc" },
  { value: "hooks", label: "Hooks on Arc" },
];

const LANES: { value: Lane; label: string }[] = [
  { value: "all", label: "All" },
  { value: "launch", label: "Launches" },
  { value: "existing", label: "Existing tokens" },
];

export function DiscoverView() {
  // ?tab=popular (and the other tab names) opens that tab directly.
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.value === requested)?.value ?? "pools");
  const [lane, setLane] = useState<Lane>("all");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} options={TABS} onChange={setTab} label="Discover" />
        {tab === "pools" && <Tabs value={lane} options={LANES} onChange={setLane} label="Lane" />}
      </div>
      {tab === "pools" && (
        <MarketGrid
          filter={lane === "all" ? undefined : (m) => m.isLaunch === (lane === "launch")}
          empty={
            lane === "existing"
              ? { title: "No markets for existing tokens yet", body: "Put your rules on any Arc token from the builder." }
              : undefined
          }
        />
      )}
      {tab === "tokens" && <TokenTable />}
      {tab === "live" &&
        (chain.id === arcMainnet.id ? (
          <ActivityFeed limit={30} defaultScope="arcsmith" />
        ) : (
          <EmptyState title="Live activity is mainnet only" body="The feed reads the Arc mainnet index, so it only runs on the mainnet site." />
        ))}
      {tab === "popular" && <HookedPoolsTable />}
      {tab === "hooks" && <HookTable />}
    </div>
  );
}

/** Tokens launched here, by fully diluted value. */
function TokenTable() {
  const { markets, isLoading } = useMarkets();
  const now = useNow();
  const launches = markets.filter((m) => m.isLaunch).sort((a, b) => b.fdv - a.fdv);

  if (isLoading) return <Skeleton className="h-[420px]" />;
  if (launches.length === 0) {
    return (
      <EmptyState
        title="No tokens launched yet"
        body="Launch one with the rules you want, in a single transaction."
        action={{ href: "/build", label: "Launch a token" }}
      />
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <th className="px-5 py-3 font-normal">Token</th>
            <th className="px-5 py-3 text-right font-normal">Price</th>
            <th className="px-5 py-3 text-right font-normal">Fully diluted value</th>
            <th className="px-5 py-3 text-right font-normal">Buy / sell fee</th>
            <th className="px-5 py-3 text-right font-normal">Launched</th>
          </tr>
        </thead>
        <tbody>
          {launches.map((m) => {
            const usd = isUsdc(m.quote);
            return (
              <tr key={m.id.toString()} className="border-b border-line last:border-0 hover:bg-surface-hover">
                <td className="px-5 py-3">
                  <Link href={m.href} className="flex items-center gap-3">
                    <TokenAvatar src={m.imageURI} seed={m.subject} size={32} label={m.symbol} />
                    <span>
                      <span className="block font-medium">{m.name || "…"}</span>
                      <span className="block text-xs text-muted">{m.symbol}</span>
                    </span>
                  </Link>
                </td>
                <td className="tabular px-5 py-3 text-right">{formatQuoted(m.price, m.quoteSymbol, usd)}</td>
                <td className="tabular px-5 py-3 text-right">{formatQuoted(m.fdv, m.quoteSymbol, usd, "total")}</td>
                <td className="tabular px-5 py-3 text-right">
                  {formatFee(m.buyFee)} / {formatFee(m.sellFee)}
                </td>
                <td className="px-5 py-3 text-right text-muted">{now > 0 ? timeAgo(m.createdAt, now) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
