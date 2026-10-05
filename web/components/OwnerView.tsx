"use client";

import { useState } from "react";
import { useConnection, useReadContracts } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatUnits, type Address, type Hash } from "viem";
import { blockCatalogAbi } from "@/lib/abi/BlockCatalog";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { chain, deployment, explorerTxUrl } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatBps, formatUsd, shortAddress } from "@/lib/format";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { wagmiConfig } from "@/lib/wagmi";
import { BlockIcon } from "./BlockIcon";
import { Badge, EmptyState } from "./ui";
import { WalletGate } from "./WalletGate";

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const MAX_ROYALTY_BPS = 2_000; // BlockCatalog.MAX_ROYALTY_BPS

/**
 * Controls for the platform's owner wallet: accept the catalog, review community blocks,
 * claim protocol fees, pause new pools. Every action is checked by the contracts too; the
 * page only hides what the connected wallet can't do.
 */
export function OwnerView() {
  const { address } = useConnection();
  const catalog = useCatalog();
  const [status, setStatus] = useState<{ busy: string | null; message: string | null; hash?: Hash }>({ busy: null, message: null });
  const [royalty, setRoyalty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const d = deployment;
  const reads = useReadContracts({
    contracts: [
      { address: d?.launchpad, abi: launchpadAbi, functionName: "owner" },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "treasury" },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "protocolShareBps" },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "paused" },
      { address: d?.catalog, abi: blockCatalogAbi, functionName: "owner" },
      { address: d?.catalog, abi: blockCatalogAbi, functionName: "pendingOwner" },
    ],
    query: { enabled: Boolean(d), refetchInterval: 10_000 },
  });
  const [lpOwner, treasury, shareBps, paused, catalogOwner, catalogPending] = (reads.data ?? []).map((r) => r.result) as [
    Address | undefined,
    Address | undefined,
    number | undefined,
    boolean | undefined,
    Address | undefined,
    Address | undefined,
  ];
  const fees = useReadContracts({
    contracts: [
      { address: d?.launchpad, abi: launchpadAbi, functionName: "claimable", args: [treasury ?? "0x", d?.usdc ?? "0x"] },
    ],
    query: { enabled: Boolean(d && treasury), refetchInterval: 10_000 },
  });
  const claimableUsdc = (fees.data?.[0]?.result as bigint | undefined) ?? 0n;

  const isLaunchpadOwner = same(address, lpOwner);
  const isTreasury = same(address, treasury);
  const isCatalogOwner = same(address, catalogOwner);
  const isPendingCatalogOwner = same(address, catalogPending);
  const pending = catalog.blocks.filter((b) => b.status === "pending");

  async function send(label: string, write: () => Promise<Hash>, done: string) {
    try {
      setStatus({ busy: label, message: "Confirm in your wallet…" });
      const hash = await write();
      setStatus({ busy: label, message: "Waiting for confirmation…", hash });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setStatus({ busy: null, message: done, hash });
      await Promise.all([reads.refetch(), fees.refetch(), catalog.refetch()]);
    } catch (error) {
      setStatus({ busy: null, message: friendlyError(error) });
    }
  }

  if (!d) return <EmptyState title="Not deployed yet" body={`No contracts on ${chain.name} yet.`} />;

  const busy = status.busy !== null;

  return (
    <div className="flex flex-col gap-6">
      {reads.error && <p className="panel p-5 text-sell">Couldn&apos;t read the contracts: {friendlyError(reads.error)}</p>}
      {!address && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-lg font-medium">Connect the owner wallet to act</p>
          <div className="w-full max-w-xs">
            <WalletGate>{null}</WalletGate>
          </div>
        </div>
      )}
      {address && !isLaunchpadOwner && !isTreasury && !isCatalogOwner && !isPendingCatalogOwner && lpOwner && (
        <p className="panel p-5 text-muted">
          The connected wallet ({shortAddress(address)}) has no owner role on {chain.name}. The owner is{" "}
          {lpOwner ? shortAddress(lpOwner) : "…"}.
        </p>
      )}

      <Section title="Block catalog">
        <p className="text-muted">
          Owner: <span className="font-mono text-sm text-text">{catalogOwner ? shortAddress(catalogOwner) : "…"}</span>
          {catalogPending && catalogPending !== "0x0000000000000000000000000000000000000000" && (
            <>
              {" "}· offered to <span className="font-mono text-sm text-text">{shortAddress(catalogPending)}</span>
            </>
          )}
        </p>
        {isPendingCatalogOwner ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-muted">
              The catalog has been offered to your wallet. Accepting makes you the one who approves community blocks.
            </p>
            <WalletGate>
              <button
                type="button"
                className="pill pill-ink"
                disabled={busy}
                onClick={() =>
                  send(
                    "accept",
                    () => writeContract(wagmiConfig, { address: d.catalog, abi: blockCatalogAbi, functionName: "acceptOwnership" }),
                    "Done. The block catalog is now owned by your wallet.",
                  )
                }
              >
                {status.busy === "accept" ? status.message : "Accept catalog ownership"}
              </button>
            </WalletGate>
          </div>
        ) : isCatalogOwner ? (
          <p className="mt-2 text-sm text-buy">Your wallet owns the catalog.</p>
        ) : null}
      </Section>

      <Section title="Protocol fees">
        <p className="text-muted">
          Share of launch fees: <span className="text-text">{shareBps !== undefined ? formatBps(shareBps) : "…"}</span> · paid to{" "}
          <span className="font-mono text-sm text-text">{treasury ? shortAddress(treasury) : "…"}</span>
        </p>
        <p className="tabular mt-4 text-3xl font-medium">{formatUsd(Number(formatUnits(claimableUsdc, 6)))}</p>
        <p className="text-sm text-muted">
          Ready to claim, in USDC. Fees from each launch arrive here when its fees are collected (creators do this when they
          claim).
        </p>
        {isTreasury && (
          <div className="mt-4">
            <WalletGate>
              <button
                type="button"
                className="pill pill-ink"
                disabled={busy || claimableUsdc === 0n}
                onClick={() =>
                  send(
                    "claim",
                    () => writeContract(wagmiConfig, { address: d.launchpad, abi: launchpadAbi, functionName: "claim", args: [d.usdc] }),
                    "Claimed to your wallet.",
                  )
                }
              >
                {status.busy === "claim" ? status.message : claimableUsdc === 0n ? "Nothing to claim yet" : "Claim USDC"}
              </button>
            </WalletGate>
          </div>
        )}
      </Section>

      <Section title={`Community blocks awaiting review (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-muted">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((b) => {
              const key = b.address.toLowerCase();
              const royaltyPct = royalty[key] ?? "10";
              const royaltyBps = Math.round(Number(royaltyPct) * 100);
              const royaltyValid = Number.isFinite(royaltyBps) && royaltyBps >= 0 && royaltyBps <= MAX_ROYALTY_BPS;
              return (
                <li key={b.address} className="panel p-4">
                  <div className="flex items-start gap-3">
                    <BlockIcon kind={b.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.metadata?.name ?? shortAddress(b.address)}</p>
                      <p className="text-sm text-muted">{b.metadata?.summary}</p>
                      <p className="mt-1 font-mono text-xs text-subtle">
                        {b.address} · author {shortAddress(b.author)}
                      </p>
                    </div>
                    <a href={`/blocks/${b.address}`} className="text-sm underline underline-offset-2">
                      Details
                    </a>
                  </div>
                  {isCatalogOwner && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-end">
                      <label className="text-xs text-muted">
                        Author royalty, % of protocol share
                        <input
                          className="field mt-1"
                          inputMode="decimal"
                          value={royaltyPct}
                          onChange={(e) => setRoyalty({ ...royalty, [key]: e.target.value })}
                        />
                      </label>
                      <label className="text-xs text-muted">
                        Reason, if rejecting
                        <input
                          className="field mt-1"
                          value={reason[key] ?? ""}
                          onChange={(e) => setReason({ ...reason, [key]: e.target.value })}
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        className="pill pill-ink"
                        disabled={busy || !royaltyValid}
                        onClick={() =>
                          send(
                            `approve-${key}`,
                            () =>
                              writeContract(wagmiConfig, {
                                address: d.catalog,
                                abi: blockCatalogAbi,
                                functionName: "approve",
                                args: [b.address, royaltyBps],
                              }),
                            "Approved. Builders can use it now.",
                          )
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="pill pill-ghost"
                        disabled={busy}
                        onClick={() =>
                          send(
                            `reject-${key}`,
                            () =>
                              writeContract(wagmiConfig, {
                                address: d.catalog,
                                abi: blockCatalogAbi,
                                functionName: "reject",
                                args: [b.address, reason[key] ?? ""],
                              }),
                            "Rejected.",
                          )
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {isCatalogOwner && !royaltyValid && (
                    <p className="mt-2 text-sm text-sell">Royalty must be between 0% and {formatBps(MAX_ROYALTY_BPS)}.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isCatalogOwner && pending.length > 0 && (
          <p className="mt-3 text-sm text-muted">Only the catalog owner can approve or reject blocks.</p>
        )}
      </Section>

      <Section title="New pools">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted">
            {paused === undefined ? "…" : paused ? "Paused: nobody can launch or open new markets. Existing pools keep trading." : "Open: anyone can launch or open markets."}
          </p>
          {isLaunchpadOwner && paused !== undefined && (
            <WalletGate>
              <button
                type="button"
                className={`pill ${paused ? "pill-ink" : "pill-ghost"}`}
                disabled={busy}
                onClick={() =>
                  send(
                    "pause",
                    () =>
                      writeContract(wagmiConfig, { address: d.launchpad, abi: launchpadAbi, functionName: "setPaused", args: [!paused] }),
                    paused ? "New pools are open again." : "New pools are paused.",
                  )
                }
              >
                {status.busy === "pause" ? status.message : paused ? "Reopen new pools" : "Pause new pools"}
              </button>
            </WalletGate>
          )}
        </div>
      </Section>

      <div aria-live="polite">
        {!busy && status.message && (
          <p className="panel p-4 text-sm">
            {status.message}{" "}
            {status.hash && explorerTxUrl(status.hash) && (
              <a className="underline underline-offset-2" href={explorerTxUrl(status.hash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
          </p>
        )}
      </div>
      {isLaunchpadOwner && <Badge tone="good">Connected as the platform owner</Badge>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6" aria-label={title}>
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}
