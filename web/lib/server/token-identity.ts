import { getAddress } from "viem";
import { identityOf, type TokenIdentity } from "../canonical-tokens";
import { countTokensWithSymbol } from "../subgraph";
import { cached } from "./cache";

/** "1,000" means that many or more. */
const COUNT_CAP = 1000;

export type TokenIdentityAnswer = (TokenIdentity & { sameSymbolCount: number | null }) | null;

/**
 * Whether a token is the documented one or a lookalike of it. For a lookalike it also counts the
 * tokens sharing its symbol (an hour's cache; only lookalikes ask the index, which allows few queries).
 */
export async function tokenIdentity(token: { address: string; symbol: string; name: string }): Promise<TokenIdentityAnswer> {
  const identity = identityOf({ ...token, address: getAddress(token.address) });
  if (!identity) return null;
  if (identity.status === "canonical") return { ...identity, sameSymbolCount: null };
  const count = await cached(`symbol-count:${token.symbol}`, 3600, () => countTokensWithSymbol(token.symbol)).catch(() => null);
  return { ...identity, sameSymbolCount: count };
}

export { COUNT_CAP };
