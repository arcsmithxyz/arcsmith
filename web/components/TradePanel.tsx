"use client";

import { useState } from "react";
import { useConnection, useSimulateContract } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { erc20Abi, formatUnits, parseUnits, type Hash } from "viem";
import { launchRouterAbi } from "@/lib/abi/LaunchRouter";
import { DEFAULT_SLIPPAGE_BPS, deployment, explorerTxUrl, isUsdc } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount, formatBps, formatFee } from "@/lib/format";
import { minimumOut } from "@/lib/market";
import { wagmiConfig } from "@/lib/wagmi";
import { useDebounced } from "@/lib/hooks/useDebounced";
import type { MarketDetail } from "@/lib/hooks/useMarket";
import { WalletGate } from "./WalletGate";

type Side = "buy" | "sell";
type Status =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "done"; hash: Hash; side: Side }
  | { kind: "error"; message: string };

const SLIPPAGE_OPTIONS = [50, 100, 300];
const BUY_PRESETS = [10, 50, 100, 500];
const SELL_PRESETS = [25, 50, 75, 100];
const DEADLINE_SECONDS = 300;

function parseAmount(value: string, decimals: number): bigint | null {
  if (!value.trim()) return null;
  try {
    const parsed = parseUnits(value.trim(), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function TradePanel({ detail }: { detail: MarketDetail }) {
  const { address: account, isConnected } = useConnection();
  const { poolKey, market, symbol, quoteSymbol, balances, routerAllowance, fees, refetch } = detail;

  const [side, setSide] = useState<Side>("buy");
  const [input, setInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const inputDecimals = side === "buy" ? detail.quoteDecimals : detail.subjectDecimals;
  const outputDecimals = side === "buy" ? detail.subjectDecimals : detail.quoteDecimals;
  const inputSymbol = side === "buy" ? quoteSymbol || "quote" : symbol || "tokens";
  const outputSymbol = side === "buy" ? symbol || "tokens" : quoteSymbol || "quote";
  const balance = side === "buy" ? balances.quote : balances.subject;
  const allowance = side === "buy" ? routerAllowance.quote : routerAllowance.subject;

  const amount = parseAmount(input, inputDecimals);
  const debouncedAmount = parseAmount(useDebounced(input, 350), inputDecimals);
  const subjectIs0 = market?.subjectIsCurrency0 ?? false;
  // Buying pays the quote for the subject; the direction flips with which side each sorts to.
  const zeroForOne = side === "buy" ? !subjectIs0 : subjectIs0;

  const quote = useSimulateContract({
    address: deployment?.router,
    abi: launchRouterAbi,
    functionName: "quoteExactIn",
    args: poolKey && debouncedAmount ? [poolKey, zeroForOne, debouncedAmount, 0n] : undefined,
    query: { enabled: Boolean(deployment && poolKey && debouncedAmount), refetchInterval: 6_000 },
  });
  const quoted = debouncedAmount === amount ? quote.data?.result : undefined;
  const expectedOut = quoted?.[1];

  const quoteIsUsdc = isUsdc(market?.quote);
  const busy = status.kind === "working";
  const insufficient = amount !== null && amount > balance;

  function switchSide(next: Side) {
    setSide(next);
    setInput("");
    setStatus({ kind: "idle" });
  }

  function applyPreset(value: number) {
    setStatus({ kind: "idle" });
    if (side === "buy") {
      setInput(String(value));
    } else {
      const share = (balance * BigInt(value)) / 100n;
      setInput(share > 0n ? formatUnits(share, detail.subjectDecimals) : "");
    }
  }

  async function submit() {
    if (!deployment || !poolKey || !market || !account || !amount) return;
    try {
      if (allowance < amount) {
        setStatus({ kind: "working", label: `Approve ${inputSymbol} in your wallet…` });
        const approveHash = await writeContract(wagmiConfig, {
          address: side === "buy" ? market.quote : market.subject,
          abi: erc20Abi,
          functionName: "approve",
          // Exactly this trade's amount — the router never gets a standing allowance.
          args: [deployment.router, amount],
        });
        setStatus({ kind: "working", label: "Waiting for the approval…" });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      }

      // Re-quote right before sending so slippage protects against the latest price.
      setStatus({ kind: "working", label: "Checking the latest price…" });
      const { result } = await simulateContract(wagmiConfig, {
        address: deployment.router,
        abi: launchRouterAbi,
        functionName: "quoteExactIn",
        args: [poolKey, zeroForOne, amount, 0n],
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

      setStatus({ kind: "working", label: `Confirm the ${side} in your wallet…` });
      const hash = await writeContract(wagmiConfig, {
        address: deployment.router,
        abi: launchRouterAbi,
        functionName: "swapExactIn",
        args: [poolKey, zeroForOne, amount, minimumOut(result[1], slippageBps), 0n, account, deadline],
      });
      setStatus({ kind: "working", label: "Waiting for confirmation…" });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");

      setStatus({ kind: "done", hash, side });
      setInput("");
      await refetch();
    } catch (error) {
      setStatus({ kind: "error", message: friendlyError(error) });
    }
  }

  const feeNow = fees ? (side === "buy" ? fees.buyFee : fees.sellFee) : undefined;

  return (
    <section className="panel p-5" aria-label="Trade">
      <div className="flex items-center justify-between">
        <div className="tabs" role="tablist" aria-label="Trade side">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" role="tab" className="tab capitalize" aria-selected={side === s} onClick={() => switchSide(s)}>
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Slippage
          <select
            className="rounded-full border border-line bg-panel px-2 py-1 text-xs text-text"
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
          >
            {SLIPPAGE_OPTIONS.map((bps) => (
              <option key={bps} value={bps}>
                {formatBps(bps)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="trade-amount" className="text-sm text-muted">
            You pay
          </label>
          {isConnected && (
            <span className="text-xs text-subtle tabular">
              Balance {formatAmount(Number(formatUnits(balance, inputDecimals)))} {inputSymbol}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-[14px] border border-line-strong bg-panel px-4 focus-within:border-ink">
          <input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="tabular h-14 w-full bg-transparent text-2xl outline-none placeholder:text-subtle"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.replace(",", "."));
              setStatus({ kind: "idle" });
            }}
          />
          <span className="shrink-0 text-sm font-medium">{inputSymbol}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(side === "buy" ? BUY_PRESETS : SELL_PRESETS).map((value) => (
            <button key={value} type="button" className="pill pill-ghost pill-sm h-8 px-3 text-xs" onClick={() => applyPreset(value)}>
              {side === "buy" ? (quoteIsUsdc ? `${value}` : `${value} ${inputSymbol}`) : value === 100 ? "Max" : `${value}%`}
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-5 space-y-2 rounded-[14px] bg-surface p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">You receive</dt>
          <dd className="tabular font-medium">
            {amount === null
              ? "—"
              : expectedOut !== undefined
                ? `≈ ${formatAmount(Number(formatUnits(expectedOut, outputDecimals)))} ${outputSymbol}`
                : quote.isFetching || debouncedAmount !== amount
                  ? "Quoting…"
                  : "—"}
          </dd>
        </div>
        {expectedOut !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Minimum after slippage</dt>
            <dd className="tabular">
              {formatAmount(Number(formatUnits(minimumOut(expectedOut, slippageBps), outputDecimals)))} {outputSymbol}
            </dd>
          </div>
        )}
        {feeNow !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{side === "buy" ? "Buy" : "Sell"} fee now</dt>
            <dd className="tabular">
              {formatFee(feeNow)}
              {detail.blocks.length > 0 && ", can rise with trade size"}
            </dd>
          </div>
        )}
      </dl>

      {quote.error && amount !== null && debouncedAmount === amount && (
        <p className="mt-3 text-sm text-sell">{friendlyError(quote.error)}</p>
      )}

      <div className="mt-5">
        <WalletGate>
          <button
            type="button"
            className="pill pill-ink w-full"
            disabled={!deployment || !amount || insufficient || busy || Boolean(quote.error)}
            onClick={submit}
          >
            {busy
              ? status.label
              : insufficient
                ? `Not enough ${inputSymbol}`
                : amount && allowance < amount
                  ? `Approve and ${side}`
                  : side === "buy"
                    ? `Buy ${symbol || ""}`.trim()
                    : `Sell ${symbol || ""}`.trim()}
          </button>
        </WalletGate>
      </div>

      <div aria-live="polite" className="min-h-5">
        {status.kind === "done" && (
          <p className="mt-3 text-sm text-buy">
            {status.side === "buy" ? "Bought" : "Sold"}.{" "}
            {explorerTxUrl(status.hash) && (
              <a className="underline underline-offset-2" href={explorerTxUrl(status.hash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
          </p>
        )}
        {status.kind === "error" && <p className="mt-3 text-sm text-sell">{status.message}</p>}
      </div>
    </section>
  );
}
