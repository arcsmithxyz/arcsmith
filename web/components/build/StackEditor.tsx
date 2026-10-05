"use client";

import Link from "next/link";
import type { Address } from "viem";
import { formatValue, inputSuffix, toInput, type CatalogBlock } from "@/lib/blocks";
import { formatBps, shortAddress } from "@/lib/format";
import { BlockIcon } from "../BlockIcon";
import { Badge } from "../ui";

export const MAX_BLOCKS = 5;

/** A block in the stack being built, with its settings as typed (display units). */
export type StackEntry = { address: Address; inputs: string[] };

/** Fresh entry with the block's default settings. */
export function newEntry(block: CatalogBlock): StackEntry {
  const fields = block.metadata?.config ?? [];
  return { address: block.address, inputs: fields.map((f) => String(toInput(f, f.default))) };
}

type Props = {
  stack: StackEntry[];
  errors: Map<string, string>;
  available: CatalogBlock[];
  catalog: Map<string, CatalogBlock>;
  isLaunch: boolean;
  loading: boolean;
  onChange: (stack: StackEntry[]) => void;
};

/** The chosen blocks with a settings form each (generated from the block's schema), then the catalog to add from. */
export function StackEditor({ stack, errors, available, catalog, isLaunch, loading, onChange }: Props) {
  const chosen = new Set(stack.map((e) => e.address.toLowerCase()));
  const full = stack.length >= MAX_BLOCKS;

  function update(index: number, field: number, value: string) {
    onChange(stack.map((e, i) => (i === index ? { ...e, inputs: e.inputs.map((v, j) => (j === field ? value : v)) } : e)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Your stack</h3>
          <span className="tabular text-xs text-subtle">
            {stack.length} of {MAX_BLOCKS} blocks
          </span>
        </div>
        {stack.length === 0 ? (
          <p className="panel mt-3 p-4 text-sm text-muted">
            No blocks yet — the pool would charge its base fee and nothing else.
            {isLaunch && " Most launches pair a launch guard with a dump damper."}
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {stack.map((entry, index) => {
              const block = catalog.get(entry.address.toLowerCase());
              const meta = block?.metadata;
              const error = errors.get(entry.address.toLowerCase());
              return (
                <li key={entry.address} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BlockIcon kind={block?.kind ?? "custom"} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{meta?.name ?? shortAddress(entry.address)}</p>
                        <p className="truncate text-xs text-muted">{meta?.summary}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pill pill-ghost pill-sm h-8 shrink-0 px-3 text-xs"
                      onClick={() => onChange(stack.filter((_, i) => i !== index))}
                      aria-label={`Remove ${meta?.name ?? "block"}`}
                    >
                      Remove
                    </button>
                  </div>
                  {meta && meta.config.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {meta.config.map((field, j) => {
                        const id = `${entry.address}-${field.key}`;
                        const suffix = inputSuffix(field);
                        return (
                          <div key={field.key}>
                            <label htmlFor={id} className="text-xs text-muted">
                              {field.label}
                            </label>
                            <div className="relative mt-1">
                              <input
                                id={id}
                                className="field tabular pr-10"
                                inputMode="decimal"
                                autoComplete="off"
                                value={entry.inputs[j] ?? ""}
                                onChange={(e) => update(index, j, e.target.value.replace(",", "."))}
                              />
                              {suffix && (
                                <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-subtle">
                                  {suffix}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[0.7rem] text-subtle">
                              {formatValue(field, field.min)} – {formatValue(field, field.max)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {error && <p className="mt-3 text-sm text-sell">{error}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Add blocks</h3>
          <Link href="/blocks" className="text-xs text-muted hover:text-text">
            Browse the catalog →
          </Link>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading the catalog…</p>
        ) : available.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No approved blocks in the catalog yet.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {available.map((block) => {
              const inStack = chosen.has(block.address.toLowerCase());
              const wrongLane = !isLaunch && block.metadata?.lanes === "launch";
              const disabled = inStack || wrongLane || full;
              return (
                <li key={block.address}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange([...stack, newEntry(block)])}
                    className="panel flex h-full w-full items-start gap-3 p-4 text-left transition-colors enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BlockIcon kind={block.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{block.metadata?.name}</span>
                        {!block.native && <Badge tone="warn">Community</Badge>}
                        {block.royaltyBps > 0 && <Badge>{formatBps(block.royaltyBps)} royalty</Badge>}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {wrongLane ? "New tokens only." : block.metadata?.summary}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium">{inStack ? "Added" : "+ Add"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
