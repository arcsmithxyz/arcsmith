import Link from "next/link";
import type { BlockStatus, CatalogBlock } from "@/lib/blocks";
import { formatBps, shortAddress } from "@/lib/format";
import { BlockIcon } from "../BlockIcon";
import { Badge } from "../ui";

const STATUS: Record<BlockStatus, { label: string; tone: "neutral" | "good" | "warn" | "bad" }> = {
  none: { label: "Unknown", tone: "neutral" },
  pending: { label: "In review", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  retired: { label: "Retired", tone: "neutral" },
};

export function StatusBadge({ status }: { status: BlockStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

/** A catalog entry in a grid. */
export function BlockCard({ block, pools }: { block: CatalogBlock; pools: number }) {
  return (
    <Link href={`/blocks/${block.address}`} className="card flex flex-col gap-6 p-6 transition-colors hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-3">
        <BlockIcon kind={block.kind} />
        <span className="flex flex-wrap justify-end gap-1.5">
          {block.native ? <Badge>Native</Badge> : <Badge tone="warn">Community</Badge>}
          {block.status !== "approved" && <StatusBadge status={block.status} />}
        </span>
      </div>
      <div className="flex flex-1 flex-col">
        <h3 className="font-medium">{block.metadata?.name ?? shortAddress(block.address)}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{block.metadata?.summary ?? "No readable description."}</p>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
          <span>
            {pools} {pools === 1 ? "pool" : "pools"}
          </span>
          {block.metadata?.lanes === "launch" && <span>New tokens only</span>}
          {block.royaltyBps > 0 && <span>{formatBps(block.royaltyBps)} author royalty</span>}
        </p>
      </div>
    </Link>
  );
}
