import { BaseError, ContractFunctionRevertedError, createPublicClient } from "viem";
import { arcMainnet } from "@/lib/chains";
import { appTransport } from "@/lib/rpc";
import { ARC_V4, v4QuoterAbi, type PoolKey } from "@/lib/uniswap";

/** Reads for the Hook Reader always run on Arc mainnet, where the index's pools live. */
export const mainnet = createPublicClient({ chain: arcMainnet, transport: appTransport(arcMainnet) });

export type SwapQuote = { ok: true; amountOut: bigint } | { ok: false; reason: string };

/**
 * An exact-input quote from Uniswap's Quoter against the live pool. A revert comes back as
 * `{ ok: false }` ("this swap would fail"); network trouble is rethrown as a failed quote.
 */
export async function quoteExactIn(poolKey: PoolKey, zeroForOne: boolean, exactAmount: bigint): Promise<SwapQuote> {
  try {
    const { result } = await mainnet.simulateContract({
      address: ARC_V4.quoter,
      abi: v4QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ poolKey, zeroForOne, exactAmount, hookData: "0x" }],
    });
    return { ok: true, amountOut: result[0] };
  } catch (error) {
    const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    if (!(reverted instanceof ContractFunctionRevertedError)) throw error;
    return { ok: false, reason: reverted.data?.errorName ?? reverted.reason ?? "the pool reverted" };
  }
}
