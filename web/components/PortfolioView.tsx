"use client";

import Link from "next/link";
import { useState } from "react";
import { useConnection, useReadContracts } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatUnits, type Address, type ContractFunctionReturnType } from "viem";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { liquidityManagerAbi } from "@/lib/abi/LiquidityManager";
import { deployment, isUsdc } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount, formatQuoted } from "@/lib/format";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useMarkets, type MarketSummary } from "@/lib/hooks/useMarkets";
import { wagmiConfig } from "@/lib/wagmi";
import { BlockIcon } from "./BlockIcon";
import { TokenAvatar } from "./TokenAvatar";
import { EmptyState, Skeleton } from "./ui";
import { WalletGate } from "./WalletGate";

type PoolKey = ContractFunctionReturnType<typeof launchpadAbi, "view", "poolKeyOf">;
const Q96 = 2n ** 96n;

/** A connected wallet's liquidity, creator fees and block-author royalties across every pool. */
export function PortfolioView() {
  const { address: account } = useConnection();
  const { markets, isLoading } = useMarkets();
  const catalog = useCatalog();
  const [status, setStatus] = useState<{ busy: string | null; message: string | null }>({ busy: null, message: null });

  const holder = account ?? "0x0000000000000000000000000000000000000000";
  const keys = useReadContracts({
    contracts: markets.map((m) => ({ address: deployment?.launchpad, abi: launchpadAbi, functionName: "poolKeyOf", args: [m.id] }) as const),
    query: { enabled: Boolean(account && deployment) && markets.length > 0 },
  });
  const poolKeys = keys.data?.map((r) => r.result as PoolKey | undefined) ?? [];
  const positions = useReadContracts({
    contracts: poolKeys.flatMap((key) =>
      key ? [{ address: deployment?.liquidityManager, abi: liquidityManagerAbi, functionName: "positionOf", args: [key, holder] } as const] : [],
    ),
    query: { enabled: Boolean(account) && poolKeys.some(Boolean), refetchInterval: 10_000 },
  });

  // Launches this wallet created, and launches using blocks it wrote: both pay into `claimable`.
  const authored = catalog.blocks.filter((b) => account && b.author.toLowerCase() === account.toLowerCase());
  const authoredSet = new Set(authored.map((b) => b.address.toLowerCase()));
  const created = markets.filter((m) => m.isLaunch && account && m.creator.toLowerCase() === account.toLowerCase());
  const royaltyLaunches = markets.filter((m) => m.isLaunch && m.blocks.some((b) => authoredSet.has(b.toLowerCase())));

  const currencies = uniqueCurrencies([...created, ...royaltyLaunches]);
  const balances = useReadContracts({
    contracts: currencies.map(
      (c) => ({ address: deployment?.launchpad, abi: launchpadAbi, functionName: "claimable", args: [holder, c.address] }) as const,
    ),
    query: { enabled: Boolean(account) && currencies.length > 0, refetchInterval: 10_000 },
  });
  const pending = useReadContracts({
    contracts: royaltyLaunches.map((m) => ({ address: deployment?.launchpad, abi: launchpadAbi, functionName: "pendingFees", args: [m.id] }) as const),
    query: { enabled: Boolean(account) && royaltyLaunches.length > 0, refetchInterval: 15_000 },
  });

  async function send(label: string, write: () => Promise<`0x${string}`>, done: string) {
    try {
      setStatus({ busy: label, message: null });
      const hash = await write();
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setStatus({ busy: null, message: done });
      await Promise.all([balances.refetch(), pending.refetch(), positions.refetch()]);
    } catch (error) {
      setStatus({ busy: null, message: friendlyError(error) });
    }
  }

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="Your positions appear here once the contracts are live on this network." />;
  }
  if (!account) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="text-lg font-medium">Connect a wallet to see your positions</p>
        <div className="w-full max-w-xs">
          <WalletGate>{null}</WalletGate>
        </div>
      </div>
    );
  }
  if (isLoading || catalog.isLoading) return <Skeleton className="h-[420px]" />;
  const launchpad = deployment.launchpad;

  // Positions with liquidity, matched back to their markets (only markets with a key were queried).
  let k = 0;
  const lp = markets.flatMap((m, i) => {
    if (!poolKeys[i]) return [];
    const result = positions.data?.[k++]?.result as readonly [bigint, bigint, bigint] | undefined;
    if (!result || result[0] === 0n) return [];
    return [{ market: m, liquidity: result[0], fees0: result[1], fees1: result[2] }];
  });
  const claimables = currencies
    .map((c, i) => ({ ...c, amount: (balances.data?.[i]?.result as bigint | undefined) ?? 0n }))
    .filter((c) => c.amount > 0n);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="lp">
        <h2 id="lp" className="mb-4 text-lg font-medium">
          Liquidity positions
        </h2>
        {lp.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">
            None yet. Add liquidity from any <Link href="/discover" className="underline underline-offset-2">pool page</Link> to
            earn a share of its fees.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lp.map(({ market: m, liquidity, fees0, fees1 }) => {
              const [amount0, amount1] = m.sqrtPriceX96 > 0n ? [(liquidity * Q96) / m.sqrtPriceX96, (liquidity * m.sqrtPriceX96) / Q96] : [0n, 0n];
              const [subjectAmount, quoteAmount] = m.subjectIsCurrency0 ? [amount0, amount1] : [amount1, amount0];
              const [feesSubject, feesQuote] = m.subjectIsCurrency0 ? [fees0, fees1] : [fees1, fees0];
              const quoteValue = Number(formatUnits(quoteAmount, m.quoteDecimals));
              return (
                <li key={m.id.toString()}>
                  <Link href={m.href} className="card flex items-center gap-4 p-5 transition-colors hover:bg-surface-hover">
                    <TokenAvatar src={m.imageURI} seed={m.subject} size={40} label={m.symbol} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {m.symbol} / {m.quoteSymbol}
                      </p>
                      <p className="tabular text-sm text-muted">
                        {formatAmount(Number(formatUnits(subjectAmount, m.subjectDecimals)))} {m.symbol} +{" "}
                        {formatAmount(quoteValue)} {m.quoteSymbol}
                      </p>
                      <p className="tabular text-xs text-subtle">
                        Fees: {formatAmount(Number(formatUnits(feesQuote, m.quoteDecimals)))} {m.quoteSymbol},{" "}
                        {formatAmount(Number(formatUnits(feesSubject, m.subjectDecimals)))} {m.symbol}
                      </p>
                    </div>
                    <span className="tabular text-sm font-medium">
                      ≈ {formatQuoted(quoteValue * 2, m.quoteSymbol, isUsdc(m.quote), "total")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="earnings">
        <h2 id="earnings" className="mb-4 text-lg font-medium">
          Ready to claim
        </h2>
        {claimables.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">
            Nothing waiting. Creator fees and block royalties land here when a launch&apos;s fees are collected.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {claimables.map((c) => (
              <li key={c.address} className="card flex flex-col gap-3 p-5">
                <span className="text-xs text-subtle">{c.symbol}</span>
                <span className="tabular text-xl font-medium">{formatAmount(Number(formatUnits(c.amount, c.decimals)))}</span>
                <WalletGate>
                  <button
                    type="button"
                    className="pill pill-ink pill-sm"
                    disabled={status.busy !== null}
                    onClick={() =>
                      send(
                        `claim-${c.address}`,
                        () => writeContract(wagmiConfig, { address: launchpad, abi: launchpadAbi, functionName: "claim", args: [c.address] }),
                        `${c.symbol} claimed to your wallet.`,
                      )
                    }
                  >
                    {status.busy === `claim-${c.address}` ? "Claiming…" : "Claim"}
                  </button>
                </WalletGate>
              </li>
            ))}
          </ul>
        )}
        {status.message && (
          <p className="mt-3 text-sm text-muted" aria-live="polite">
            {status.message}
          </p>
        )}
      </section>

      <section aria-labelledby="created">
        <h2 id="created" className="mb-4 text-lg font-medium">
          Tokens you launched
        </h2>
        {created.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">
            None yet. <Link href="/build" className="underline underline-offset-2">Launch one</Link> — you keep a share of its
            trading fees.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {created.map((m) => (
              <li key={m.id.toString()}>
                <Link href={m.href} className="card flex items-center gap-3 p-5 transition-colors hover:bg-surface-hover">
                  <TokenAvatar src={m.imageURI} seed={m.subject} size={36} label={m.symbol} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block text-xs text-muted">Collect your fees on the pool page</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {authored.length > 0 && (
        <section aria-labelledby="royalties">
          <h2 id="royalties" className="mb-1 text-lg font-medium">
            Your blocks
          </h2>
          <p className="mb-4 text-sm text-muted">
            Royalties are credited when a launch&apos;s fees are collected. Anyone can trigger it — including you.
          </p>
          <ul className="flex flex-wrap gap-2">
            {authored.map((b) => (
              <li key={b.address}>
                <Link href={`/blocks/${b.address}`} className="panel flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover">
                  <BlockIcon kind={b.kind} size="sm" />
                  {b.metadata?.name ?? b.address} · {b.status}
                </Link>
              </li>
            ))}
          </ul>
          {royaltyLaunches.length > 0 && (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th className="px-5 py-3 font-normal">Launch using your blocks</th>
                    <th className="px-5 py-3 text-right font-normal">Uncollected fees</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {royaltyLaunches.map((m, i) => {
                    const fees = pending.data?.[i]?.result as readonly [bigint, bigint] | undefined;
                    const [feeSubject, feeQuote] = fees ? (m.subjectIsCurrency0 ? [fees[0], fees[1]] : [fees[1], fees[0]]) : [0n, 0n];
                    const any = feeSubject > 0n || feeQuote > 0n;
                    return (
                      <tr key={m.id.toString()} className="border-b border-line last:border-0">
                        <td className="px-5 py-3">
                          <Link href={m.href} className="hover:underline">
                            {m.name} ({m.symbol})
                          </Link>
                        </td>
                        <td className="tabular px-5 py-3 text-right text-muted">
                          {formatAmount(Number(formatUnits(feeQuote, m.quoteDecimals)))} {m.quoteSymbol} ·{" "}
                          {formatAmount(Number(formatUnits(feeSubject, m.subjectDecimals)))} {m.symbol}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            className="pill pill-ghost pill-sm"
                            disabled={!any || status.busy !== null}
                            onClick={() =>
                              send(
                                `collect-${m.id}`,
                                () => writeContract(wagmiConfig, { address: launchpad, abi: launchpadAbi, functionName: "collectFees", args: [m.id] }),
                                "Collected. Your royalty is ready to claim above.",
                              )
                            }
                          >
                            {status.busy === `collect-${m.id}` ? "Collecting…" : "Collect"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Every currency a set of launches can pay out in, once each. */
function uniqueCurrencies(markets: MarketSummary[]) {
  const seen = new Map<string, { address: Address; symbol: string; decimals: number }>();
  for (const m of markets) {
    seen.set(m.subject.toLowerCase(), { address: m.subject, symbol: m.symbol, decimals: m.subjectDecimals });
    seen.set(m.quote.toLowerCase(), { address: m.quote, symbol: m.quoteSymbol, decimals: m.quoteDecimals });
  }
  return [...seen.values()];
}
