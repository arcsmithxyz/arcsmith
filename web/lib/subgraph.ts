/**
 * Arc mainnet Uniswap v4 data from a community subgraph (github.com/PaulieB14/uniswap-v4-arc-subgraph),
 * which indexes every pool and hook on Arc with decoded hook permissions.
 *
 * Mainnet only: there is no testnet index, so the Hook Reader and hook-wide stats always
 * describe Arc mainnet, whichever network the app trades on.
 *
 * Caveat for launch: this is a Subgraph Studio development endpoint — free and keyless but
 * rate-limited and without an uptime promise. Before a public launch, query it through the
 * decentralized network with an API key (or run our own index).
 */
const ENDPOINT =
  process.env.NEXT_PUBLIC_ARC_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/111767/uniswap-v4---arc/version/latest";

/**
 * The endpoint allows 3,000 queries a day, shared by every app that uses it. Once it answers 429
 * it keeps refusing until its Retry-After (hours, typically), so after a 429 this isolate stops
 * calling it until then and callers fall back to cached answers (lib/server/cache.ts).
 */
let refusingUntil = 0;
/** How long to wait after a 429 without a usable Retry-After. */
const DEFAULT_BACKOFF_SECONDS = 5 * 60;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

/**
 * Server-only: browsers read the index through /api/index (lib/index-client.ts), so that many
 * visitors share one cached answer instead of each spending the daily allowance.
 */
export async function query<T>(gql: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (Date.now() < refusingUntil) throw new Error("The Arc index is over its daily limit");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: gql, variables }),
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, MAX_BACKOFF_SECONDS) : DEFAULT_BACKOFF_SECONDS;
    refusingUntil = Date.now() + wait * 1000;
    throw new Error("The Arc index is over its daily limit");
  }
  if (!res.ok) throw new Error(`Subgraph answered ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("Subgraph returned no data");
  return body.data;
}

export type HookStats = {
  id: string;
  poolCount: string;
  txCount: string;
  volumeUSD: string;
  feesUSD: string;
  totalValueLockedUSD: string;
  createdAtTimestamp: string;
  hasCustomAccounting: boolean;
};

export type SubgraphToken = { id: string; symbol: string; name: string; decimals: string };

export type SubgraphPool = {
  id: string;
  createdAtTimestamp: string;
  feeTier: string;
  tickSpacing: string;
  txCount: string;
  volumeUSD: string;
  feesUSD: string;
  totalValueLockedUSD: string;
  token0: SubgraphToken;
  token1: SubgraphToken;
};

const HOOK_FIELDS = "id poolCount txCount volumeUSD feesUSD totalValueLockedUSD createdAtTimestamp hasCustomAccounting";
const TOKEN_FIELDS = "id symbol name decimals";
const POOL_FIELDS = `id createdAtTimestamp feeTier tickSpacing txCount volumeUSD feesUSD totalValueLockedUSD token0 { ${TOKEN_FIELDS} } token1 { ${TOKEN_FIELDS} }`;

/** The index records pools without a hook under the zero address. */
export const ZERO = "0x0000000000000000000000000000000000000000";

/** Stats and busiest pools for one hook. `hook` is null when the index has never seen it. */
export async function fetchHook(address: string) {
  const id = address.toLowerCase();
  const data = await query<{ hook: HookStats | null; pools: SubgraphPool[]; _meta: { block: { timestamp: number } } }>(
    `query($id: String!) {
      hook(id: $id) { ${HOOK_FIELDS} }
      pools(first: 25, where: { hooks: $id }, orderBy: totalValueLockedUSD, orderDirection: desc) { ${POOL_FIELDS} }
      _meta { block { timestamp } }
    }`,
    { id },
  );
  return { hook: data.hook, pools: data.pools, indexedAt: data._meta.block.timestamp };
}

/** Whether the index knows an address as a hook (with pools), as a token, or both. */
export async function fetchAddressKind(address: string) {
  const id = address.toLowerCase();
  const data = await query<{ hook: { poolCount: string } | null; token: { id: string } | null }>(
    `query($id: String!) { hook(id: $id) { poolCount } token(id: $id) { id } }`,
    { id },
  );
  return { isHook: Number(data.hook?.poolCount ?? 0) > 0, isToken: data.token !== null };
}

/** A token and every v4 pool it trades in on Arc (hooked or not), most liquid first. */
export async function fetchTokenPools(address: string) {
  const id = address.toLowerCase();
  // Two filters rather than `or`, which older graph-node versions don't support.
  const data = await query<{ token: SubgraphToken | null; a: HookedPool[]; b: HookedPool[]; _meta: { block: { timestamp: number } } }>(
    `query($id: String!) {
      token(id: $id) { ${TOKEN_FIELDS} }
      a: pools(first: 50, where: { token0: $id }, orderBy: totalValueLockedUSD, orderDirection: desc) { ${POOL_FIELDS} hooks }
      b: pools(first: 50, where: { token1: $id }, orderBy: totalValueLockedUSD, orderDirection: desc) { ${POOL_FIELDS} hooks }
      _meta { block { timestamp } }
    }`,
    { id },
  );
  const pools = [...data.a, ...data.b].sort((x, y) => Number(y.totalValueLockedUSD) - Number(x.totalValueLockedUSD));
  // A full page on either side means there are more (USDC alone is in most pools on Arc).
  const capped = data.a.length === 50 || data.b.length === 50;
  return { token: data.token, pools, capped, indexedAt: data._meta.block.timestamp };
}

/** The hooks with the most pools on Arc, excluding "no hook". */
export async function fetchTopHooks(orderBy: "poolCount" | "volumeUSD" | "totalValueLockedUSD" = "poolCount", first = 30) {
  const data = await query<{ hooks: HookStats[] }>(
    `query($zero: String!) {
      hooks(first: ${first}, orderBy: ${orderBy}, orderDirection: desc, where: { id_not: $zero }) { ${HOOK_FIELDS} }
    }`,
    { zero: ZERO },
  );
  return data.hooks;
}

/** Pool-level stats for pools we opened, by pool id. */
export async function fetchPools(ids: string[]) {
  if (ids.length === 0) return [];
  const data = await query<{ pools: SubgraphPool[] }>(
    `query($ids: [String!]!) { pools(first: 100, where: { id_in: $ids }) { ${POOL_FIELDS} } }`,
    { ids: ids.map((i) => i.toLowerCase()) },
  );
  return data.pools;
}

export type HookedPool = SubgraphPool & { hooks: string };

/** One pool by id with the hook it runs; null when the index doesn't know it. */
export async function fetchHookedPool(id: string) {
  const data = await query<{ pools: HookedPool[] }>(
    `query($ids: [String!]!) { pools(first: 1, where: { id_in: $ids }) { ${POOL_FIELDS} hooks } }`,
    { ids: [id.toLowerCase()] },
  );
  return data.pools[0] ?? null;
}

export type HookedPoolOrder = "totalValueLockedUSD" | "txCount" | "volumeUSD";

/** The busiest pools on Arc that run any v4 hook (not only ours). */
export async function fetchHookedPools(orderBy: HookedPoolOrder, first = 30) {
  const data = await query<{ pools: HookedPool[] }>(
    `query($zero: String!) {
      pools(first: ${first}, orderBy: ${orderBy}, orderDirection: desc, where: { hooks_not: $zero }) { ${POOL_FIELDS} hooks }
    }`,
    { zero: ZERO },
  );
  return data.pools;
}

/** Network-wide Uniswap v4 totals on Arc, plus how many hooks have pools (capped at 1,000). */
export async function fetchArcTotals() {
  const data = await query<{
    poolManagers: { poolCount: string; txCount: string; totalVolumeUSD: string; totalValueLockedUSD: string }[];
    hooks: { id: string }[];
  }>(
    `query($zero: String!) {
      poolManagers(first: 1) { poolCount txCount totalVolumeUSD totalValueLockedUSD }
      hooks(first: 1000, where: { id_not: $zero, poolCount_gt: 0 }) { id }
    }`,
    { zero: ZERO },
  );
  const manager = data.poolManagers[0];
  return {
    pools: Number(manager?.poolCount ?? 0),
    swaps: Number(manager?.txCount ?? 0),
    volumeUSD: Number(manager?.totalVolumeUSD ?? 0),
    liquidityUSD: Number(manager?.totalValueLockedUSD ?? 0),
    hooks: data.hooks.length,
    hooksCapped: data.hooks.length >= 1000,
  };
}

export type IndexMeta = { block: number; timestamp: number; hasIndexingErrors: boolean };

const META_FIELDS = "_meta { block { number timestamp } hasIndexingErrors }";

function toMeta(meta: { block: { number: number; timestamp: number }; hasIndexingErrors: boolean }): IndexMeta {
  return { block: meta.block.number, timestamp: meta.block.timestamp, hasIndexingErrors: meta.hasIndexingErrors };
}

/** Every pool that uses `hook`, oldest first (up to 1,000). */
export async function fetchPoolsOfHook(hook: string) {
  const data = await query<{ pools: SubgraphPool[] }>(
    `query($id: String!) {
      pools(first: 1000, where: { hooks: $id }, orderBy: createdAtTimestamp, orderDirection: asc) { ${POOL_FIELDS} }
    }`,
    { id: hook.toLowerCase() },
  );
  return data.pools;
}

export type ArcDay = { date: number; volumeUSD: number; tvlUSD: number; feesUSD: number; transactions: number };

/**
 * Daily Uniswap v4 activity on Arc, oldest first, plus where the index stands. The index's
 * daily `txCount` is a running total, so it's turned into a per-day count here.
 */
export async function fetchArcDaily(): Promise<{ days: ArcDay[]; meta: IndexMeta }> {
  const data = await query<{
    uniswapDayDatas: { date: number; volumeUSD: string; tvlUSD: string; feesUSD: string; txCount: string }[];
    _meta: { block: { number: number; timestamp: number }; hasIndexingErrors: boolean };
  }>(`{
    uniswapDayDatas(first: 1000, orderBy: date, orderDirection: asc) { date volumeUSD tvlUSD feesUSD txCount }
    ${META_FIELDS}
  }`);
  let previous = 0;
  const days = data.uniswapDayDatas.map((d) => {
    const total = Number(d.txCount);
    const day = {
      date: d.date,
      volumeUSD: Number(d.volumeUSD),
      tvlUSD: Number(d.tvlUSD),
      feesUSD: Number(d.feesUSD),
      transactions: Math.max(0, total - previous),
    };
    previous = total;
    return day;
  });
  return { days, meta: toMeta(data._meta) };
}

/** Totals for pools without a hook, to split activity into hooked vs plain. */
export async function fetchPlainPoolTotals() {
  const data = await query<{ hook: HookStats | null }>(`query($zero: String!) { hook(id: $zero) { ${HOOK_FIELDS} } }`, { zero: ZERO });
  return data.hook;
}

/** Where the index stands; cheap enough for health checks. */
export async function fetchIndexMeta() {
  const data = await query<{ _meta: { block: { number: number; timestamp: number }; hasIndexingErrors: boolean } }>(`{ ${META_FIELDS} }`);
  return toMeta(data._meta);
}

/**
 * Hourly or daily candles for one pool, oldest first. Prices are in the index's orientation:
 * token0 per one token1 (`token0Price`); callers flip them for the subject they show.
 */
export type PoolCandle = { time: number; open: number; high: number; low: number; close: number; volumeUSD: number };

export async function fetchPoolCandles(poolId: string, interval: "hour" | "day", first = 500): Promise<PoolCandle[]> {
  const id = poolId.toLowerCase();
  type Row = { open: string; high: string; low: string; close: string; volumeUSD: string };
  if (interval === "hour") {
    const data = await query<{ poolHourDatas: (Row & { periodStartUnix: number })[] }>(
      `query($id: String!) {
        poolHourDatas(first: ${first}, where: { pool: $id }, orderBy: periodStartUnix, orderDirection: desc) {
          periodStartUnix open high low close volumeUSD
        }
      }`,
      { id },
    );
    return data.poolHourDatas.map((r) => toCandle(r.periodStartUnix, r)).reverse();
  }
  const data = await query<{ poolDayDatas: (Row & { date: number })[] }>(
    `query($id: String!) {
      poolDayDatas(first: ${first}, where: { pool: $id }, orderBy: date, orderDirection: desc) { date open high low close volumeUSD }
    }`,
    { id },
  );
  return data.poolDayDatas.map((r) => toCandle(r.date, r)).reverse();
}

function toCandle(time: number, r: { open: string; high: string; low: string; close: string; volumeUSD: string }): PoolCandle {
  return { time, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volumeUSD: Number(r.volumeUSD) };
}

/** One swap as the index records it. Amounts are from the pool's side: positive = paid in. */
export type SubgraphSwap = {
  id: string;
  timestamp: string;
  amount0: string;
  amount1: string;
  amountUSD: string;
  origin: string;
  transaction: { id: string };
};

export type FeedSwap = SubgraphSwap & {
  pool: { id: string; hooks: string; token0: SubgraphToken; token1: SubgraphToken };
};

const SWAP_FIELDS = "id timestamp amount0 amount1 amountUSD origin transaction { id }";

/** The latest swaps in one pool, newest first. */
export async function fetchPoolSwaps(poolId: string, first = 50) {
  const data = await query<{ swaps: SubgraphSwap[] }>(
    `query($id: String!) { swaps(first: ${first}, where: { pool: $id }, orderBy: timestamp, orderDirection: desc) { ${SWAP_FIELDS} } }`,
    { id: poolId.toLowerCase() },
  );
  return data.swaps;
}

/** The latest swaps in pools run by one hook, or in every hooked pool on Arc. Newest first. */
export async function fetchRecentSwaps(scope: { hook: string } | "hooked", first = 30) {
  const hooked = scope === "hooked";
  const data = await query<{ swaps: FeedSwap[] }>(
    `query($hook: String!) {
      swaps(first: ${first}, orderBy: timestamp, orderDirection: desc, where: { pool_: { ${hooked ? "hooks_not" : "hooks"}: $hook } }) {
        ${SWAP_FIELDS} pool { id hooks token0 { ${TOKEN_FIELDS} } token1 { ${TOKEN_FIELDS} } }
      }
    }`,
    { hook: hooked ? ZERO : scope.hook.toLowerCase() },
  );
  return data.swaps;
}

/** What /api/pool-history returns: candles (oldest first) and recent trades (newest first). */
export type PoolHistory = { candles: PoolCandle[]; swaps: SubgraphSwap[] };

/** How many tokens on Arc use this exact symbol (up to 1,000), ids only so the answer stays small. */
export async function countTokensWithSymbol(symbol: string) {
  const data = await query<{ tokens: { id: string }[] }>(
    `query($s: String!) { tokens(first: 1000, where: { symbol: $s }) { id } }`,
    { s: symbol },
  );
  return data.tokens.length;
}
