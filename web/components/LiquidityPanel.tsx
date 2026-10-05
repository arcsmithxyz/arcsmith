"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { liquidityManagerAbi } from "@/lib/abi/LiquidityManager";
import { deployment } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount } from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";
import type { MarketDetail } from "@/lib/hooks/useMarket";
import { WalletGate } from "./WalletGate";

type Mode = "add" | "remove";

const Q192 = 2n ** 192n;
const DEADLINE_SECONDS = 300;
// Head-room on the paired side: the manager only pulls what the position actually needs.
const PAIR_BUFFER_BPS = 200n;
// Removal minimums: accept up to 1% less than the current value of the position.
const REMOVE_SLIPPAGE_BPS = 100n;
const REMOVE_PRESETS = [25, 50, 100];

function deadline() {
  return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
}

function parseAmount(value: string, decimals: number): bigint | null {
  if (!value.trim()) return null;
  try {
    const parsed = parseUnits(value.trim(), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Subject needed next to `quoteAmount` for a full-range position at the current price. Full
 * range makes the ratio the pool price itself: amount1 / amount0 = sqrtP² / 2^192.
 */
function pairedSubject(quoteAmount: bigint, sqrtPriceX96: bigint, subjectIs0: boolean) {
  if (sqrtPriceX96 === 0n) return 0n;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  return subjectIs0 ? (quoteAmount * Q192) / priceX192 : (quoteAmount * priceX192) / Q192;
}

/**
 * Full-range liquidity in any pool this platform runs, via the LiquidityManager. Positions are
 * per wallet (the manager keys them by owner), and fees accrue to them like any v4 position.
 */
export function LiquidityPanel({ detail }: { detail: MarketDetail }) {
  const { isConnected } = useConnection();
  const { poolKey, market, symbol, quoteSymbol, subjectDecimals, quoteDecimals, balances, lmAllowance, position, refetch } =
    detail;

  const [mode, setMode] = useState<Mode>("add");
  const [input, setInput] = useState("");
  const [removeShare, setRemoveShare] = useState(100);
  const [status, setStatus] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });

  const subjectIs0 = market?.subjectIsCurrency0 ?? false;
  const quoteAmount = parseAmount(input, quoteDecimals);
  const subjectAmount = quoteAmount ? pairedSubject(quoteAmount, detail.sqrtPriceX96, subjectIs0) : null;
  const subjectMax = subjectAmount ? subjectAmount + (subjectAmount * PAIR_BUFFER_BPS) / 10_000n : null;
  const insufficient =
    quoteAmount !== null &&
    subjectMax !== null &&
    (quoteAmount > balances.quote || subjectMax > balances.subject);

  const liquidity = position?.liquidity ?? 0n;
  const hasPosition = liquidity > 0n;
  const hasFees = (position?.feesSubject ?? 0n) > 0n || (position?.feesQuote ?? 0n) > 0n;

  async function approveIfNeeded(token: Address, amount: bigint, allowance: bigint, label: string) {
    if (!deployment || allowance >= amount) return;
    setStatus({ busy: true, message: `Approve ${label} in your wallet…` });
    const hash = await writeContract(wagmiConfig, {
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      // Exactly this deposit — the manager never gets a standing allowance.
      args: [deployment.liquidityManager, amount],
    });
    setStatus({ busy: true, message: "Waiting for the approval…" });
    await waitForTransactionReceipt(wagmiConfig, { hash });
  }

  async function run(action: () => Promise<`0x${string}`>, done: string) {
    try {
      const hash = await action();
      setStatus({ busy: true, message: "Waiting for confirmation…" });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setStatus({ busy: false, message: done });
      setInput("");
      await refetch();
    } catch (error) {
      setStatus({ busy: false, message: friendlyError(error) });
    }
  }

  function add() {
    if (!deployment || !poolKey || !market || !quoteAmount || !subjectMax) return;
    return run(async () => {
      await approveIfNeeded(market.quote, quoteAmount, lmAllowance.quote, quoteSymbol || "the quote token");
      await approveIfNeeded(market.subject, subjectMax, lmAllowance.subject, symbol || "the token");
      setStatus({ busy: true, message: "Confirm the deposit in your wallet…" });
      const [amount0Max, amount1Max] = subjectIs0 ? [subjectMax, quoteAmount] : [quoteAmount, subjectMax];
      return writeContract(wagmiConfig, {
        address: deployment!.liquidityManager,
        abi: liquidityManagerAbi,
        functionName: "addLiquidity",
        args: [poolKey, amount0Max, amount1Max, deadline()],
      });
    }, "Liquidity added. It earns a share of every trade's fee.");
  }

  function remove() {
    if (!deployment || !poolKey || !hasPosition) return;
    const amount = (liquidity * BigInt(removeShare)) / 100n;
    // Minimums from the position's current value, so a price jump mid-flight can't short-change it.
    const [value0, value1] = positionValue(amount, detail.sqrtPriceX96);
    const min = (v: bigint) => (v * (10_000n - REMOVE_SLIPPAGE_BPS)) / 10_000n;
    return run(async () => {
      setStatus({ busy: true, message: "Confirm the withdrawal in your wallet…" });
      return writeContract(wagmiConfig, {
        address: deployment!.liquidityManager,
        abi: liquidityManagerAbi,
        functionName: "removeLiquidity",
        args: [poolKey, amount, min(value0), min(value1), deadline()],
      });
    }, "Withdrawn, with fees, to your wallet.");
  }

  function collect() {
    if (!deployment || !poolKey) return;
    return run(async () => {
      setStatus({ busy: true, message: "Confirm in your wallet…" });
      return writeContract(wagmiConfig, {
        address: deployment!.liquidityManager,
        abi: liquidityManagerAbi,
        functionName: "collect",
        args: [poolKey],
      });
    }, "Fees collected to your wallet.");
  }

  const [positionSubject, positionQuote] = (() => {
    if (!hasPosition) return [0n, 0n];
    const [v0, v1] = positionValue(liquidity, detail.sqrtPriceX96);
    return subjectIs0 ? [v0, v1] : [v1, v0];
  })();
  const fmt = (value: bigint, decimals: number) => formatAmount(Number(formatUnits(value, decimals)));

  return (
    <section className="panel p-5" aria-label="Liquidity">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Liquidity</h2>
        <div className="tabs" role="tablist" aria-label="Liquidity action">
          {(["add", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              className="tab capitalize"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setStatus({ busy: false, message: null });
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {hasPosition && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[14px] bg-surface p-4 text-sm">
          <div>
            <dt className="text-xs text-subtle">Your position</dt>
            <dd className="tabular mt-1">
              {fmt(positionQuote, quoteDecimals)} {quoteSymbol}
              <br />
              {fmt(positionSubject, subjectDecimals)} {symbol}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Unclaimed fees</dt>
            <dd className="tabular mt-1">
              {fmt(position?.feesQuote ?? 0n, quoteDecimals)} {quoteSymbol}
              <br />
              {fmt(position?.feesSubject ?? 0n, subjectDecimals)} {symbol}
            </dd>
          </div>
        </dl>
      )}

      {mode === "add" ? (
        <div className="mt-4">
          <label htmlFor="lp-amount" className="text-sm text-muted">
            Deposit {quoteSymbol || "quote"}
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-[14px] border border-line-strong bg-panel px-4 focus-within:border-ink">
            <input
              id="lp-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="tabular h-12 w-full bg-transparent text-xl outline-none placeholder:text-subtle"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.replace(",", "."));
                setStatus({ busy: false, message: null });
              }}
            />
            <span className="shrink-0 text-sm font-medium">{quoteSymbol}</span>
          </div>
          <p className="mt-2 text-xs text-muted tabular">
            {subjectAmount
              ? `Plus about ${fmt(subjectAmount, subjectDecimals)} ${symbol} at today's price.`
              : `Deposits are full range: half ${quoteSymbol || "quote"}, half ${symbol || "token"} by value.`}
            {isConnected &&
              ` Balance: ${fmt(balances.quote, quoteDecimals)} ${quoteSymbol}, ${fmt(balances.subject, subjectDecimals)} ${symbol}.`}
          </p>
          {detail.inRangeLiquidity === 0n && (
            <p className="mt-2 text-xs text-warn">
              This pool has no liquidity yet, so anyone can move its price for free. Check the price above first — your
              deposit is made at whatever it is.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-muted">Withdraw a share of your position, fees included.</p>
          <div className="mt-2 flex gap-1.5">
            {REMOVE_PRESETS.map((share) => (
              <button
                key={share}
                type="button"
                aria-pressed={removeShare === share}
                className={`pill pill-sm h-8 px-3 text-xs ${removeShare === share ? "pill-ink" : "pill-ghost"}`}
                onClick={() => setRemoveShare(share)}
              >
                {share === 100 ? "All" : `${share}%`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <WalletGate>
          {mode === "add" ? (
          <button
            type="button"
            className="pill pill-ink w-full"
            disabled={!deployment || !quoteAmount || insufficient || status.busy}
            onClick={add}
          >
            {status.busy ? status.message : insufficient ? "Not enough balance" : "Add liquidity"}
          </button>
        ) : (
          <button type="button" className="pill pill-ink w-full" disabled={!hasPosition || status.busy} onClick={remove}>
            {status.busy ? status.message : hasPosition ? "Withdraw" : "No position yet"}
          </button>
          )}
          {hasFees && (
            <button type="button" className="pill pill-ghost w-full" disabled={status.busy} onClick={collect}>
              Collect fees only
            </button>
          )}
        </WalletGate>
      </div>

      <div aria-live="polite" className="min-h-5">
        {!status.busy && status.message && <p className="mt-3 text-sm text-muted">{status.message}</p>}
      </div>
    </section>
  );
}

/**
 * Token amounts (currency0, currency1) behind `liquidity` in a full-range position. With full
 * range the bounds are effectively 0 and ∞: amount0 = L · 2^96 / √P, amount1 = L · √P / 2^96.
 */
function positionValue(liquidity: bigint, sqrtPriceX96: bigint): [bigint, bigint] {
  if (sqrtPriceX96 === 0n) return [0n, 0n];
  const Q96 = 2n ** 96n;
  return [(liquidity * Q96) / sqrtPriceX96, (liquidity * sqrtPriceX96) / Q96];
}
