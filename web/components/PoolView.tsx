"use client";

import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { blockKind, type CatalogBlock } from "@/lib/blocks";
import { chain, deployment, explorerAddressUrl, explorerCodeUrl, isUsdc } from "@/lib/config";
import { formatAmount, formatFee, formatQuoted, shortAddress, timeAgo } from "@/lib/format";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useMarket } from "@/lib/hooks/useMarket";
import { useNow } from "@/lib/hooks/useNow";
import { AddToWallet } from "./AddToWallet";
import { CreatorPanel } from "./CreatorPanel";
import { LiquidityPanel } from "./LiquidityPanel";
import { LiveFees } from "./LiveFees";
import { PoolActivity } from "./pool/PoolActivity";
import { RulesPanel } from "./RulesPanel";
import { TokenAvatar } from "./TokenAvatar";
import { TradePanel } from "./TradePanel";
import { Badge, EmptyState, Skeleton, Stat } from "./ui";

/** One pool: who it's for, what its rules are, and everything you can do in it. */
export function PoolView({
  id,
  others = [],
}: {
  id: bigint;
  /** The same token's other markets here, with their page paths. */
  others?: { id: number; path: string }[];
}) {
  const detail = useMarket(id);
  const catalog = useCatalog();
  const now = useNow();
  const { market, metadata, config } = detail;

  if (!deployment) {
    return (
      <div className="pt-14">
        <EmptyState title="Not deployed yet" body="Pools appear here once the contracts are live on this network." />
      </div>
    );
  }
  if (detail.notFound) {
    return (
      <div className="pt-14">
        <EmptyState title="Pool not found" body="It may be on another network." action={{ href: "/discover", label: "Discover pools" }} />
      </div>
    );
  }
  if (!market || !config) {
    return (
      <div className="grid gap-6 pt-12 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[480px]" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const usd = isUsdc(market.quote);
  const quoted = (value: number, style?: "price" | "total") => formatQuoted(value, detail.quoteSymbol, usd, style);
  const burned = Number(formatUnits(detail.burned, detail.subjectDecimals));

  return (
    <div className="pt-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <TokenAvatar src={metadata?.imageURI} seed={market.subject} size={64} label={detail.symbol} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.75rem] font-medium tracking-tight">{detail.name || "…"}</h1>
              {market.isLaunch ? <Badge>Launched here</Badge> : <Badge tone="good">Existing token</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {detail.symbol} / {detail.quoteSymbol} · {market.isLaunch ? "created" : "market opened"} by{" "}
              <Link href={`/creators/${market.creator}`} className="font-mono text-xs underline-offset-2 hover:underline">
                {shortAddress(market.creator)}
              </Link>{" "}
              · {now > 0 ? timeAgo(Number(market.createdAt), now) : ""}
            </p>
            {others.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                {detail.symbol} has {others.length === 1 ? "another market" : `${others.length} other markets`} here, with different rules:{" "}
                {others.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    <Link href={o.path} className="underline underline-offset-2 hover:text-text">
                      market {o.id}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <AddToWallet
              address={market.subject}
              symbol={detail.symbol}
              decimals={detail.subjectDecimals}
              image={metadata?.imageURI}
              className="mt-3"
            />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
          <Stat label="Price" value={quoted(detail.price)} />
          <Stat label="Fully diluted value" value={quoted(detail.fdv, "total")} />
          {market.isLaunch && detail.poolQuote !== undefined ? (
            <Stat label={`${detail.quoteSymbol} in the pool`} value={quoted(detail.poolQuote, "total")} />
          ) : (
            <Stat label="Base fee" value={formatFee(config.baseFee)} />
          )}
          <Stat label="Burned" value={burned > 0 ? `${formatAmount(burned)} ${detail.symbol}` : "None yet"} />
        </dl>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PoolActivity
            poolId={market.poolId}
            subjectIsCurrency0={market.subjectIsCurrency0}
            symbol={detail.symbol}
            quoteSymbol={detail.quoteSymbol}
            isUsd={usd}
          />
          <LiveFees
            fees={detail.fees}
            baseFee={config.baseFee}
            feeCap={detail.feeCap}
            openedAt={config.openedAt}
            blocks={detail.blocks}
            configs={detail.configs}
            states={detail.states}
          />
          <RulesPanel
            baseFee={config.baseFee}
            blocks={detail.blocks}
            configs={detail.configs}
            isLaunch={market.isLaunch}
            catalog={catalog.byAddress}
            royalties={detail.royalties}
          />
          {market.isLaunch && (metadata?.description || metadata?.website) && (
            <section className="card p-6" aria-label="About">
              <h2 className="text-lg font-medium">About {detail.symbol}</h2>
              {metadata.description && <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{metadata.description}</p>}
              {safeUrl(metadata.website) && (
                <a className="mt-3 inline-block text-sm underline underline-offset-2" href={safeUrl(metadata.website)} target="_blank" rel="noreferrer noopener">
                  {metadata.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </section>
          )}
          <section className="card p-6" aria-label="Contracts">
            <h2 className="text-lg font-medium">Under the hood</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Row label={market.isLaunch ? "Token" : "Subject token"} value={<AddressLink address={market.subject} />} />
              <Row label="Quote token" value={<AddressLink address={market.quote} />} />
              <Row
                label="Hook"
                value={
                  <Link href={`/hooks/${deployment.kernel}`} className="font-mono text-xs hover:underline">
                    {shortAddress(deployment.kernel)} · read it
                  </Link>
                }
              />
              <Row label="Tick spacing" value={market.tickSpacing} />
              <Row label="Pool id" value={<span className="font-mono text-xs break-all">{market.poolId}</span>} />
              {deployment.sourceVerified && (
                <Row wide label="Source code" value={<VerifiedSource kernel={deployment.kernel} blocks={detail.blocks} catalog={catalog.byAddress} />} />
              )}
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <CreatorPanel detail={detail} marketId={id} />
          <TradePanel detail={detail} />
          <LiquidityPanel detail={detail} />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`panel p-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

/** Links to the explorer's verified source for the kernel and this pool's native blocks (community blocks aren't covered). */
function VerifiedSource({ kernel, blocks, catalog }: { kernel: Address; blocks: readonly Address[]; catalog: Map<string, CatalogBlock> }) {
  const contracts = [
    { label: "Hook kernel", address: kernel },
    ...blocks
      .filter((address) => blockKind(address) !== "custom")
      .map((address) => ({ label: catalog.get(address.toLowerCase())?.metadata?.name ?? shortAddress(address), address })),
  ];
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-buy">
        <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="currentColor">
          <circle cx="8" cy="8" r="7.5" />
          <path d="m4.9 8.2 2 2 4.2-4.4" fill="none" stroke="var(--panel)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Verified on {chain.blockExplorers?.default.name ?? "the explorer"}, exact match
      </span>
      {contracts.map(({ label, address }) => (
        <a key={address} href={explorerCodeUrl(address)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          {label} ↗
        </a>
      ))}
    </span>
  );
}

function AddressLink({ address }: { address: string }) {
  const href = explorerAddressUrl(address);
  return href ? (
    <a className="font-mono text-xs hover:underline" href={href} target="_blank" rel="noreferrer">
      {shortAddress(address)}
    </a>
  ) : (
    <span className="font-mono text-xs">{shortAddress(address)}</span>
  );
}

/** Creator-supplied links: only plain http(s) URLs are rendered as links. */
function safeUrl(value: string | undefined) {
  if (!value) return undefined;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(url).protocol.startsWith("http") ? url : undefined;
  } catch {
    return undefined;
  }
}
