"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContract } from "wagmi";
import { keccak256, type Address } from "viem";
import { ruleBlockAbi } from "@/lib/abi/BaseBlock";
import { defaultValues, encodeConfig, formatValue } from "@/lib/blocks";
import { chain, deployment, explorerAddressUrl } from "@/lib/config";
import { formatBps, shortAddress, timeAgo } from "@/lib/format";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useFeePreview } from "@/lib/hooks/useFeePreview";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { useNow } from "@/lib/hooks/useNow";
import { BlockIcon } from "../BlockIcon";
import { FeeCurveChart } from "../FeeCurveChart";
import { MarketCard } from "../MarketCard";
import { Badge, EmptyState, Skeleton } from "../ui";
import { StatusBadge } from "./BlockCard";

const PREVIEW_BASE_FEE = 10_000; // 1%

// IRuleBlock hook points (HookPoints library).
const POINTS = [
  { bit: 1, label: "Before each swap", detail: "Adds to the fee, or refuses the trade." },
  { bit: 2, label: "After each swap", detail: "Can burn a share of the output, or refuse the trade." },
  { bit: 4, label: "Before liquidity is added", detail: "Can refuse deposits." },
];

/** One catalog block: what it does, its settings, its on-chain facts and where it's used. */
export function BlockDetail({ address }: { address: Address }) {
  const catalog = useCatalog();
  const { markets } = useMarkets();
  const now = useNow();
  const client = usePublicClient({ chainId: chain.id });
  const block = catalog.byAddress.get(address.toLowerCase());
  const meta = block?.metadata ?? null;

  const points = useReadContract({ address, abi: ruleBlockAbi, functionName: "hookPoints", query: { enabled: Boolean(block) } });
  // Approval pins the code hash; a mismatch would mean the address now runs different code.
  const code = useQuery({
    queryKey: ["block-code", chain.id, address],
    queryFn: async () => {
      const bytecode = await client!.getCode({ address });
      return bytecode ? keccak256(bytecode) : null;
    },
    enabled: Boolean(client && block),
    staleTime: 5 * 60_000,
  });

  const stack = meta ? [{ address, config: encodeConfig(meta, defaultValues(meta)) }] : [];
  // Previewed as a launch so launch-only blocks (like the guard) show their opening behaviour too.
  const preview = useFeePreview(PREVIEW_BASE_FEE, stack, true);

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="The catalog appears once the contracts are live on this network." />;
  }
  if (catalog.isLoading) return <Skeleton className="mt-12 h-[480px]" />;
  if (!block) {
    return (
      <div className="pt-12">
        <EmptyState title="Not in the catalog" body="This address hasn't been submitted as a block." action={{ href: "/blocks", label: "Browse blocks" }} />
      </div>
    );
  }

  const using = markets.filter((m) => m.blocks.some((b) => b.toLowerCase() === address.toLowerCase()));
  const hashMatches = code.data ? code.data === block.codehash : undefined;
  const explorer = explorerAddressUrl(address);

  return (
    <div className="pt-12">
      <Link href="/blocks" className="text-sm text-muted hover:text-text">
        ← All blocks
      </Link>
      <header className="mt-6 flex flex-wrap items-start gap-5">
        <BlockIcon kind={block.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.75rem] font-medium tracking-tight">{meta?.name ?? shortAddress(address)}</h1>
            <StatusBadge status={block.status} />
            {block.native ? <Badge>Native</Badge> : <Badge tone="warn">Community</Badge>}
          </div>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted">{meta?.summary ?? "This block's metadata can't be read."}</p>
        </div>
        {block.status === "approved" && (
          <Link href="/build" className="pill pill-ink">
            Use in the builder
          </Link>
        )}
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card p-6" aria-labelledby="try">
            <h2 id="try" className="text-lg font-medium">
              What it charges, with default settings
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted">On a pool with a 1% base fee. Computed by this block&apos;s contract.</p>
            <FeeCurveChart curves={preview.curves} loading={preview.isLoading} />
          </section>

          {meta && meta.config.length > 0 && (
            <section className="card overflow-x-auto p-6" aria-labelledby="settings">
              <h2 id="settings" className="text-lg font-medium">
                Settings
              </h2>
              <table className="mt-4 w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th className="py-2 pr-4 font-normal">Setting</th>
                    <th className="py-2 pr-4 font-normal">Range</th>
                    <th className="py-2 font-normal">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.config.map((f) => (
                    <tr key={f.key} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-4">{f.label}</td>
                      <td className="tabular py-2.5 pr-4 text-muted">
                        {formatValue(f, f.min)} – {formatValue(f, f.max)}
                      </td>
                      <td className="tabular py-2.5">{formatValue(f, f.default)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-labelledby="used-by">
            <h2 id="used-by" className="mb-4 text-lg font-medium">
              Pools using it ({using.length})
            </h2>
            {using.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {using.map((m) => (
                  <MarketCard key={m.id.toString()} market={m} now={now} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-6" aria-label="On-chain facts">
            <dl className="flex flex-col gap-4 text-sm">
              <Fact label="Address">
                {explorer ? (
                  <a href={explorer} target="_blank" rel="noreferrer" className="font-mono text-xs break-all hover:underline">
                    {address}
                  </a>
                ) : (
                  <span className="font-mono text-xs break-all">{address}</span>
                )}
              </Fact>
              <Fact label="Author">
                <span className="font-mono text-xs">{shortAddress(block.author)}</span>
              </Fact>
              <Fact label="Author royalty">
                {block.royaltyBps > 0 ? `${formatBps(block.royaltyBps)} of the protocol's fee share, per launch using it` : "None"}
              </Fact>
              <Fact label="Code">
                {hashMatches === undefined ? (
                  "Checking…"
                ) : hashMatches ? (
                  <span className="text-buy">Matches the reviewed code hash</span>
                ) : (
                  <span className="text-sell">Differs from the reviewed code hash</span>
                )}
              </Fact>
              <Fact label="Runs">
                <ul className="flex flex-col gap-1.5">
                  {POINTS.filter((p) => ((points.data ?? 0) & p.bit) !== 0).map((p) => (
                    <li key={p.bit}>
                      {p.label}
                      <span className="block text-xs text-muted">{p.detail}</span>
                    </li>
                  ))}
                </ul>
              </Fact>
              <Fact label="Lanes">{meta?.lanes === "launch" ? "New tokens only" : "New and existing tokens"}</Fact>
              <Fact label="Submitted">{now > 0 ? timeAgo(block.submittedAt, now) : ""}</Fact>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
