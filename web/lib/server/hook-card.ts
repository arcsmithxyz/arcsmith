import { getAddress } from "viem";
import { arcMainnet } from "../chains";
import { deployments } from "../deployments";
import { abilitiesOf, hookReach } from "../permissions";
import { ZERO } from "../subgraph";
import { sourceWithin } from "./hook-check";
import { tokenPools } from "./hook-reader";
import { tokenIdentity } from "./token-identity";

/**
 * What the share cards (the preview image for a Hook Reader link) say. Everything comes from the
 * address, plus the hook's published contract name when it is already known: a card is fetched by
 * a crawler that gives up quickly, so it never waits on the slow source database.
 */

/** Longest a card waits for a hook's name. A cold lookup takes seconds and carries on in the background. */
const NAME_WAIT_MS = 1_500;
/** How many of a token's hooks the token card lists. */
const TOKEN_CARD_HOOKS = 3;

async function nameOf(hook: string) {
  const mainnet = deployments[arcMainnet.id];
  if (mainnet && mainnet.kernel.toLowerCase() === hook.toLowerCase()) return "Arcsmith hook kernel";
  const source = await sourceWithin(getAddress(hook), NAME_WAIT_MS);
  return source?.published ? source.name : null;
}

/** One hook: its name if known, the headline its address earns and the abilities it has. */
export async function getHookCard(address: string) {
  const hook = getAddress(address.toLowerCase());
  return {
    address: hook,
    name: await nameOf(hook),
    reach: hookReach(hook),
    abilities: abilitiesOf(hook).filter((a) => a.can),
  };
}

/** A token: how many Uniswap v4 pools it trades in on Arc and what its most liquid hooks can do. Null if the index doesn't know it. */
export async function getTokenCard(address: string) {
  const data = await tokenPools(address);
  if (!data?.token) return null;
  const hooked = data.pools.filter((p) => p.hooks !== ZERO);
  const identity = await tokenIdentity({ address: getAddress(address), symbol: data.token.symbol, name: data.token.name }).catch(() => null);
  // Pools come most liquid first, so the first pool of each hook ranks it.
  const hooks = [...new Set(hooked.map((p) => getAddress(p.hooks)))];
  const shown = await Promise.all(
    hooks.slice(0, TOKEN_CARD_HOOKS).map(async (hook) => ({ address: hook, name: await nameOf(hook), reach: hookReach(hook) })),
  );
  return {
    symbol: data.token.symbol,
    name: data.token.name,
    identity,
    poolCount: data.pools.length,
    hookedCount: hooked.length,
    capped: data.capped,
    hooks: shown,
    moreHooks: Math.max(0, hooks.length - TOKEN_CARD_HOOKS),
  };
}
