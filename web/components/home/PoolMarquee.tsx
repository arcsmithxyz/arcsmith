"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatFee, formatUsd } from "@/lib/format";
import { fetchHookedPools } from "@/lib/index-client";
import { TokenAvatar } from "../TokenAvatar";

// The index always describes mainnet, independently of the app's trading network.
const USDC = "0x3600000000000000000000000000000000000000";
const DYNAMIC_FEE = 0x800000;

/**
 * Tokens from hooked v4 pools across Arc mainnet, including other platforms. Pick each
 * token's most liquid indexed pool once. Duplicate the row for a seamless, pausable loop.
 */
export function PoolMarquee() {
  const pools = useQuery({
    queryKey: ["hooked-pools", "totalValueLockedUSD", 100],
    queryFn: () => fetchHookedPools("totalValueLockedUSD", 100),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (pools.isLoading) return <div className="h-16" aria-hidden />;

  const seen = new Set<string>();
  const row = [];
  for (const pool of pools.data ?? []) {
    const liquidity = Number(pool.totalValueLockedUSD);
    if (!Number.isFinite(liquidity) || liquidity <= 0) continue;
    // USDC is the quote when present; otherwise retain the index's token ordering.
    const [token, quote] = pool.token0.id.toLowerCase() === USDC
      ? [pool.token1, pool.token0]
      : [pool.token0, pool.token1];
    const address = token.id.toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    row.push({ pool, token, quote, liquidity });
    if (row.length === 12) break;
  }

  if (row.length === 0) {
    return (
      <p className="text-center font-serif text-lg text-muted">
        {pools.isError ? "The Arc pool index is temporarily unavailable." : "No hooked pools with liquidity indexed yet."}{" "}
        <Link href="/discover?tab=popular" className="text-ink underline underline-offset-4">
          Explore pools on Arc
        </Link>
        .
      </p>
    );
  }

  // Long enough to fill wide screens even with a handful of pools.
  const loop = row.length < 6 ? [...row, ...row, ...row] : row;

  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <ul
        className="flex w-max gap-3 group-hover:[animation-play-state:paused]"
        style={{ animation: `marquee ${loop.length * 5}s linear infinite` }}
      >
        {[0, 1].map((copy) =>
          loop.map(({ pool, token, quote, liquidity }, i) => (
            <li key={`${copy}-${i}`} aria-hidden={copy === 1 || undefined}>
              <Link
                href={`/hooks/${pool.hooks}`}
                tabIndex={copy === 1 ? -1 : undefined}
                className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-panel/70 py-2 pr-5 pl-2 backdrop-blur-sm transition-[background-color,border-color] duration-300 ease-spring hover:border-ink/20 hover:bg-panel"
              >
                <TokenAvatar seed={token.id} size={36} label={token.symbol} />
                <span className="font-medium">{token.symbol} / {quote.symbol}</span>
                <span className="tabular text-sm text-muted">{formatUsd(liquidity)} liquidity</span>
                <span className="tabular text-sm text-muted" title="Fee recorded by the index for the most recent swap; hooks may charge additional fees.">
                  {Number(pool.feeTier) === DYNAMIC_FEE ? "Dynamic fee" : `${formatFee(Number(pool.feeTier))} last fee`}
                </span>
              </Link>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}
