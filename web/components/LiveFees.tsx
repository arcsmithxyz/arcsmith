"use client";

import type { Address, Hex } from "viem";
import { blockKind, damperPressure, guardSettings } from "@/lib/blocks";
import { formatCountdown, formatFee } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { GuardCountdown } from "./pool/GuardCountdown";

type Props = {
  fees?: { buyFee: number; sellFee: number };
  baseFee?: number;
  feeCap: number;
  openedAt?: number;
  blocks: readonly Address[];
  configs: readonly Hex[];
  states: readonly Hex[];
};

const OPENING_WINDOW = 15 * 60;

/** What a small trade pays right now, straight from HookKernel.previewFees. */
export function LiveFees({ fees, baseFee, feeCap, openedAt, blocks, configs, states }: Props) {
  const now = useNow();
  if (!fees || baseFee === undefined) return <div className="panel h-[176px] animate-pulse" aria-hidden />;

  const openingLeft = openedAt ? openedAt + OPENING_WINDOW - now : 0;
  const damperIndex = blocks.findIndex((b) => blockKind(b) === "damper");
  const pressure = damperIndex >= 0 && now > 0 ? damperPressure(states[damperIndex], now) : null;
  const guardIndex = blocks.findIndex((b) => blockKind(b) === "guard");
  const guard = guardIndex >= 0 && configs[guardIndex] ? guardSettings(configs[guardIndex]) : null;
  const buyRaised = fees.buyFee > baseFee;
  const sellRaised = fees.sellFee > baseFee;

  return (
    <section className="panel p-5" aria-label="Live fees">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Fees right now</h2>
        <span className="flex items-center gap-1.5 text-xs text-subtle">
          <span className="size-1.5 animate-pulse rounded-full bg-buy" aria-hidden />
          Live from the kernel
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-subtle">Buy</dt>
          <dd className={`tabular text-2xl font-medium ${buyRaised ? "text-warn" : ""}`}>{formatFee(fees.buyFee)}</dd>
          <dd className="mt-0.5 text-xs text-muted">{buyRaised ? "Raised by this pool's rules" : "Base fee"}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Sell</dt>
          <dd className={`tabular text-2xl font-medium ${sellRaised ? "text-sell" : ""}`}>{formatFee(fees.sellFee)}</dd>
          <dd className="mt-0.5 text-xs text-muted">{sellRaised ? "Raised by recent selling" : "Base fee"}</dd>
        </div>
      </dl>
      {guard && openedAt !== undefined && <GuardCountdown openedAt={openedAt} settings={guard} now={now} />}
      {pressure !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-subtle">
            <span>Net sell pressure</span>
            <span className="tabular">{((pressure / 1_000_000) * 100).toFixed(1)}% of depth</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="meter" aria-label="Net sell pressure" aria-valuemin={0} aria-valuemax={1_000_000} aria-valuenow={pressure}>
            <div className="h-full rounded-full bg-sell transition-[width] duration-700" style={{ width: `${Math.min(100, (pressure / 300_000) * 100)}%` }} />
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Big trades can pay more than shown. Cap for any trade: {formatFee(feeCap)}
        {openingLeft > 0 && now > 0 && ` (opening window, ${formatCountdown(openingLeft)} left; then 10%)`}.
      </p>
    </section>
  );
}
