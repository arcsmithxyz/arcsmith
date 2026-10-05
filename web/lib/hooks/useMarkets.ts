"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, type Address, type ContractFunctionReturnType, type Hex } from "viem";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { hookKernelAbi } from "@/lib/abi/HookKernel";
import { deployment } from "@/lib/config";
import { subjectPrice } from "@/lib/market";
import { poolPath } from "@/lib/pool-path";

export type MarketSummary = {
  id: bigint;
  /** The pool page: /pool/<token>, see lib/pool-path.ts. */
  href: string;
  subject: Address;
  quote: Address;
  creator: Address;
  poolId: Hex;
  createdAt: number;
  isLaunch: boolean;
  subjectIsCurrency0: boolean;
  tickSpacing: number;
  name: string;
  symbol: string;
  quoteSymbol: string;
  subjectDecimals: number;
  quoteDecimals: number;
  imageURI: string;
  description: string;
  website: string;
  /** Protocol's share of a launch's fees, frozen at launch (basis points). */
  protocolShareBps: number;
  sqrtPriceX96: bigint;
  /** Price of one subject token in quote units. */
  price: number;
  /** Price × total supply, in quote units. */
  fdv: number;
  buyFee: number;
  sellFee: number;
  blocks: readonly Address[];
};

type GetMarketResult = ContractFunctionReturnType<typeof launchpadAbi, "view", "getMarket">;
type StateResult = ContractFunctionReturnType<typeof launchpadAbi, "view", "marketState">;
type FeesResult = ContractFunctionReturnType<typeof hookKernelAbi, "view", "previewFees">;

/** Newest markets first, read straight from the chain. */
const PAGE_SIZE = 60n;
/** Views that need every market (a creator's page, the author leaderboard) scan this many of the newest. */
const FULL_SCAN = 500n;
const REFRESH_MS = 15_000;

export function useMarkets(options: { creator?: Address; all?: boolean } = {}) {
  const launchpad = deployment?.launchpad;
  const kernel = deployment?.kernel;
  const enabled = Boolean(launchpad);

  const count = useReadContract({
    address: launchpad,
    abi: launchpadAbi,
    functionName: "marketCount",
    query: { enabled, refetchInterval: REFRESH_MS },
  });
  const total = count.data ?? 0n;
  const creator = options.creator?.toLowerCase();
  const size = creator || options.all ? FULL_SCAN : PAGE_SIZE;
  const start = total > size ? total - size : 0n;
  const page = useReadContract({
    address: launchpad,
    abi: launchpadAbi,
    functionName: "getMarkets",
    args: [start, size],
    query: { enabled: enabled && total > 0n, refetchInterval: REFRESH_MS },
  });
  // Market numbers are positions in the Launchpad's list; keep them through the creator filter.
  const scanned = (page.data ?? []).map((m, i) => ({ m, id: start + BigInt(i) }));
  // A token's first market gets the clean /pool/<token> address. A launch is always first;
  // otherwise that's only certain when the scan reaches back to market 0. When unsure, the
  // link names the market and the server redirects it to the clean address if it is first.
  const firstOfToken = new Map<string, bigint>();
  for (const { m, id } of scanned) {
    if (!firstOfToken.has(m.subject.toLowerCase())) firstOfToken.set(m.subject.toLowerCase(), id);
  }
  const hrefOf = (m: (typeof scanned)[number]["m"], id: bigint) =>
    poolPath(m.subject, id, m.isLaunch || (start === 0n && firstOfToken.get(m.subject.toLowerCase()) === id));
  const mine = creator ? scanned.filter(({ m }) => m.creator.toLowerCase() === creator) : scanned;
  const markets = mine.map(({ m }) => m);
  const ids = mine.map(({ id }) => id);
  const has = markets.length > 0;
  const live = { enabled: has, refetchInterval: REFRESH_MS };
  const once = { enabled: has };

  // One homogeneous batch per field keeps result types precise; the transport folds them
  // all into Multicall3 calls anyway.
  const meta = useReadContracts({
    contracts: ids.map((id) => ({ address: launchpad, abi: launchpadAbi, functionName: "getMarket", args: [id] }) as const),
    query: once,
  });
  const states = useReadContracts({
    contracts: ids.map((id) => ({ address: launchpad, abi: launchpadAbi, functionName: "marketState", args: [id] }) as const),
    query: live,
  });
  const fees = useReadContracts({
    contracts: markets.map((m) => ({ address: kernel, abi: hookKernelAbi, functionName: "previewFees", args: [m.poolId] }) as const),
    query: live,
  });
  const stacks = useReadContracts({
    contracts: markets.map((m) => ({ address: kernel, abi: hookKernelAbi, functionName: "blocksOf", args: [m.poolId] }) as const),
    query: once,
  });
  const tokens = useReadContracts({
    contracts: markets.flatMap((m) => [
      { address: m.subject, abi: erc20Abi, functionName: "name" } as const,
      { address: m.subject, abi: erc20Abi, functionName: "symbol" } as const,
      { address: m.subject, abi: erc20Abi, functionName: "decimals" } as const,
      { address: m.subject, abi: erc20Abi, functionName: "totalSupply" } as const,
      { address: m.quote, abi: erc20Abi, functionName: "symbol" } as const,
      { address: m.quote, abi: erc20Abi, functionName: "decimals" } as const,
    ]),
    query: once,
  });

  const summaries: MarketSummary[] = markets
    .map((m, i) => {
      const t = tokens.data?.slice(i * 6, i * 6 + 6).map((r) => r?.result);
      const subjectDecimals = Number(t?.[2] ?? 18);
      const quoteDecimals = Number(t?.[5] ?? 6);
      const supply = (t?.[3] as bigint | undefined) ?? 0n;
      const state = states.data?.[i]?.result as StateResult | undefined;
      const fee = fees.data?.[i]?.result as FeesResult | undefined;
      const metadata = (meta.data?.[i]?.result as GetMarketResult | undefined)?.[1];
      const price = state ? subjectPrice(state[0], m.subjectIsCurrency0, subjectDecimals, quoteDecimals) : 0;
      return {
        id: ids[i],
        href: hrefOf(m, ids[i]),
        subject: m.subject,
        quote: m.quote,
        creator: m.creator,
        poolId: m.poolId,
        createdAt: Number(m.createdAt),
        isLaunch: m.isLaunch,
        subjectIsCurrency0: m.subjectIsCurrency0,
        tickSpacing: Number(m.tickSpacing),
        name: (t?.[0] as string | undefined) ?? "",
        symbol: (t?.[1] as string | undefined) ?? "",
        quoteSymbol: (t?.[4] as string | undefined) ?? "",
        subjectDecimals,
        quoteDecimals,
        imageURI: metadata?.imageURI ?? "",
        description: metadata?.description ?? "",
        website: metadata?.website ?? "",
        protocolShareBps: Number(m.protocolShareBps),
        sqrtPriceX96: state?.[0] ?? 0n,
        price,
        fdv: price * (Number(supply) / 10 ** subjectDecimals),
        buyFee: fee ? Number(fee[0]) : 0,
        sellFee: fee ? Number(fee[1]) : 0,
        blocks: (stacks.data?.[i]?.result as readonly Address[] | undefined) ?? [],
      };
    })
    .reverse();

  return {
    markets: summaries,
    total,
    isLoading: count.isLoading || page.isLoading || tokens.isLoading,
    error: count.error ?? page.error,
  };
}
