"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { arcMainnet } from "@/lib/chains";
import { APP_NAME, chain, deployment } from "@/lib/config";
import { formatFee, formatUsd, shortAddress, timeAgo } from "@/lib/format";
import { useHookInfo } from "@/lib/hooks/useHookInfo";
import { useNow } from "@/lib/hooks/useNow";
import { hookReach, summarizePermissions } from "@/lib/permissions";
import { useHookSource } from "@/lib/hooks/useHookSource";
import { fetchPools } from "@/lib/index-client";
import { HookSearch } from "./HookSearch";
import { HookAbilities } from "./hooks/HookAbilities";
import { ShareCheck } from "./hooks/ShareCheck";
import { SwapPreview } from "./hooks/SwapPreview";
import { Badge, Skeleton, Stat } from "./ui";

/**
 * Everything the address alone and the Arc index reveal about a v4 hook. `focusPoolId` (from a
 * token's list of pools) is shown and picked in the swap preview even when it isn't among the
 * hook's 25 most liquid pools.
 */
export function HookReport({ address, focusPoolId }: { address: Address; focusPoolId?: string }) {
  // Whether its source code is published, and as what; arrives after the page renders.
  const source = useHookSource(address);
  const ours = Boolean(deployment && address.toLowerCase() === deployment.kernel.toLowerCase());
  // This platform's kernel may only exist on the app's network (testnet/local) so far.
  const readOnAppChain = ours && chain.id !== arcMainnet.id;
  const info = useHookInfo(address, readOnAppChain);
  const now = useNow();
  const stats = info.stats?.hook;
  const listed = info.stats?.pools ?? [];
  const missing = Boolean(focusPoolId && info.stats && !listed.some((p) => p.id === focusPoolId));
  const focus = useQuery({
    queryKey: ["pool", focusPoolId],
    queryFn: () => fetchPools([focusPoolId!]),
    enabled: missing,
    staleTime: 60_000,
  });
  const pools = missing && focus.data?.[0] ? [focus.data[0], ...listed] : listed;
  const network = readOnAppChain ? chain.name : arcMainnet.name;
  const explorer = readOnAppChain ? chain.blockExplorers?.default.url : arcMainnet.blockExplorers.default.url;

  return (
    <div className="pt-12">
      <div className="max-w-2xl">
        <HookSearch />
      </div>

      <header className="mt-10 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="eyebrow">Hook reader</p>
          {source?.published ? (
            <>
              <h1 className="headline mt-2 text-[2rem] break-all">{source.name}</h1>
              <p className="mt-1 font-mono text-sm break-all text-muted">{address}</p>
            </>
          ) : (
            <h1 className="mt-2 font-mono text-lg break-all sm:text-xl">{address}</h1>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ours && <Badge tone="good">{APP_NAME} kernel</Badge>}
            {source && (source.published ? <Badge tone="good">Source code published</Badge> : <Badge tone="warn">Source code not published</Badge>)}
            {info.codeLoading ? (
              <Badge>Reading bytecode…</Badge>
            ) : info.hasCode ? (
              <Badge>
                {info.codeSize.toLocaleString("en-US")} bytes on {network}
              </Badge>
            ) : (
              <Badge tone="bad">No contract on {network}</Badge>
            )}
            {explorer && (
              <a
                className="text-xs text-muted underline underline-offset-2 hover:text-text"
                href={`${explorer}/address/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                Explorer
              </a>
            )}
          </div>
        </div>
      </header>

      {source && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          {source.published ? (
            <>
              Its code is published on Arc Explorer as <span className="font-medium text-text">{source.name}</span>
              {source.exact ? "" : " (a close match)"}, so anyone can read what it does. A contract&apos;s name is chosen by
              whoever deployed it: it tells you what the code is called, not who runs it.
            </>
          ) : (
            "We couldn't find its source code, so nobody outside its team can check what it does beyond what its address allows (below)."
          )}
          {explorer && (
            <>
              {" "}
              <a className="underline underline-offset-2 hover:text-text" href={`${explorer}/address/${address}?tab=contract`} target="_blank" rel="noreferrer">
                {source.published ? "Read the code" : "Check on Arc Explorer"}
              </a>
            </>
          )}
        </p>
      )}

      <p className="mt-6 max-w-3xl text-lg leading-relaxed">{summarizePermissions(address)}</p>

      <div className="mt-4">
        <ShareCheck
          path={`/hooks/${address}`}
          badgeAddress={address}
          text={`${source?.published ? source.name : shortAddress(address)}: ${hookReach(address).label}. That's what this Uniswap v4 hook's address allows on Arc, not what it does.`}
        />
      </div>

      {ours && (
        <section className="organic mt-6 rounded-[var(--radius-card)] p-6 text-white">
          <h2 className="text-lg font-medium">This is the hook every {APP_NAME} pool runs on</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-white/85">
            It doesn&apos;t decide fees itself: it asks each pool&apos;s frozen stack of blocks, then caps what they ask for —
            at most 50% in a pool&apos;s first 15 minutes and 10% after, burns at most 5%. Blocks that fail are skipped. It
            can&apos;t refuse liquidity withdrawals.
          </p>
          <Link href="/blocks" className="pill mt-4 bg-white text-ink hover:bg-white/90">
            See the blocks
          </Link>
        </section>
      )}

      <HookAbilities address={address} hasPools={pools.length > 0} />

      <section aria-labelledby="usage-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="usage-heading" className="text-lg font-medium">
            Usage on Arc mainnet
          </h2>
          {info.stats && now > 0 && <span className="text-xs text-subtle">Indexed {timeAgo(info.stats.indexedAt, now)}</span>}
        </div>
        {info.statsLoading ? (
          <Skeleton className="mt-4 h-[120px]" />
        ) : info.statsError ? (
          <p className="mt-4 text-sm text-muted">The Arc v4 index didn&apos;t answer. Try again in a minute.</p>
        ) : !stats ? (
          <p className="mt-4 text-sm text-muted">No pool on Arc mainnet uses this hook yet.</p>
        ) : (
          <>
            <dl className="card mt-4 grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
              <Stat label="Pools" value={stats.poolCount} />
              <Stat label="Swaps" value={Number(stats.txCount).toLocaleString("en-US")} />
              <Stat label="Volume" value={formatUsd(Number(stats.volumeUSD))} />
              <Stat label="Liquidity" value={formatUsd(Number(stats.totalValueLockedUSD))} />
            </dl>
            {pools.length > 0 && (
              <div className="card mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-subtle">
                      <th className="px-5 py-3 font-normal">Pair</th>
                      <th className="px-5 py-3 font-normal">Fee</th>
                      <th className="px-5 py-3 text-right font-normal">Volume</th>
                      <th className="px-5 py-3 text-right font-normal">Liquidity</th>
                      <th className="px-5 py-3 text-right font-normal">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((pool) => (
                      <tr key={pool.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3">
                          {pool.token0.symbol} / {pool.token1.symbol}
                          <span className="ml-2 font-mono text-xs text-subtle">{shortAddress(pool.id)}</span>
                        </td>
                        <td className="tabular px-5 py-3">
                          {/* 0x800000 marks a dynamic-fee pool: the hook sets the fee per trade. */}
                          {Number(pool.feeTier) === 0x800000 ? "Dynamic" : formatFee(Number(pool.feeTier))}
                        </td>
                        <td className="tabular px-5 py-3 text-right">{formatUsd(Number(pool.volumeUSD))}</td>
                        <td className="tabular px-5 py-3 text-right">{formatUsd(Number(pool.totalValueLockedUSD))}</td>
                        <td className="px-5 py-3 text-right text-muted">
                          {now > 0 ? timeAgo(Number(pool.createdAtTimestamp), now) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pools.length > 0 && (
              // Keyed so the preview starts over on the focused pool once it has loaded.
              <SwapPreview key={pools[0].id} hook={address} pools={pools} initialPoolId={focusPoolId} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
