"use client";

import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { usePlatformStats } from "@/lib/hooks/usePlatformStats";
import { CountUp } from "../motion/CountUp";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const compactUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

type Stat = { label: string; value: number | null; format: (n: number) => string };

function StatGrid({ stats, tone }: { stats: Stat[]; tone: "light" | "dark" }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <dt className={`order-2 mt-1 font-serif text-sm ${tone === "dark" ? "text-on-ink/70" : "text-muted"}`}>{s.label}</dt>
          <dd className={`order-1 text-4xl font-medium tracking-tight sm:text-5xl ${tone === "dark" ? "text-on-ink" : "text-ink"}`}>
            {s.value === null ? "…" : <CountUp value={s.value} format={s.format} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Two panels: Arcsmith's own numbers (live, from the chain and the index), and the size of
 * Uniswap v4 on Arc overall, which is the market Arcsmith builds for.
 */
export function PlatformStats() {
  const s = usePlatformStats();
  const loading = s.isLoading;

  const ours: Stat[] = [
    { label: "Pools on Arcsmith", value: loading ? null : s.pools, format: whole },
    { label: "Tokens launched", value: loading ? null : s.launches, format: whole },
    { label: "Swaps", value: s.fromIndex ? s.swaps : null, format: whole },
    { label: "Blocks to build with", value: loading ? null : s.blocks, format: whole },
  ];
  const arc: Stat[] = [
    { label: "Uniswap v4 pools", value: s.arc?.pools ?? null, format: compact },
    { label: "Hooks with pools", value: s.arc?.hooks ?? null, format: (n) => (s.arc?.hooksCapped ? `${whole(n)}+` : whole(n)) },
    { label: "Swaps", value: s.arc?.swaps ?? null, format: compact },
    { label: "Liquidity", value: s.arc?.liquidityUSD ?? null, format: compactUsd },
  ];

  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 px-4 sm:px-6 lg:grid-cols-2">
      <section aria-label="Arcsmith numbers" className="flex flex-col justify-between gap-10 rounded-[32px] border border-ink/10 bg-panel/80 p-8 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="chip text-ink">Arcsmith</span>
          <span className="flex items-center gap-2 font-serif text-sm text-muted">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-buy/60" />
              <span className="relative inline-flex size-2 rounded-full bg-buy" />
            </span>
            Live on Arc mainnet
          </span>
        </div>
        <StatGrid stats={ours} tone="light" />
        <p className="border-t border-line pt-4 font-serif text-sm text-muted">
          {s.fromIndex ? (
            <>
              Liquidity <span className="tabular text-ink">{formatUsd(s.liquidityUSD)}</span> · Volume{" "}
              <span className="tabular text-ink">{formatUsd(s.volumeUSD)}</span> · early days, every number is real.
            </>
          ) : (
            "Swaps, liquidity and volume are tracked on mainnet only."
          )}
        </p>
      </section>

      <section aria-label="Uniswap v4 on Arc" className="organic flex flex-col justify-between gap-10 rounded-[32px] p-8 text-on-ink">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="chip text-on-ink/90">Uniswap v4 on Arc</span>
          <span className="font-serif text-sm text-on-ink/70">The market Arcsmith builds for</span>
        </div>
        <StatGrid stats={arc} tone="dark" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 font-serif text-sm text-on-ink/70">
          <span>Source: community Arc v4 index</span>
          <Link href="/discover?tab=popular" className="text-on-ink underline underline-offset-4 transition-colors hover:text-accent">
            See the busiest hooked pools →
          </Link>
        </div>
      </section>
    </div>
  );
}
