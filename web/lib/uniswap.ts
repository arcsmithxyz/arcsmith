import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * Uniswap's own v4 periphery on Arc mainnet (developers.uniswap.org/docs/protocols/v4/deployments),
 * used to preview a swap through any hooked pool exactly as the pool would run it.
 */
export const ARC_V4 = {
  quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
} as const satisfies Record<string, Address>;

/** A v4 pool's dynamic-fee flag: the hook sets the fee, so the key's fee field is this marker. */
export const DYNAMIC_FEE_FLAG = 0x800000;

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

const POOL_KEY_PARAMS = [
  { type: "address" },
  { type: "address" },
  { type: "uint24" },
  { type: "int24" },
  { type: "address" },
] as const;

export function poolIdOf(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters(POOL_KEY_PARAMS, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
}

/**
 * Rebuilds a pool's key from what the index stores. The index doesn't keep the key's fee
 * field for dynamic-fee pools (it shows the last fee charged), so both candidates are tried
 * and the one that hashes to the pool id wins. Null if neither does.
 */
export function rebuildPoolKey(pool: {
  id: string;
  feeTier: string;
  tickSpacing: string;
  hooks: string;
  token0: { id: string };
  token1: { id: string };
}): PoolKey | null {
  for (const fee of [DYNAMIC_FEE_FLAG, Number(pool.feeTier)]) {
    const key: PoolKey = {
      currency0: pool.token0.id as Address,
      currency1: pool.token1.id as Address,
      fee,
      tickSpacing: Number(pool.tickSpacing),
      hooks: pool.hooks as Address,
    };
    if (poolIdOf(key).toLowerCase() === pool.id.toLowerCase()) return key;
  }
  return null;
}

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

export const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const stateViewAbi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

/** Uniswap's Universal Router and Permit2 on Arc mainnet, used to swap through any hooked pool. */
export const ARC_ROUTING = {
  universalRouter: "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const satisfies Record<string, Address>;

export const universalRouterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const permit2Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

// Universal Router command and v4 router actions (v4-periphery Actions.sol).
const V4_SWAP = "0x10";
const SWAP_EXACT_IN_SINGLE = "06";
const SETTLE_ALL = "0c";
const TAKE_ALL = "0f";

/**
 * Calldata for one exact-input swap through one pool: swap, pay everything owed, take at least
 * `minimumOut`. The router on Arc expects a slippage field between the minimum and the hook data
 * (checked against live swaps on 2026-10-02); 0 leaves it unused, as Uniswap's own app sends it.
 */
export function encodeExactInputSingle(args: {
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minimumOut: bigint;
}) {
  const { key, zeroForOne, amountIn, minimumOut } = args;
  const swap = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "maxHopSlippage", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minimumOut, maxHopSlippage: 0n, hookData: "0x" }],
  );
  const currencyIn = zeroForOne ? key.currency0 : key.currency1;
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minimumOut]);
  const input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [`0x${SWAP_EXACT_IN_SINGLE}${SETTLE_ALL}${TAKE_ALL}`, [swap, settle, take]],
  );
  return { commands: V4_SWAP as Hex, inputs: [input] as Hex[] };
}
