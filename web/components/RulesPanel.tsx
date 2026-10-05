"use client";

import Link from "next/link";
import type { Address, Hex } from "viem";
import { blockKind, decodeConfig, describeBlock, type CatalogBlock } from "@/lib/blocks";
import { formatBps, formatFee, shortAddress } from "@/lib/format";
import { BlockIcon, LockIcon } from "./BlockIcon";
import { Badge } from "./ui";

type Props = {
  baseFee: number;
  blocks: readonly Address[];
  configs: readonly Hex[];
  isLaunch: boolean;
  catalog: Map<string, CatalogBlock>;
  /** Royalty rate per block, frozen at launch (launches only). */
  royalties?: readonly number[];
  title?: string;
  note?: string;
};

/** A pool's frozen rules in plain language: each block, then the kernel's own guarantees. */
export function RulesPanel({ baseFee, blocks, configs, isLaunch, catalog, royalties, title = "Rules for this pool", note }: Props) {
  return (
    <section className="card p-6" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="text-xs text-subtle">{note ?? "Frozen when the pool opened — nobody can change them"}</span>
      </div>

      <ul className="mt-5 grid gap-3">
        <li className="panel flex gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-panel text-sm font-medium tabular">
            %
          </span>
          <div>
            <p className="text-sm font-medium">Base fee {formatFee(baseFee)}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">Every trade pays at least this. It goes to the pool&apos;s liquidity providers.</p>
          </div>
        </li>

        {blocks.map((address, i) => {
          const entry = catalog.get(address.toLowerCase());
          const values = entry?.metadata ? decodeConfig(entry.metadata, configs[i]) : null;
          const royalty = royalties?.[i] ?? 0;
          return (
            <li key={address} className="panel flex gap-3 p-4">
              <BlockIcon kind={blockKind(address)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/blocks/${address}`} className="text-sm font-medium hover:underline">
                    {entry?.metadata?.name ?? shortAddress(address)}
                  </Link>
                  {entry?.native ? <Badge>Native</Badge> : <Badge tone="warn">Community</Badge>}
                  {royalty > 0 && <Badge>Author earns {formatBps(royalty)} of protocol fees</Badge>}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {entry ? describeBlock(entry, values) : "Loading block…"}
                </p>
              </div>
            </li>
          );
        })}

        <li className="panel flex gap-3 p-4">
          <LockIcon />
          <div>
            <p className="text-sm font-medium">Kernel guarantees</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              No trade ever pays more than 50% in the first 15 minutes or 10% after, whatever the blocks ask. Burns are
              capped at 5%. A broken block is skipped, never freezes the pool.
              {isLaunch && " The whole supply is locked in the pool, and the price can't trade below launch."}
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}
