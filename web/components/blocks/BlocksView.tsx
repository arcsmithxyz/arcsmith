"use client";

import { useState } from "react";
import { deployment } from "@/lib/config";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { EmptyState, Skeleton, Tabs } from "../ui";
import { BlockCard } from "./BlockCard";

type Filter = "approved" | "pending" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "pending", label: "In review" },
  { value: "all", label: "All" },
];

/** The block catalog, with how many pools use each block. */
export function BlocksView() {
  const catalog = useCatalog();
  const { markets } = useMarkets();
  const [filter, setFilter] = useState<Filter>("approved");

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="The catalog appears once the contracts are live on this network." />;
  }

  const usage = new Map<string, number>();
  for (const m of markets) for (const b of m.blocks) usage.set(b.toLowerCase(), (usage.get(b.toLowerCase()) ?? 0) + 1);
  const shown = catalog.blocks.filter((b) => filter === "all" || b.status === filter);

  return (
    <div>
      <div className="mb-6">
        <Tabs value={filter} options={FILTERS} onChange={setFilter} label="Filter blocks" />
      </div>
      {catalog.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[220px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "Nothing in review" : "No blocks here"}
          body="Written a rule block? Submit it — once approved, it earns a royalty from every launch that uses it."
          action={{ href: "/blocks/submit", label: "Submit a block" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((b) => (
            <BlockCard key={b.address} block={b} pools={usage.get(b.address.toLowerCase()) ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
