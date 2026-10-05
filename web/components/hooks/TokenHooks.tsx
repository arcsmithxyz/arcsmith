import Link from "next/link";
import { arcMainnet } from "@/lib/chains";
import { APP_NAME } from "@/lib/config";
import { formatUsd, shortAddress } from "@/lib/format";
import { THIN_LIQUIDITY_USD } from "@/lib/hook-check";
import { hookReach } from "@/lib/permissions";
import type { PoolCost, TradeCost } from "@/lib/server/pool-cost";
import type { TokenIdentityAnswer } from "@/lib/server/token-identity";
import { ZERO, type HookedPool, type SubgraphToken } from "@/lib/subgraph";
import { HookSearch } from "../HookSearch";
import { HookName } from "./HookName";
import { ShareCheck } from "./ShareCheck";
import { Badge } from "../ui";

/** "3.1%", or "<0.1%" for next to nothing. */
function percent(share: number) {
  return share < 0.001 ? "<0.1%" : `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

function costText(trade: TradeCost) {
  return trade.ok ? percent(trade.cost) : "blocked";
}

/** Red when a trade costs well over the pool's own fee: that gap is the hook's doing (or a very thin pool). */
function costTone(cost: PoolCost) {
  const worst = Math.max(cost.buy.ok ? cost.buy.cost : 1, cost.sell.ok ? cost.sell.cost : 1);
  return worst - cost.poolFee > 0.02 ? "text-sell" : "";
}

/** The real token's explorer page, for comparing addresses. */
function IdentityNotice({ identity, address, symbol }: { identity: NonNullable<TokenIdentityAnswer>; address: string; symbol: string }) {
  const explorer = arcMainnet.blockExplorers.default.url;
  if (identity.status === "canonical") {
    return (
      <p className="mt-6 max-w-3xl rounded-xl border border-line px-4 py-3 text-sm">
        <span className="font-medium">This is the real {identity.token.symbol}.</span> Its address matches the one in{" "}
        <a className="underline underline-offset-2" href="https://docs.arc.io/arc/references/contract-addresses" target="_blank" rel="noreferrer">
          Arc&apos;s documentation
        </a>
        . {identity.token.note}.
      </p>
    );
  }
  const others = identity.sameSymbolCount;
  return (
    <div className="mt-6 max-w-3xl rounded-xl border border-sell/40 bg-sell-soft px-4 py-3 text-sm text-sell">
      <p className="font-medium">
        Not the real {identity.token.symbol}. This token only uses {identity.reason === "symbol" ? "its symbol" : "its name"}.
      </p>
      <p className="mt-1">
        The {identity.token.symbol} that Arc&apos;s documentation lists is{" "}
        <a className="underline underline-offset-2" href={`/hooks/${identity.token.address}`}>
          <span className="font-mono">{shortAddress(identity.token.address)}</span>
        </a>{" "}
        (<a className="underline underline-offset-2" href={`${explorer}/address/${identity.token.address}`} target="_blank" rel="noreferrer">Explorer</a>
        ). This one is <span className="font-mono">{shortAddress(address)}</span>.
        {others !== null && others > 1 && <> {others >= 1000 ? "1,000 or more" : others.toLocaleString("en-US")} tokens on Arc use the symbol {symbol}.</>} A name proves nothing: check the address.
      </p>
    </div>
  );
}

/** The strongest thing a hook can do, from its address alone (hookReach in lib/permissions.ts, shared with the API). */
function hookRisk(hook: string) {
  const { level, label } = hookReach(hook);
  const tone = level === "changes_amounts" ? "bad" : level === "can_refuse" ? "warn" : "neutral";
  return { tone, label } as const;
}

/** One sentence on where a token trades and how many of those pools run a hook. */
function summary(symbol: string, poolCount: number, hookedCount: number, hookCount: number, capped: boolean) {
  if (poolCount === 0) return `${symbol} isn't in any Uniswap v4 pool on Arc yet.`;
  const where = capped
    ? `${symbol} trades in more Uniswap v4 pools on Arc than fit here; these are the ${poolCount} most liquid.`
    : `${symbol} trades in ${poolCount} Uniswap v4 ${poolCount === 1 ? "pool" : "pools"} on Arc.`;
  if (hookedCount === 0) return `${where} None of ${capped ? "these" : "them"} runs a hook.`;
  const hooks = `${hookCount} different ${hookCount === 1 ? "hook" : "hooks"}`;
  return `${where} ${hookedCount} ${hookedCount === 1 ? "runs" : "run"} a hook (${hooks}). Read one before you trade into it.`;
}

/**
 * The Hook Reader for a token address: every Uniswap v4 pool the token trades in on Arc, the
 * hook each one runs and what that hook can do, with a link to read it and preview a swap.
 */
export function TokenHooks({
  address,
  token,
  pools,
  capped,
  arcsmithPath,
  costs,
  identity,
}: {
  address: string;
  token: SubgraphToken;
  pools: HookedPool[];
  /** True when the token is in more pools than were fetched; `pools` are then the most liquid. */
  capped: boolean;
  /** The token's Arcsmith pool page, if it has one. */
  arcsmithPath: string | null;
  /** Simulated cost of a small buy and sell, by pool id; pools without one show a dash. */
  costs: Record<string, PoolCost>;
  /** Whether this is a token Arc's docs list, or a lookalike of one; null for every other token. */
  identity: TokenIdentityAnswer;
}) {
  const hooked = pools.filter((p) => p.hooks !== ZERO);
  const hooks = new Set(hooked.map((p) => p.hooks));
  const explorer = arcMainnet.blockExplorers.default.url;

  return (
    <div className="pt-12">
      <div className="max-w-2xl">
        <HookSearch />
      </div>

      <header className="mt-10">
        <p className="eyebrow">Hook reader · token</p>
        <h1 className="headline mt-2 text-[2rem]">
          {token.symbol} <span className="text-muted">· {token.name}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm break-all text-muted">{address}</span>
          <a className="text-xs text-muted underline underline-offset-2 hover:text-text" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
            Explorer
          </a>
        </div>
      </header>

      {identity && <IdentityNotice identity={identity} address={address} symbol={token.symbol} />}

      <p className="mt-6 max-w-3xl text-lg leading-relaxed">{summary(token.symbol, pools.length, hooked.length, hooks.size, capped)}</p>

      <div className="mt-4">
        <ShareCheck
          path={`/hooks/${address}`}
          text={`${token.symbol} on Arc: ${pools.length} Uniswap v4 ${pools.length === 1 ? "pool" : "pools"}, ${hooked.length} with a hook. What each hook can do:`}
        />
      </div>

      {arcsmithPath && (
        <p className="mt-3 text-sm">
          <Link href={arcsmithPath} className="underline underline-offset-2 hover:text-validator">
            {token.symbol} has a pool on {APP_NAME}: see its rules →
          </Link>
        </p>
      )}

      {pools.length > 0 && (
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th className="px-5 py-3 font-normal">Pool</th>
                <th className="px-5 py-3 font-normal">Hook</th>
                <th className="px-5 py-3 text-right font-normal" title="A simulated $5 buy and sell through the pool, hook included">
                  Cost of a $5 trade
                </th>
                <th className="px-5 py-3 text-right font-normal">Liquidity</th>
                <th className="px-5 py-3 text-right font-normal">Volume</th>
                <th className="px-5 py-3 font-normal">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => {
                const hasHook = pool.hooks !== ZERO;
                const risk = hasHook ? hookRisk(pool.hooks) : null;
                const thin = Number(pool.totalValueLockedUSD) < THIN_LIQUIDITY_USD;
                return (
                  <tr key={pool.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      {pool.token0.symbol} / {pool.token1.symbol}
                      <span className="ml-2 font-mono text-xs text-subtle">{shortAddress(pool.id)}</span>
                    </td>
                    <td className="px-5 py-3">
                      {hasHook && risk ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <HookName address={pool.hooks} />
                          <Badge tone={risk.tone}>{risk.label}</Badge>
                        </span>
                      ) : (
                        <span className="text-muted">No hook</span>
                      )}
                    </td>
                    <td className={`tabular px-5 py-3 text-right whitespace-nowrap ${costs[pool.id] ? costTone(costs[pool.id]) : ""}`}>
                      {costs[pool.id] ? (
                        <>
                          <span className="text-subtle">Buy</span> {costText(costs[pool.id].buy)}
                          <span className="text-subtle"> · Sell</span> {costText(costs[pool.id].sell)}
                        </>
                      ) : (
                        <span className="text-subtle">–</span>
                      )}
                    </td>
                    <td className="tabular px-5 py-3 text-right">
                      {formatUsd(Number(pool.totalValueLockedUSD))}
                      {thin && <span className="ml-1.5 text-xs text-subtle">thin</span>}
                    </td>
                    <td className="tabular px-5 py-3 text-right">{formatUsd(Number(pool.volumeUSD))}</td>
                    <td className="px-5 py-3 text-right">
                      {hasHook && (
                        // Opens the hook with this pool picked in its swap preview.
                        <Link href={`/hooks/${pool.hooks}?pool=${pool.id}`} className="whitespace-nowrap underline underline-offset-2 hover:text-validator">
                          Read hook →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        From the community Arc v4 index, which runs seconds behind the chain. A hook&apos;s flags say where it can step in, not
        what it does there. The cost column is a simulation for one anonymous sender (a $5 buy and sell, including the hook and
        the pool&apos;s fee); a hook can treat other senders differently.
      </p>
    </div>
  );
}
