"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import { MarketCard } from "@/components/MarketCard";
import { EmptyState, Skeleton } from "@/components/ui";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { arcMainnet } from "@/lib/chains";
import { chain, deployment, explorerAddressUrl, isUsdc, USDC_DECIMALS } from "@/lib/config";
import { formatAmount, formatBps, formatUsd } from "@/lib/format";
import { useMarkets, type MarketSummary } from "@/lib/hooks/useMarkets";
import { useNow } from "@/lib/hooks/useNow";
import { fetchPools } from "@/lib/index-client";

/**
 * One creator's pools and what they've earned: lifetime activity from the Arc index
 * (mainnet), and fees waiting to be claimed, read from the Launchpad.
 */
export function CreatorView({ address }: { address: Address }) {
  const { markets, isLoading } = useMarkets({ creator: address });
  const now = useNow();
  const launches = markets.filter((m) => m.isLaunch);
  const indexed = chain.id === arcMainnet.id;

  const stats = useQuery({
    queryKey: ["creator-pools", markets.map((m) => m.poolId).join(",")],
    queryFn: () => fetchPools(markets.map((m) => m.poolId)),
    enabled: indexed && markets.length > 0,
    staleTime: 60_000,
  });
  const byPool = new Map((stats.data ?? []).map((p) => [p.id.toLowerCase(), p]));
  const volume = markets.reduce((sum, m) => sum + Number(byPool.get(m.poolId.toLowerCase())?.volumeUSD ?? 0), 0);
  // Launch fees are split at collection: the creator keeps (1 − protocol share). Exact while the
  // launch position is the pool's only liquidity, which it is unless others add some. Open
  // markets pay their LPs, not the creator, so they don't count.
  const launchFees = launches.reduce((sum, m) => sum + Number(byPool.get(m.poolId.toLowerCase())?.feesUSD ?? 0), 0);
  const launchEarnings = launches.reduce((sum, m) => {
    const poolFees = Number(byPool.get(m.poolId.toLowerCase())?.feesUSD ?? 0);
    return sum + (poolFees * (10_000 - m.protocolShareBps)) / 10_000;
  }, 0);

  const unclaimed = useUnclaimed(address, launches);
  const websites = [...new Set(launches.map((m) => m.website).filter(Boolean))];
  const explorer = explorerAddressUrl(address);

  return (
    <div className="pt-14">
      <header>
        <p className="eyebrow">Creator</p>
        <h1 className="mt-3 font-mono text-xl break-all text-ink sm:text-2xl">{address}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
              Explorer
            </a>
          )}
          {websites.map((site) => (
            <a key={site} href={safeUrl(site)} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
              {site.replace(/^https?:\/\//, "")}
            </a>
          ))}
        </div>
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-line bg-line lg:grid-cols-5">
        <Tile label="Pools created" value={isLoading ? "…" : String(markets.length)} />
        <Tile label="Tokens launched" value={isLoading ? "…" : String(launches.length)} />
        <Tile label="Volume in their pools" value={indexed ? (stats.isLoading ? "…" : formatUsd(volume)) : "Mainnet only"} />
        <Tile
          label="Earned from launches"
          value={indexed ? (stats.isLoading ? "…" : formatUsd(launchEarnings)) : "Mainnet only"}
          hint={
            launches.length > 0
              ? `Their ${formatBps(10_000 - (launches[0]?.protocolShareBps ?? 0))} of ${formatUsd(launchFees)} in launch-pool fees`
              : undefined
          }
        />
        <Tile label="Waiting to be claimed" value={formatUsd(unclaimed.usdc)} hint={unclaimed.tokens.length > 0 ? unclaimed.tokens.join(" · ") : undefined} />
      </dl>

      <section aria-labelledby="creator-pools" className="mt-16">
        <h2 id="creator-pools" className="headline mb-6 text-[1.75rem]">
          Pools
        </h2>
        {!deployment ? (
          <EmptyState title="Not deployed yet" body="Pools appear here once the contracts are live on this network." />
        ) : isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[196px]" />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <EmptyState title="No pools yet" body="This address hasn't created a pool here." action={{ href: "/build", label: "Launch token" }} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.id.toString()} market={m} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col bg-panel p-6">
      <dt className="order-2 mt-1 font-serif text-sm text-muted">{label}</dt>
      <dd className="order-1 text-3xl font-medium tracking-tight text-ink">{value}</dd>
      {hint && <dd className="order-3 mt-1 text-xs text-subtle">{hint}</dd>}
    </div>
  );
}

/**
 * What the creator could claim right now: balances already credited to them, plus their share
 * of each launch's fees that nobody has collected yet.
 */
function useUnclaimed(creator: Address, launches: MarketSummary[]) {
  const launchpad = deployment?.launchpad;
  const currencies = [...new Set(launches.flatMap((m) => [m.subject, m.quote]))];
  const credited = useReadContracts({
    contracts: currencies.map((currency) => ({
      address: launchpad,
      abi: launchpadAbi,
      functionName: "claimable",
      args: [creator, currency],
    }) as const),
    query: { enabled: Boolean(launchpad) && currencies.length > 0, refetchInterval: 15_000 },
  });
  const pending = useReadContracts({
    contracts: launches.map((m) => ({ address: launchpad, abi: launchpadAbi, functionName: "pendingFees", args: [m.id] }) as const),
    query: { enabled: Boolean(launchpad) && launches.length > 0, refetchInterval: 15_000 },
  });

  const totals = new Map<string, bigint>();
  const add = (currency: string, amount: bigint) => totals.set(currency.toLowerCase(), (totals.get(currency.toLowerCase()) ?? 0n) + amount);
  currencies.forEach((currency, i) => add(currency, (credited.data?.[i]?.result as bigint | undefined) ?? 0n));
  launches.forEach((m, i) => {
    const result = pending.data?.[i]?.result as readonly [bigint, bigint] | undefined;
    if (!result) return;
    const [amountSubject, amountQuote] = m.subjectIsCurrency0 ? [result[0], result[1]] : [result[1], result[0]];
    const share = (amount: bigint) => (amount * BigInt(10_000 - m.protocolShareBps)) / 10_000n;
    add(m.subject, share(amountSubject));
    add(m.quote, share(amountQuote));
  });

  let usdc = 0;
  const tokens: string[] = [];
  for (const [currency, amount] of totals) {
    if (amount === 0n) continue;
    if (isUsdc(currency)) {
      usdc += Number(formatUnits(amount, USDC_DECIMALS));
      continue;
    }
    const market = launches.find((m) => m.subject.toLowerCase() === currency);
    if (market) tokens.push(`${formatAmount(Number(formatUnits(amount, market.subjectDecimals)))} ${market.symbol}`);
  }
  return { usdc, tokens };
}

/** Creator-supplied links: only plain http(s) URLs are rendered. */
function safeUrl(value: string) {
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(url).protocol.startsWith("http") ? url : undefined;
  } catch {
    return undefined;
  }
}
