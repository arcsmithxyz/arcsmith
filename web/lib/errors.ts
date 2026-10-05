import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeErrorResult,
  type Hex,
} from "viem";
import { hookKernelAbi } from "./abi/HookKernel";
import { blockCatalogAbi } from "./abi/BlockCatalog";
import { liquidityManagerAbi } from "./abi/LiquidityManager";
import { launchRouterAbi } from "./abi/LaunchRouter";
import { launchpadAbi } from "./abi/Launchpad";

/**
 * Uniswap v4's PoolManager wraps any revert from a hook in this ERC-7751 error, so the
 * kernel's own reason (e.g. BlockRejected) has to be unwrapped from `reason`.
 */
const wrappedErrorAbi = [
  {
    type: "error",
    name: "WrappedError",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      { name: "reason", type: "bytes" },
      { name: "details", type: "bytes" },
    ],
  },
] as const;

// Errors raised outside our contracts: OpenZeppelin ERC-20s and the v4 PoolManager.
const externalErrorAbi = [
  { type: "error", name: "PoolAlreadyInitialized", inputs: [] },
  { type: "error", name: "ERC20InsufficientBalance", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "ERC20InsufficientAllowance", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }] },
] as const;

const knownErrorsAbi = [
  ...hookKernelAbi,
  ...launchRouterAbi,
  ...launchpadAbi,
  ...blockCatalogAbi,
  ...liquidityManagerAbi,
  ...externalErrorAbi,
  ...wrappedErrorAbi,
];

const MESSAGES: Record<string, string> = {
  BlockRejected: "One of this pool's rules refused the trade — during a launch guard, each buy is capped. Try a smaller amount.",
  BelowLaunchFloor: "The pool doesn't hold enough USDC for a sell this size. Try a smaller amount.",
  InsufficientGasForBlocks: "Not enough gas for this pool's rules to run. Let your wallet estimate gas.",
  TooLittleReceived: "The price moved past your slippage limit. Try again.",
  TooMuchRequested: "The price moved while adding liquidity. Try again.",
  DeadlineExpired: "The transaction took too long. Try again.",
  InvalidBlockConfig: "A block's settings are out of range, or the block can't be used in this lane.",
  BlockNotUsable: "A chosen block isn't approved in the catalog (or was retired).",
  TooManyBlocks: "A pool can run at most five blocks.",
  DuplicateBlock: "The same block is in the stack twice.",
  InvalidBaseFee: "The base fee must be between 0.01% and 3%.",
  InvalidMetadata: "Check the name (max 32 characters), ticker (max 12), links and description.",
  InvalidMarket: "Check the token addresses and tick spacing.",
  Paused: "New pools are paused right now. Trading still works.",
  NotALaunch: "Only launches have creator fees to collect.",
  NothingToClaim: "There's nothing to claim yet.",
  NotCreator: "Only the creator can do that.",
  NotAContract: "There's no contract at that address on this network.",
  InvalidStatus: "That block is already in the catalog.",
  MetadataTooLong: "The block description is too long (max 2,048 characters).",
  ZeroLiquidity: "Those amounts are too small to add as liquidity.",
  PoolNotInitialized: "That pool doesn't exist yet.",
  PoolAlreadyInitialized: "A market for this pair and tick spacing already exists.",
  ERC20InsufficientBalance: "Your balance is too low for this amount.",
  ERC20InsufficientAllowance: "The approval didn't go through. Approve again, then retry.",
};

function errorName(raw: Hex | undefined): string | undefined {
  if (!raw || raw === "0x") return undefined;
  try {
    const decoded = decodeErrorResult({ abi: knownErrorsAbi, data: raw });
    if (decoded.errorName === "WrappedError") {
      return errorName(decoded.args[2] as Hex) ?? "WrappedError";
    }
    return decoded.errorName;
  } catch {
    return undefined;
  }
}

/** Turns wallet, RPC and contract errors into one short sentence for the UI. */
export function friendlyError(error: unknown): string {
  if (!(error instanceof BaseError)) return "Something went wrong. Try again.";
  if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";

  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revert.data?.errorName === "WrappedError" || !revert.data ? errorName(revert.raw) : revert.data.errorName;
    if (name && MESSAGES[name]) return MESSAGES[name];
  }
  return error.shortMessage || "Something went wrong. Try again.";
}
