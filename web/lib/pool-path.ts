/**
 * Pool pages live under their token's address: /pool/<token>. A token can have more than one
 * market here (anyone can open another one for an existing token, with different rules), so
 * the token's first market owns the clean address and any later one adds ?market=<number>.
 * A launch is always its token's first market, since the token didn't exist before it.
 */

/** The fields that decide where a market's page lives. */
export type MarketRef = { id: number; subject: string; isLaunch: boolean };

export function poolPath(subject: string, id: number | bigint, isFirstForToken: boolean) {
  return isFirstForToken ? `/pool/${subject}` : `/pool/${subject}?market=${id}`;
}

/** Page paths for every market, from a complete list (ordered by id, as the Launchpad keeps it). */
export function poolPaths(markets: readonly MarketRef[]): Map<number, string> {
  const seen = new Set<string>();
  const paths = new Map<number, string>();
  for (const m of markets) {
    const token = m.subject.toLowerCase();
    paths.set(m.id, poolPath(m.subject, m.id, !seen.has(token)));
    seen.add(token);
  }
  return paths;
}

/** The markets for one token, first one first. */
export function marketsOfToken(markets: readonly MarketRef[], token: string): MarketRef[] {
  const wanted = token.toLowerCase();
  return markets.filter((m) => m.subject.toLowerCase() === wanted);
}
