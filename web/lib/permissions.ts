/**
 * Uniswap v4 reads a hook's permissions from the lowest 14 bits of its address, so they can
 * be decoded for any hook without its source code. What the hook *does* in each callback
 * still depends on its code; the flags say only where it can step in.
 */
export type Permission = {
  key: string;
  bit: number;
  label: string;
  /** What being able to run at this point allows, in plain words. */
  meaning: string;
  /** "delta" flags let the hook change the amounts a trader or LP actually settles. */
  risk: "info" | "notice" | "delta";
};

export const PERMISSIONS: Permission[] = [
  { key: "beforeInitialize", bit: 13, label: "Before pool creation", risk: "info", meaning: "Can allow or refuse new pools that name it, and set them up." },
  { key: "afterInitialize", bit: 12, label: "After pool creation", risk: "info", meaning: "Runs once a pool exists, e.g. to record it." },
  { key: "beforeAddLiquidity", bit: 11, label: "Before adding liquidity", risk: "notice", meaning: "Can refuse or react to liquidity being added." },
  { key: "afterAddLiquidity", bit: 10, label: "After adding liquidity", risk: "info", meaning: "Runs after liquidity is added." },
  { key: "beforeRemoveLiquidity", bit: 9, label: "Before removing liquidity", risk: "notice", meaning: "Can refuse liquidity withdrawals — LPs could be locked in." },
  { key: "afterRemoveLiquidity", bit: 8, label: "After removing liquidity", risk: "info", meaning: "Runs after liquidity is removed." },
  { key: "beforeSwap", bit: 7, label: "Before every swap", risk: "notice", meaning: "Can refuse trades and, on dynamic-fee pools, set the fee per trade." },
  { key: "afterSwap", bit: 6, label: "After every swap", risk: "notice", meaning: "Sees each trade's result; can refuse it after the fact." },
  { key: "beforeDonate", bit: 5, label: "Before donations", risk: "info", meaning: "Can refuse donations to LPs." },
  { key: "afterDonate", bit: 4, label: "After donations", risk: "info", meaning: "Runs after a donation to LPs." },
  { key: "beforeSwapReturnDelta", bit: 3, label: "Rewrites swap amounts (before)", risk: "delta", meaning: "Can take or add tokens before the pool prices a trade — it can replace the pool's pricing entirely." },
  { key: "afterSwapReturnDelta", bit: 2, label: "Rewrites swap amounts (after)", risk: "delta", meaning: "Can take a cut of what a trader receives or add to what they pay (used for burns and hook fees)." },
  { key: "afterAddLiquidityReturnDelta", bit: 1, label: "Rewrites LP deposits", risk: "delta", meaning: "Can change how much an LP pays in when adding liquidity." },
  { key: "afterRemoveLiquidityReturnDelta", bit: 0, label: "Rewrites LP withdrawals", risk: "delta", meaning: "Can change how much an LP receives when withdrawing." },
];

export function decodePermissions(address: string) {
  const low = parseInt(address.slice(-4), 16) & 0x3fff;
  return PERMISSIONS.map((p) => ({ ...p, enabled: (low & (1 << p.bit)) !== 0 }));
}

/**
 * The questions traders and liquidity providers actually have, answered from the flags.
 * Any callback can revert, which cancels the whole transaction, so a hook that runs before
 * *or after* an action can block it.
 */
export type Ability = {
  key: string;
  audience: "trade" | "liquidity";
  question: string;
  /** For the one-line summary: "this hook can …". */
  short: string;
  /** For tight spaces such as table badges. */
  badge: string;
  /** How much a "yes" should worry someone: "bad" can cost them money, "warn" can stop them. */
  severity: "warn" | "bad";
  flags: string[];
  yes: string;
  no: string;
};

export const ABILITIES: Ability[] = [
  {
    key: "cut",
    badge: "Can take a cut",
    audience: "trade",
    question: "Can it take a cut of your trade?",
    short: "take a cut of your trade",
    severity: "bad",
    flags: ["beforeSwapReturnDelta", "afterSwapReturnDelta"],
    yes: "It can keep part of what you receive, or charge you more than the pool's price. Hooks use this for their own fees and for burns.",
    no: "It can't change what you pay or receive.",
  },
  {
    key: "price",
    badge: "Sets its own price",
    audience: "trade",
    question: "Can it set its own price?",
    short: "fill trades at its own price",
    severity: "bad",
    flags: ["beforeSwapReturnDelta"],
    yes: "It can skip the pool and price your trade itself.",
    no: "Your trade is always priced by the pool.",
  },
  {
    key: "fee",
    badge: "Sets the fee",
    audience: "trade",
    question: "Can it change the fee trade by trade?",
    short: "change the fee trade by trade",
    severity: "warn",
    flags: ["beforeSwap"],
    yes: "On pools set up for it, it can raise or lower the fee on each trade.",
    no: "It can't set a fee for each trade.",
  },
  {
    key: "blockTrade",
    badge: "Can block trades",
    audience: "trade",
    question: "Can it block your trade?",
    short: "block trades",
    severity: "warn",
    flags: ["beforeSwap", "afterSwap"],
    yes: "It can stop a trade from going through. You'd only lose the network fee.",
    no: "It can't refuse trades.",
  },
  {
    key: "lock",
    badge: "Can lock liquidity",
    audience: "liquidity",
    question: "Can it lock liquidity in?",
    short: "lock liquidity in",
    severity: "bad",
    flags: ["beforeRemoveLiquidity", "afterRemoveLiquidity"],
    yes: "It can refuse withdrawals, so liquidity providers could get stuck.",
    no: "It can't stop liquidity providers from withdrawing.",
  },
  {
    key: "lpCut",
    badge: "Can cut LP funds",
    audience: "liquidity",
    question: "Can it take a cut of deposits or withdrawals?",
    short: "take a cut when liquidity is added or withdrawn",
    severity: "bad",
    flags: ["afterAddLiquidityReturnDelta", "afterRemoveLiquidityReturnDelta"],
    yes: "It can change how much a liquidity provider pays in or gets back.",
    no: "Liquidity providers pay in and get back exactly what the pool says.",
  },
  {
    key: "blockDeposit",
    badge: "Can refuse liquidity",
    audience: "liquidity",
    question: "Can it refuse new liquidity?",
    short: "refuse new liquidity",
    severity: "warn",
    flags: ["beforeAddLiquidity", "afterAddLiquidity"],
    yes: "It can turn deposits away, or accept them only from some people.",
    no: "Anyone can add liquidity.",
  },
];

/** Each ability with whether this hook has it. */
export function abilitiesOf(address: string) {
  const enabled = new Set(decodePermissions(address).filter((p) => p.enabled).map((p) => p.key));
  return ABILITIES.map((a) => ({ ...a, can: a.flags.some((f) => enabled.has(f)) }));
}

export function isAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * The strongest thing a hook can do, from its address alone. A capability, never a verdict:
 * "changes_amounts" means it may alter what people pay or receive, not that it does.
 */
export type ReachLevel = "changes_amounts" | "can_refuse" | "informational" | "none";

export function hookReach(address: string): { level: ReachLevel; label: string } {
  const enabled = decodePermissions(address).filter((p) => p.enabled);
  if (enabled.some((p) => p.risk === "delta")) return { level: "changes_amounts", label: "Can move your money" };
  if (enabled.some((p) => p.risk === "notice")) return { level: "can_refuse", label: "Can refuse trades" };
  if (enabled.length > 0) return { level: "informational", label: "Informational only" };
  return { level: "none", label: "No callbacks" };
}

/** One plain sentence on what a hook can do, from its flags. */
export function summarizePermissions(address: string) {
  if (!decodePermissions(address).some((p) => p.enabled)) return "This address has no hook permissions, so it can't act as a hook on any pool.";
  const can = abilitiesOf(address).filter((a) => a.can).map((a) => a.short);
  if (can.length === 0) return "In short: this hook can't touch your trade or your liquidity. It only runs alongside the pool.";
  const list = can.length === 1 ? can[0] : `${can.slice(0, -1).join(", ")} and ${can[can.length - 1]}`;
  return `In short: this hook can ${list}.`;
}
