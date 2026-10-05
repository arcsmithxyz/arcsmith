"use client";

import { useState } from "react";
import { useBalance, useConnection, useReadContracts } from "wagmi";
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { erc20Abi, formatUnits, zeroAddress, type Address, type Hash } from "viem";
import { WalletGate } from "@/components/WalletGate";
import { arcMainnet } from "@/lib/chains";
import { chain, DEFAULT_SLIPPAGE_BPS, deployment, explorerTxUrl } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount, formatBps } from "@/lib/format";
import { minimumOut } from "@/lib/market";
import { abilitiesOf } from "@/lib/permissions";
import type { SubgraphPool, SubgraphToken } from "@/lib/subgraph";
import { ARC_ROUTING, encodeExactInputSingle, permit2Abi, universalRouterAbi, type PoolKey } from "@/lib/uniswap";
import { wagmiConfig } from "@/lib/wagmi";
import { quoteExactIn } from "./quote";

type Status =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "done"; hash: Hash; received: string }
  | { kind: "error"; message: string };

const SLIPPAGE_OPTIONS = [50, 100, 300];
const DEADLINE_SECONDS = 300;
/** Permit2 approvals made here last this long and cover exactly one trade's amount. */
const APPROVAL_SECONDS = 30 * 60;
/** Below this much liquidity a pool is too thin (or wash-traded) to trade into from here. */
const MIN_LIQUIDITY_USD = 100;

/**
 * Swaps through any hooked pool on Arc with Uniswap's Universal Router. The minimum received
 * comes from a fresh quote minus the slippage tolerance, so if the hook takes more than the
 * preview showed, the trade reverts instead of filling. Hooks that can move money or refuse
 * trades need an explicit acknowledgement first; Arcsmith hasn't reviewed them.
 */
export function HookSwap({
  hook,
  pool,
  poolKey,
  zeroForOne,
  tokenIn,
  tokenOut,
  amountIn,
  quotedOut,
  onDone,
}: {
  hook: Address;
  pool: SubgraphPool;
  poolKey: PoolKey;
  zeroForOne: boolean;
  tokenIn: SubgraphToken;
  tokenOut: SubgraphToken;
  amountIn: bigint;
  /** The preview's quote, in whole tokens, for the "minimum received" line. */
  quotedOut: number;
  onDone: () => void;
}) {
  const { address: account } = useConnection();
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const live = chain.id === arcMainnet.id;
  const ours = Boolean(deployment && hook.toLowerCase() === deployment.kernel.toLowerCase());
  // What the hook could do to this trade, in the Hook Reader's plain words.
  const risks = abilitiesOf(hook).filter((a) => a.audience === "trade" && a.can);
  const needsAck = !ours && risks.length > 0;
  const thin = Number(pool.totalValueLockedUSD) < MIN_LIQUIDITY_USD;
  const native = tokenIn.id.toLowerCase() === zeroAddress;
  const token = tokenIn.id as Address;
  const decimalsIn = Number(tokenIn.decimals);

  const nativeBalance = useBalance({ address: account, query: { enabled: live && native && Boolean(account) } });
  const tokenBalance = useReadContracts({
    contracts: [{ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account ?? zeroAddress] }],
    query: { enabled: live && !native && Boolean(account), refetchInterval: 15_000 },
  });
  const balance = native ? nativeBalance.data?.value : (tokenBalance.data?.[0]?.result as bigint | undefined);
  const insufficient = balance !== undefined && amountIn > balance;
  const busy = status.kind === "working";

  async function submit() {
    if (!account) return;
    try {
      // Re-quote right before sending so the minimum reflects the pool as it is now.
      setStatus({ kind: "working", label: "Checking the latest price…" });
      const fresh = await quoteExactIn(poolKey, zeroForOne, amountIn);
      if (!fresh.ok) throw new Error(`This swap would fail: ${fresh.reason}.`);
      const minOut = minimumOut(fresh.amountOut, slippageBps);

      if (!native) {
        // Two exact, short-lived approvals: the token lets Permit2 move this amount, and
        // Permit2 lets the router spend it for the next 30 minutes. No standing allowance.
        const toPermit2 = await readContract(wagmiConfig, {
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, ARC_ROUTING.permit2],
        });
        if (toPermit2 < amountIn) {
          setStatus({ kind: "working", label: `Approve ${tokenIn.symbol} in your wallet (1 of 3)…` });
          const hash = await writeContract(wagmiConfig, {
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [ARC_ROUTING.permit2, amountIn],
          });
          await waitForTransactionReceipt(wagmiConfig, { hash });
        }
        const [allowed, expiration] = await readContract(wagmiConfig, {
          address: ARC_ROUTING.permit2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [account, token, ARC_ROUTING.universalRouter],
        });
        const now = Math.floor(Date.now() / 1000);
        if (allowed < amountIn || expiration <= now + 60) {
          setStatus({ kind: "working", label: "Allow the Uniswap router in your wallet (2 of 3)…" });
          const hash = await writeContract(wagmiConfig, {
            address: ARC_ROUTING.permit2,
            abi: permit2Abi,
            functionName: "approve",
            args: [token, ARC_ROUTING.universalRouter, amountIn, now + APPROVAL_SECONDS],
          });
          await waitForTransactionReceipt(wagmiConfig, { hash });
        }
      }

      const { commands, inputs } = encodeExactInputSingle({ key: poolKey, zeroForOne, amountIn, minimumOut: minOut });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
      // Simulate first, so a refusal by the hook shows here instead of as a failed transaction.
      setStatus({ kind: "working", label: "Checking the swap…" });
      const { request } = await simulateContract(wagmiConfig, {
        address: ARC_ROUTING.universalRouter,
        abi: universalRouterAbi,
        functionName: "execute",
        args: [commands, inputs, deadline],
        value: native ? amountIn : 0n,
        account,
      });
      setStatus({ kind: "working", label: native ? "Confirm the swap in your wallet…" : "Confirm the swap in your wallet (3 of 3)…" });
      const hash = await writeContract(wagmiConfig, request);
      setStatus({ kind: "working", label: "Waiting for confirmation…" });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The swap reverted.");

      setStatus({ kind: "done", hash, received: `${formatAmount(Number(formatUnits(minOut, Number(tokenOut.decimals))))} ${tokenOut.symbol}` });
      void nativeBalance.refetch();
      void tokenBalance.refetch();
      onDone();
    } catch (error) {
      setStatus({ kind: "error", message: friendlyError(error) });
    }
  }

  if (!live) {
    return <p className="mt-5 text-sm text-muted">Swaps here run on the Arc mainnet site.</p>;
  }
  if (thin) {
    return (
      <p className="mt-5 text-sm text-muted">
        This pool holds under $100 of liquidity, so swapping into it isn&apos;t offered here.
      </p>
    );
  }

  const minimumShown = quotedOut * (1 - slippageBps / 10_000);

  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium text-ink">Swap it</h4>
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

      <dl className="mt-3 grid gap-2 rounded-[14px] bg-surface p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Minimum received</dt>
          <dd className="tabular">
            {formatAmount(minimumShown)} {tokenOut.symbol}
          </dd>
        </div>
        {account && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Your balance</dt>
            <dd className="tabular">
              {balance !== undefined ? `${formatAmount(Number(formatUnits(balance, decimalsIn)))} ${tokenIn.symbol}` : "…"}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Routed through Uniswap&apos;s own Universal Router. If the hook takes more than the preview showed, the swap cancels
        itself instead of filling.
      </p>

      {needsAck && (
        <div className="mt-4 rounded-[14px] border border-warn/30 bg-warn-soft p-4 text-sm">
          <p className="font-medium text-warn">Arcsmith hasn&apos;t reviewed this hook. On this trade, it&apos;s allowed to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text">
            {risks.map((r) => (
              <li key={r.key}>
                <span className="font-medium">{r.short.charAt(0).toUpperCase() + r.short.slice(1)}.</span> {r.yes}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>I understand this third-party hook can do the above, and I&apos;m trading at my own risk.</span>
          </label>
        </div>
      )}

      <div className="mt-4">
        <WalletGate>
          <button
            type="button"
            className="pill pill-ink w-full"
            disabled={busy || insufficient || (needsAck && !accepted)}
            onClick={submit}
          >
            {busy
              ? status.label
              : insufficient
                ? `Not enough ${tokenIn.symbol}`
                : `Swap ${formatAmount(Number(formatUnits(amountIn, decimalsIn)))} ${tokenIn.symbol} for ${tokenOut.symbol}`}
          </button>
        </WalletGate>
      </div>

      <div aria-live="polite" className="min-h-5">
        {status.kind === "done" && (
          <p className="mt-3 text-sm text-buy">
            Swapped. You received at least {status.received}.{" "}
            {explorerTxUrl(status.hash) && (
              <a href={explorerTxUrl(status.hash)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                View transaction
              </a>
            )}
          </p>
        )}
        {status.kind === "error" && <p className="mt-3 text-sm text-sell">{status.message}</p>}
      </div>
    </div>
  );
}
