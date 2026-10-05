import { launchpadAbi } from "../abi/Launchpad";
import { chain, deployment } from "../config";
import { marketsOfToken, poolPaths, type MarketRef } from "../pool-path";
import { cached } from "./cache";
import { serverClient } from "./chain";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Pool pages used to live at /pool/<market number>; those links still work. */
const LEGACY_ID = /^\d{1,9}$/;

/** Every market on the site's network, in Launchpad order. Cached 30 s. */
function getMarketRefs(): Promise<MarketRef[]> {
  return cached(`market-refs:${chain.id}`, 30, loadMarketRefs);
}

async function loadMarketRefs(): Promise<MarketRef[]> {
  if (!deployment) return [];
  const client = serverClient(chain);
  const count = await client.readContract({ address: deployment.launchpad, abi: launchpadAbi, functionName: "marketCount" });
  if (count === 0n) return [];
  const markets = await client.readContract({
    address: deployment.launchpad,
    abi: launchpadAbi,
    functionName: "getMarkets",
    args: [0n, count],
  });
  return markets.map((m, i) => ({ id: i, subject: m.subject, isLaunch: m.isLaunch }));
}

/**
 * A token's Arcsmith pool page, or null. Uses only the cached list (no fresh read on a miss),
 * for pages that merely link to it, like the Hook Reader's token view.
 */
export async function poolPathOfToken(token: string): Promise<string | null> {
  const refs = await getMarketRefs();
  const first = marketsOfToken(refs, token)[0];
  return first ? poolPaths(refs).get(first.id)! : null;
}

export type PoolPage =
  | { kind: "page"; id: bigint; token: string; others: { id: number; path: string }[] }
  | { kind: "redirect"; path: string }
  | { kind: "missing" };

/**
 * What /pool/<segment>?market=<n> should show. The segment is a token address (or, for old
 * links, a market number, which redirects to its token's address). A `market` that is already
 * the token's first market redirects to the clean address, so every pool has one URL.
 */
export async function resolvePoolPage(segment: string, market: string | undefined): Promise<PoolPage> {
  const isToken = ADDRESS.test(segment);
  if (!isToken && !LEGACY_ID.test(segment)) return { kind: "missing" };

  // A pool launched a moment ago may not be in the cached list yet: look again, uncached.
  let refs = await getMarketRefs();
  const known = (list: MarketRef[]) =>
    isToken ? marketsOfToken(list, segment).length > 0 : Number(segment) < list.length;
  if (!known(refs)) refs = await loadMarketRefs();
  if (!known(refs)) return { kind: "missing" };

  const paths = poolPaths(refs);
  if (!isToken) return { kind: "redirect", path: paths.get(Number(segment))! };

  const mine = marketsOfToken(refs, segment);
  const requested = market !== undefined && LEGACY_ID.test(market) ? Number(market) : null;
  if (requested !== null && !mine.some((m) => m.id === requested)) return { kind: "missing" };
  if (requested === mine[0].id) return { kind: "redirect", path: paths.get(requested)! };

  const shown = requested ?? mine[0].id;
  // One URL per pool: an address typed in other letter case goes to the checksummed one.
  if (segment !== mine[0].subject) return { kind: "redirect", path: paths.get(shown)! };
  return {
    kind: "page",
    id: BigInt(shown),
    token: mine[0].subject,
    others: mine.filter((m) => m.id !== shown).map((m) => ({ id: m.id, path: paths.get(m.id)! })),
  };
}
