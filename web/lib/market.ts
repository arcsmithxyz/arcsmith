import { USDC_DECIMALS } from "./config";

const Q96 = 2n ** 96n;

/**
 * Price of one whole subject token in quote units, from the pool's sqrtPriceX96.
 *
 * Pool prices are currency1 per currency0 in raw units. When the subject is currency0 that
 * is quote per subject; when it's currency1 it is subject per quote, so it's inverted.
 */
export function subjectPrice(sqrtPriceX96: bigint, subjectIsCurrency0: boolean, subjectDecimals: number, quoteDecimals: number) {
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  const raw = sqrt * sqrt;
  if (raw === 0) return 0;
  const scale = 10 ** (subjectDecimals - quoteDecimals);
  return subjectIsCurrency0 ? raw * scale : scale / raw;
}

/**
 * USDC a launch's locked position holds: what buyers paid in net of what sellers took out.
 * The position starts at the launch floor holding only tokens; every buy moves the price
 * away from the floor and converts tokens into USDC. Exact while the launch position is
 * the only in-range liquidity.
 */
export function poolUsdc(liquidity: bigint, sqrtPriceX96: bigint, floorSqrtPriceX96: bigint, tokenIsCurrency0: boolean) {
  if (liquidity === 0n || floorSqrtPriceX96 === 0n || sqrtPriceX96 === 0n) return 0;
  let raw: bigint;
  if (tokenIsCurrency0) {
    // USDC is currency1: amount1 = L · (√P − √P_floor)
    if (sqrtPriceX96 <= floorSqrtPriceX96) return 0;
    raw = (liquidity * (sqrtPriceX96 - floorSqrtPriceX96)) / Q96;
  } else {
    // USDC is currency0: amount0 = L · (1/√P − 1/√P_floor)
    if (sqrtPriceX96 >= floorSqrtPriceX96) return 0;
    raw = (liquidity * Q96 * (floorSqrtPriceX96 - sqrtPriceX96)) / (sqrtPriceX96 * floorSqrtPriceX96);
  }
  return Number(raw) / 10 ** USDC_DECIMALS;
}

/** Applies a slippage tolerance to an expected output. */
export function minimumOut(expected: bigint, slippageBps: number) {
  return (expected * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** sqrtPriceX96 for "1 subject = `price` quote", in pool orientation. */
export function sqrtPriceFor(price: number, subjectIsCurrency0: boolean, subjectDecimals: number, quoteDecimals: number) {
  const scale = 10 ** (subjectDecimals - quoteDecimals);
  const raw = subjectIsCurrency0 ? price / scale : scale / price; // currency1 per currency0, raw units
  const sqrt = Math.sqrt(raw);
  // Split to keep precision: sqrt * 2^96 as a bigint via a 2^48 intermediate.
  const high = BigInt(Math.floor(sqrt * 2 ** 48));
  return high * 2n ** 48n;
}
