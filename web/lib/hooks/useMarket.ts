"use client";

import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, zeroAddress, type Address } from "viem";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { hookKernelAbi } from "@/lib/abi/HookKernel";
import { liquidityManagerAbi } from "@/lib/abi/LiquidityManager";
import { deployment } from "@/lib/config";
import { poolUsdc, subjectPrice } from "@/lib/market";

const DEAD: Address = "0x000000000000000000000000000000000000dEaD";
const REFRESH_MS = 4_000;

/** Everything a pool page shows, refreshed every few seconds. */
export function useMarket(id: bigint) {
  const { address: account } = useConnection();
  const d = deployment;
  const holder = account ?? zeroAddress;

  const base = useReadContracts({
    contracts: [
      { address: d?.launchpad, abi: launchpadAbi, functionName: "getMarket", args: [id] },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "poolKeyOf", args: [id] },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "marketState", args: [id] },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "pendingFees", args: [id] },
      { address: d?.launchpad, abi: launchpadAbi, functionName: "royaltiesOf", args: [id] },
    ],
    query: { enabled: d !== null, refetchInterval: REFRESH_MS },
  });

  const market = base.data?.[0]?.result?.[0];
  const metadata = base.data?.[0]?.result?.[1];
  const poolKey = base.data?.[1]?.result;
  const state = base.data?.[2]?.result;
  const pending = base.data?.[3]?.result;
  const royalties = base.data?.[4]?.result ?? [];
  const poolId = market?.poolId ?? "0x";
  const subject = market?.subject;
  const quote = market?.quote;
  const router = d?.router ?? zeroAddress;
  const lm = d?.liquidityManager ?? zeroAddress;

  const pool = useReadContracts({
    contracts: [
      { address: d?.kernel, abi: hookKernelAbi, functionName: "getPool", args: [poolId] },
      { address: d?.kernel, abi: hookKernelAbi, functionName: "previewFees", args: [poolId] },
      { address: d?.kernel, abi: hookKernelAbi, functionName: "feeCap", args: [poolId] },
      { address: subject, abi: erc20Abi, functionName: "name" },
      { address: subject, abi: erc20Abi, functionName: "symbol" },
      { address: subject, abi: erc20Abi, functionName: "decimals" },
      { address: subject, abi: erc20Abi, functionName: "totalSupply" },
      { address: subject, abi: erc20Abi, functionName: "balanceOf", args: [DEAD] },
      { address: quote, abi: erc20Abi, functionName: "symbol" },
      { address: quote, abi: erc20Abi, functionName: "decimals" },
    ],
    query: { enabled: market !== undefined, refetchInterval: REFRESH_MS },
  });

  const user = useReadContracts({
    contracts: [
      { address: subject, abi: erc20Abi, functionName: "balanceOf", args: [holder] },
      { address: quote, abi: erc20Abi, functionName: "balanceOf", args: [holder] },
      { address: subject, abi: erc20Abi, functionName: "allowance", args: [holder, router] },
      { address: quote, abi: erc20Abi, functionName: "allowance", args: [holder, router] },
      { address: subject, abi: erc20Abi, functionName: "allowance", args: [holder, lm] },
      { address: quote, abi: erc20Abi, functionName: "allowance", args: [holder, lm] },
    ],
    query: { enabled: market !== undefined && account !== undefined, refetchInterval: REFRESH_MS },
  });
  const positionRead = useReadContract({
    address: d?.liquidityManager,
    abi: liquidityManagerAbi,
    functionName: "positionOf",
    args: poolKey ? [poolKey, holder] : undefined,
    query: { enabled: poolKey !== undefined && account !== undefined, refetchInterval: REFRESH_MS },
  });

  const [config, blocks, configs, states] = pool.data?.[0]?.result ?? [undefined, [], [], []];
  const fees = pool.data?.[1]?.result;
  const subjectDecimals = Number(pool.data?.[5]?.result ?? 18);
  const quoteDecimals = Number(pool.data?.[9]?.result ?? 6);
  const supply = pool.data?.[6]?.result ?? 0n;
  const subjectIs0 = market?.subjectIsCurrency0 ?? false;
  const price = state ? subjectPrice(state[0], subjectIs0, subjectDecimals, quoteDecimals) : 0;

  // Uncollected launch fees come back as (currency0, currency1); split into subject / quote.
  const [pendingSubject, pendingQuote] = pending ? (subjectIs0 ? [pending[0], pending[1]] : [pending[1], pending[0]]) : [0n, 0n];
  const position = positionRead.data;
  const [positionFeesSubject, positionFeesQuote] = position
    ? subjectIs0
      ? [position[1], position[2]]
      : [position[2], position[1]]
    : [0n, 0n];

  return {
    isLoading: base.isLoading,
    notFound: base.isSuccess && base.data?.[0]?.status === "failure",
    market,
    metadata,
    poolKey,
    config,
    blocks: blocks as readonly Address[],
    configs: configs as readonly `0x${string}`[],
    states: states as readonly `0x${string}`[],
    royalties: royalties as readonly number[],
    name: pool.data?.[3]?.result ?? "",
    symbol: pool.data?.[4]?.result ?? "",
    quoteSymbol: pool.data?.[8]?.result ?? "",
    subjectDecimals,
    quoteDecimals,
    price,
    fdv: price * (Number(supply) / 10 ** subjectDecimals),
    // Launch lane only: USDC in the locked position.
    poolQuote:
      state && config && market?.isLaunch ? poolUsdc(state[2], state[0], config.floorSqrtPriceX96, subjectIs0) : undefined,
    sqrtPriceX96: state?.[0] ?? 0n,
    inRangeLiquidity: state?.[2] ?? 0n,
    burned: pool.data?.[7]?.result ?? 0n,
    fees: fees ? { buyFee: Number(fees[0]), sellFee: Number(fees[1]) } : undefined,
    feeCap: Number(pool.data?.[2]?.result ?? 0),
    pendingSubject,
    pendingQuote,
    balances: { subject: user.data?.[0]?.result ?? 0n, quote: user.data?.[1]?.result ?? 0n },
    routerAllowance: { subject: user.data?.[2]?.result ?? 0n, quote: user.data?.[3]?.result ?? 0n },
    lmAllowance: { subject: user.data?.[4]?.result ?? 0n, quote: user.data?.[5]?.result ?? 0n },
    position: position
      ? { liquidity: position[0], feesSubject: positionFeesSubject, feesQuote: positionFeesQuote }
      : undefined,
    refetch: () => Promise.all([base.refetch(), pool.refetch(), user.refetch(), positionRead.refetch()]),
  };
}

export type MarketDetail = ReturnType<typeof useMarket>;
