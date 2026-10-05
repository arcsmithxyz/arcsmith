"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { zeroHash, type Address, type Hex } from "viem";
import { ruleBlockAbi } from "@/lib/abi/BaseBlock";

/** Trade sizes previewed, as ppm of the pool's depth in the input currency (0–60%). */
export const PREVIEW_SIZES = [0, 10_000, 25_000, 50_000, 100_000, 200_000, 300_000, 450_000, 600_000];

/** Mirrors HookKernel's caps. */
const MAX_OPENING_FEE = 500_000;
const MAX_FEE = 100_000;
const OPENING_WINDOW = 15 * 60;

export type StackItem = { address: Address; config: Hex };

export type FeeCurves = {
  /** Buys in the first second after the pool opens (launch guard at full strength). */
  buyAtOpen: number[];
  /** Buys once the opening window is over. */
  buyLater: number[];
  /** A single sell of that size into a quiet pool (no earlier sell pressure). */
  sell: number[];
};

/**
 * Asks each block in a stack what it would add to the fee for trades of different sizes,
 * then applies the kernel's rules (base fee + additions, capped). Blocks are view-only, so
 * this is plain eth_calls against the real block contracts — third-party blocks included.
 */
export function useFeePreview(baseFee: number, stack: StackItem[], isLaunch: boolean) {
  // A fixed "open" instant keeps the query key stable across renders.
  const openedAt = useMemo(() => Math.floor(Date.now() / 60_000) * 60, []);

  const scenarios = useMemo(
    () => [
      { key: "buyAtOpen" as const, isBuy: true, timestamp: openedAt },
      { key: "buyLater" as const, isBuy: true, timestamp: openedAt + OPENING_WINDOW },
      { key: "sell" as const, isBuy: false, timestamp: openedAt + OPENING_WINDOW },
    ],
    [openedAt],
  );

  const contracts = scenarios.flatMap((s) =>
    PREVIEW_SIZES.flatMap((impactPpm) =>
      stack.map(
        (item) =>
          ({
            address: item.address,
            abi: ruleBlockAbi,
            functionName: "beforeSwap",
            args: [
              {
                poolId: zeroHash,
                isBuy: s.isBuy,
                exactInput: true,
                amount: 0n,
                impactPpm: BigInt(impactPpm),
                subjectAmount: 0n,
                openedAt,
                timestamp: s.timestamp,
                subjectSupply: 10n ** 27n,
                isLaunch,
              },
              item.config,
              zeroHash,
            ],
          }) as const,
      ),
    ),
  );

  const result = useReadContracts({ contracts, query: { enabled: stack.length > 0 } });

  const curves: FeeCurves = { buyAtOpen: [], buyLater: [], sell: [] };
  let k = 0;
  for (const s of scenarios) {
    const cap = s.timestamp < openedAt + OPENING_WINDOW ? MAX_OPENING_FEE : MAX_FEE;
    for (let size = 0; size < PREVIEW_SIZES.length; size++) {
      let fee = baseFee;
      for (let b = 0; b < stack.length; b++, k++) {
        const r = result.data?.[k];
        // A block that reverts is skipped by the kernel, so it adds nothing here either.
        if (r?.status === "success") fee += Number((r.result as readonly [number, boolean, Hex])[0]);
      }
      curves[s.key].push(Math.min(fee, cap));
    }
  }
  if (stack.length === 0) {
    for (const s of scenarios) curves[s.key] = PREVIEW_SIZES.map(() => baseFee);
  }

  return { curves, isLoading: result.isLoading && stack.length > 0 };
}
