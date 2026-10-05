"use client";

import Link from "next/link";
import { blockKind } from "@/lib/blocks";
import { isUsdc } from "@/lib/config";
import { formatFee, formatQuoted, timeAgo } from "@/lib/format";
import type { MarketSummary } from "@/lib/hooks/useMarkets";
import { BlockIcon } from "./BlockIcon";
import { TokenAvatar } from "./TokenAvatar";
import { Badge } from "./ui";

/** A pool in a grid: token, lane, price, live fees and the blocks that run it. */
export function MarketCard({ market, now }: { market: MarketSummary; now: number }) {
  const usd = isUsdc(market.quote);
  return (
    <Link href={market.href} className="card group flex flex-col gap-5 p-5 transition-colors hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenAvatar src={market.imageURI} seed={market.subject} size={44} label={market.symbol} />
          <div className="min-w-0">
            <p className="truncate font-medium">{market.name || "…"}</p>
            <p className="text-sm text-muted">
              {market.symbol} / {market.quoteSymbol}
            </p>
          </div>
        </div>
        {market.isLaunch ? <Badge>Launch</Badge> : <Badge tone="good">Existing token</Badge>}
      </div>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-subtle">Price</dt>
          <dd className="tabular mt-0.5">{formatQuoted(market.price, market.quoteSymbol, usd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Buy fee</dt>
          <dd className="tabular mt-0.5">{formatFee(market.buyFee)}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Sell fee</dt>
          <dd className="tabular mt-0.5">{formatFee(market.sellFee)}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-label="Blocks">
          {market.blocks.length === 0 ? (
            <span className="text-xs text-subtle">Base fee only</span>
          ) : (
            market.blocks.map((b) => <BlockIcon key={b} kind={blockKind(b)} size="sm" />)
          )}
        </div>
        <span className="text-xs text-subtle">{now > 0 ? timeAgo(market.createdAt, now) : ""}</span>
      </div>
    </Link>
  );
}
