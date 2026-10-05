"use client";

import { useState } from "react";
import { useConnection, useReadContracts } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatUnits } from "viem";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { deployment } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount, formatBps } from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";
import type { MarketDetail } from "@/lib/hooks/useMarket";

/**
 * Shown only to a launch's creator: their share of the locked position's trading fees, and one
 * button to collect and claim it. Open markets have no creator fees — LPs earn there.
 */
export function CreatorPanel({ detail, marketId }: { detail: MarketDetail; marketId: bigint }) {
  const { address } = useConnection();
  const { market, symbol, quoteSymbol, pendingSubject, pendingQuote, refetch } = detail;
  const isCreator = Boolean(
    address && market?.isLaunch && address.toLowerCase() === market.creator.toLowerCase(),
  );

  const claimable = useReadContracts({
    contracts: [
      { address: deployment?.launchpad, abi: launchpadAbi, functionName: "claimable", args: [market?.creator ?? "0x", market?.subject ?? "0x"] },
      { address: deployment?.launchpad, abi: launchpadAbi, functionName: "claimable", args: [market?.creator ?? "0x", market?.quote ?? "0x"] },
    ],
    query: { enabled: isCreator, refetchInterval: 8_000 },
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isCreator || !market) return null;

  // Uncollected fees are split at collection time; show only the creator's share of them.
  const creatorShare = (amount: bigint) => (amount * BigInt(10_000 - market.protocolShareBps)) / 10_000n;
  const subjectTotal = creatorShare(pendingSubject) + (claimable.data?.[0]?.result ?? 0n);
  const quoteTotal = creatorShare(pendingQuote) + (claimable.data?.[1]?.result ?? 0n);
  const nothing = subjectTotal === 0n && quoteTotal === 0n;

  async function claim() {
    if (!deployment) return;
    setBusy(true);
    try {
      setStatus("Confirm in your wallet…");
      const hash = await writeContract(wagmiConfig, {
        address: deployment.launchpad,
        abi: launchpadAbi,
        functionName: "collectAndClaim",
        args: [marketId],
      });
      setStatus("Waiting for confirmation…");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setStatus("Claimed. The fees are in your wallet.");
      await Promise.all([refetch(), claimable.refetch()]);
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="organic rounded-[var(--radius-card)] p-5 text-white" aria-label="Creator fees">
      <p className="text-sm text-white/75">You created this token</p>
      <h2 className="mt-1 text-lg font-medium">Your trading fees</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[14px] bg-white/12 p-3 backdrop-blur-sm">
          <dt className="text-xs text-white/70">{quoteSymbol || "Quote"}</dt>
          <dd className="tabular text-xl font-medium">{formatAmount(Number(formatUnits(quoteTotal, detail.quoteDecimals)))}</dd>
        </div>
        <div className="rounded-[14px] bg-white/12 p-3 backdrop-blur-sm">
          <dt className="text-xs text-white/70">{symbol || "Token"}</dt>
          <dd className="tabular text-xl font-medium">{formatAmount(Number(formatUnits(subjectTotal, detail.subjectDecimals)))}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-white/70">
        You keep {formatBps(10_000 - market.protocolShareBps)} of the pool&apos;s fees. Buys pay in {quoteSymbol || "the quote"}, sells in{" "}
        {symbol || "tokens"}.
      </p>
      <button type="button" className="pill mt-4 w-full bg-white text-ink hover:bg-white/90" disabled={busy || nothing} onClick={claim}>
        {busy ? "Claiming…" : nothing ? "Nothing to claim yet" : "Claim fees"}
      </button>
      {status && !busy && <p className="mt-2 text-xs text-white/85" aria-live="polite">{status}</p>}
    </section>
  );
}
