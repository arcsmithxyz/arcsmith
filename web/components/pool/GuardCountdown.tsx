"use client";

import { guardPremiumAt } from "@/lib/blocks";
import { formatBps, formatCountdown, formatFee } from "@/lib/format";
import { BlockIcon } from "../BlockIcon";

/**
 * While a pool's Launch guard runs: how long is left, and the extra buy fee falling second by
 * second (the same straight line GuardBlock computes on-chain). Disappears when the guard ends.
 */
export function GuardCountdown({
  openedAt,
  settings,
  now,
}: {
  openedAt: number;
  settings: { premium: number; duration: number; maxBuyBps: number };
  /** Unix seconds; 0 before the page has hydrated. */
  now: number;
}) {
  const elapsed = now - openedAt;
  if (now === 0 || elapsed < 0 || elapsed >= settings.duration) return null;
  const left = settings.duration - elapsed;
  const extra = guardPremiumAt(settings, elapsed);

  return (
    <div className="mt-4 rounded-[14px] border border-warn/25 bg-warn-soft p-4" role="timer" aria-live="off">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-warn">
          <BlockIcon kind="guard" size="sm" />
          Launch guard
        </span>
        <span className="tabular text-sm font-medium text-text">Ends in {formatCountdown(left)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden>
        <div className="h-full rounded-full bg-warn transition-[width] duration-1000 ease-linear" style={{ width: `${(left / settings.duration) * 100}%` }} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text">
        Extra buy fee right now <span className="tabular font-semibold">+{formatFee(extra)}</span>, falling to zero as the guard
        runs out.
        {settings.maxBuyBps > 0 && ` Each buy is capped at ${formatBps(settings.maxBuyBps)} of the supply.`} No outside
        liquidity until it ends.
      </p>
    </div>
  );
}
