"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { Tabs } from "@/components/ui";
import { formatAmount, formatFee, formatUsd } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/useDebounced";
import type { SubgraphPool } from "@/lib/subgraph";
import { ARC_V4, DYNAMIC_FEE_FLAG, poolIdOf, rebuildPoolKey, stateViewAbi } from "@/lib/uniswap";
import { HookSwap } from "./HookSwap";
import { mainnet, quoteExactIn } from "./quote";

const Q96 = 2 ** 96;

type Direction = "0to1" | "1to0";

type Quote =
  | { ok: true; amountOut: number; spotOut: number; smallCost: number | null; lpFee: number }
  | { ok: false; reason: string };

/**
 * Runs a swap through Uniswap's Quoter against the live pool: an exact simulation, so it
 * includes whatever the hook does to the trade (dynamic fees, extra charges, refusals).
 * Compares the result with the pool's current price to show the full cost of the trade, then
 * lets you make the trade (see HookSwap).
 */
export function SwapPreview({ hook, pools, initialPoolId }: { hook: Address; pools: SubgraphPool[]; initialPoolId?: string }) {
  const [poolId, setPoolId] = useState(
    initialPoolId && pools.some((p) => p.id === initialPoolId) ? initialPoolId : (pools[0]?.id ?? ""),
  );
  const [direction, setDirection] = useState<Direction>("0to1");
  const [amount, setAmount] = useState("10");
  const debounced = useDebounced(amount, 400);

  const pool = pools.find((p) => p.id === poolId) ?? pools[0];
  const key = pool ? rebuildPoolKey({ ...pool, hooks: hook }) : null;
  const zeroForOne = direction === "0to1";
  const tokenIn = pool ? (zeroForOne ? pool.token0 : pool.token1) : null;
  const tokenOut = pool ? (zeroForOne ? pool.token1 : pool.token0) : null;

  let amountIn: bigint | null = null;
  try {
    amountIn = tokenIn && Number(debounced) > 0 ? parseUnits(debounced, Number(tokenIn.decimals)) : null;
  } catch {
    amountIn = null;
  }

  const quote = useQuery({
    queryKey: ["swap-preview", pool?.id, direction, amountIn?.toString()],
    enabled: Boolean(key && amountIn && tokenOut),
    staleTime: 10_000,
    queryFn: async (): Promise<Quote> => {
      const poolKey = key!;
      const exact = amountIn!;
      const [slot0, full, small] = await Promise.all([
        mainnet.readContract({ address: ARC_V4.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolIdOf(poolKey)] }),
        quoteExactIn(poolKey, zeroForOne, exact),
        // A thousandth of the trade barely moves the price, so its cost is mostly fees.
        exact / 1000n >= 10_000n ? quoteExactIn(poolKey, zeroForOne, exact / 1000n) : Promise.resolve(null),
      ]);
      if (!full.ok) return { ok: false, reason: full.reason };

      const decimalsOut = Number(tokenOut!.decimals);
      // Raw price: currency1 units per currency0 unit.
      const price = (Number(slot0[0]) / Q96) ** 2;
      const spotRaw = (raw: bigint) => (zeroForOne ? Number(raw) * price : Number(raw) / price);
      const smallCost = small?.ok ? 1 - Number(small.amountOut) / spotRaw(exact / 1000n) : null;
      return {
        ok: true,
        amountOut: Number(formatUnits(full.amountOut, decimalsOut)),
        spotOut: spotRaw(exact) / 10 ** decimalsOut,
        smallCost,
        lpFee: Number(slot0[3]),
      };
    },
  });

  if (!pool) return null;
  const data = quote.data;
  const cost = data?.ok && data.spotOut > 0 ? 1 - data.amountOut / data.spotOut : null;
  const percent = (share: number) => `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

  return (
    <section aria-labelledby="swap-preview" className="card mt-4 p-6">
      <h3 id="swap-preview" className="text-lg font-medium">
        Preview and swap through this hook
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Quoted by Uniswap&apos;s own Quoter against the live pool, so it includes whatever this hook does to the trade. The
        preview sends nothing and needs no wallet.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Pool</span>
          <select className="field h-11" value={pool.id} onChange={(e) => setPoolId(e.target.value)}>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.token0.symbol} / {p.token1.symbol} · {formatUsd(Number(p.totalValueLockedUSD))} liquidity
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">You pay ({tokenIn?.symbol})</span>
          <input
            className="field tabular h-11"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-describedby="swap-preview-result"
          />
        </label>
      </div>
      <div className="mt-4">
        <Tabs
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "0to1", label: `${pool.token0.symbol} → ${pool.token1.symbol}` },
            { value: "1to0", label: `${pool.token1.symbol} → ${pool.token0.symbol}` },
          ]}
        />
      </div>

      <div id="swap-preview-result" aria-live="polite" className="mt-6">
        {!key ? (
          <p className="text-sm text-muted">This pool&apos;s key couldn&apos;t be rebuilt from the index, so it can&apos;t be quoted here.</p>
        ) : !amountIn ? (
          <p className="text-sm text-muted">Enter an amount to quote.</p>
        ) : quote.isLoading ? (
          <p className="text-sm text-muted">Quoting…</p>
        ) : quote.isError ? (
          <p className="text-sm text-muted">The quote didn&apos;t come back. Try again in a moment.</p>
        ) : data && !data.ok ? (
          <p className="rounded-xl bg-sell-soft px-4 py-3 text-sm text-sell">
            This swap would fail: {data.reason}. A hook can refuse trades, or the pool may not have enough liquidity.
          </p>
        ) : data?.ok ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Result label="You'd get" value={`${formatAmount(data.amountOut)} ${tokenOut?.symbol}`} />
            <Result label="At the current price" value={`${formatAmount(data.spotOut)} ${tokenOut?.symbol}`} />
            <Result
              label="Total cost of this trade"
              value={cost !== null ? percent(Math.max(0, cost)) : "–"}
              hint="Fees, hook charges and price impact together"
            />
            <Result
              label="Fees and hook charges"
              value={data.smallCost !== null ? `≈ ${percent(Math.max(0, data.smallCost))}` : "–"}
              hint={
                Number(pool.feeTier) === DYNAMIC_FEE_FLAG || data.lpFee !== Number(pool.feeTier)
                  ? `Stored pool fee ${formatFee(data.lpFee)}; this hook can set it per trade`
                  : `Pool fee ${formatFee(data.lpFee)}`
              }
            />
          </dl>
        ) : null}
        {data?.ok && key && amountIn && tokenIn && tokenOut && (
          <HookSwap
            hook={hook}
            pool={pool}
            poolKey={key}
            zeroForOne={zeroForOne}
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            amountIn={amountIn}
            quotedOut={data.amountOut}
            onDone={() => void quote.refetch()}
          />
        )}
      </div>
      <p className="mt-4 text-xs text-subtle">
        A hook that treats some senders differently may charge a real trade differently from this simulation.
      </p>
    </section>
  );
}

function Result({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tabular mt-1 text-lg font-medium text-ink">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

