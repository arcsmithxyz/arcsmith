import { getAddress } from "viem";

/**
 * The tokens Arc's own documentation lists as the real thing on Arc mainnet
 * (docs.arc.io/arc/references/contract-addresses, read 2026-10-04). Anyone can deploy a token with
 * any name and symbol, so a name is no proof: the address is. Only tokens named here get a
 * "real" or "lookalike" answer; for every other token we say nothing about who made it.
 */
export type CanonicalToken = { symbol: string; name: string; address: string; note: string };

export const CANONICAL_TOKENS: CanonicalToken[] = [
  { symbol: "USDC", name: "USD Coin", address: getAddress("0x3600000000000000000000000000000000000000"), note: "Circle's USDC, Arc's gas token (ERC-20 interface, 6 decimals)" },
  { symbol: "EURC", name: "Euro Coin", address: getAddress("0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1"), note: "Circle's euro stablecoin" },
  { symbol: "USYC", name: "USYC", address: getAddress("0x8a5D989Bbb96929F689B0200f435f53dA42bF490"), note: "Tokenized money market fund shares" },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: getAddress("0x171A4217b86A807A64eB94757Db6849fb4bDbAA0"), note: "Circle's wrapped Bitcoin (8 decimals)" },
  { symbol: "WETH", name: "Wrapped Ether", address: getAddress("0x128cC466B61f542da60c70e3aA11c10e19B84EDB"), note: "Bridged WETH (lock on Ethereum, mint on Arc)" },
];

/** Uniswap v4 prices Arc's native USDC under the zero address; the index lists it as "USD Coin". It is real too. */
const NATIVE_USDC = "0x0000000000000000000000000000000000000000";

const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type TokenIdentity =
  | { status: "canonical"; token: CanonicalToken }
  | { status: "lookalike"; token: CanonicalToken; reason: "symbol" | "name" };

/**
 * Whether a token is one of the documented ones, or only looks like one (same symbol or name,
 * different address). Null when it matches none of them: then there is nothing to say.
 */
export function identityOf(token: { address: string; symbol: string; name: string }): TokenIdentity | null {
  const address = token.address.toLowerCase();
  const real = CANONICAL_TOKENS.find((c) => c.address.toLowerCase() === address);
  if (real) return { status: "canonical", token: real };
  if (address === NATIVE_USDC) return { status: "canonical", token: CANONICAL_TOKENS[0] };
  const symbol = normalize(token.symbol);
  const name = normalize(token.name);
  for (const c of CANONICAL_TOKENS) {
    if (symbol === normalize(c.symbol)) return { status: "lookalike", token: c, reason: "symbol" };
    if (name.length > 3 && name === normalize(c.name)) return { status: "lookalike", token: c, reason: "name" };
  }
  return null;
}
