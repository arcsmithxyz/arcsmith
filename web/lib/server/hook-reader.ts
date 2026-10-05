import { fetchAddressKind, fetchTokenPools } from "../subgraph";
import { cached } from "./cache";

/**
 * Server reads for the Hook Reader. An address pasted there can be a hook or a token: a hook
 * gets its report, a token gets the list of pools it trades in, each with its hook.
 */

/** "token" only when the index knows the address as a token and not as a hook with pools. */
export async function readerKind(address: string): Promise<"hook" | "token"> {
  const kind = await cached(`reader-kind:${address.toLowerCase()}`, 3600, () => fetchAddressKind(address));
  return kind.isToken && !kind.isHook ? "token" : "hook";
}

/** Every v4 pool a token trades in on Arc. Cached five minutes: liquidity moves, but the index allowance is small. */
export function tokenPools(address: string) {
  return cached(`token-pools:${address.toLowerCase()}`, 300, () => fetchTokenPools(address));
}
