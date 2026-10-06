import type { Address } from "viem";
import { SITE_URL } from "../config";
import { CHECK_ABOUT } from "../hook-check";
import { checkToken } from "./hook-check";
import type { PoolCost } from "./pool-cost";

/**
 * The go/stop answer behind the MCP tool `pre_trade_check`: a token run through rules the caller
 * sets (a cost limit, whether to refuse lookalikes). Arcsmith applies no judgement of its own about
 * whether a token is safe, and "unknown" is never a go.
 */

const ABOUT = `A simulation for one anonymous sender, not a safety rating: a hook can treat other senders differently, so a real trade can differ. ${CHECK_ABOUT}`;

/** The worst of a pool's buy and sell cost, as a share; a refused trade counts as 100%. */
function worstCost(cost: PoolCost) {
  return Math.max(cost.buy.ok ? cost.buy.cost : 1, cost.sell.ok ? cost.sell.cost : 1);
}

export async function preTradeCheck(address: Address, rules: { maxCostPercent: number; blockLookalike: boolean }) {
  const token = await checkToken(address, true);
  if (!token) {
    return { decision: "unknown", reasons: ["The Arc index doesn't know this address as a token in any Uniswap v4 pool."], rules, about: ABOUT };
  }

  const stop: string[] = [];
  const notes: string[] = [];
  const limit = rules.maxCostPercent / 100;

  if (token.identity?.status === "lookalike" && rules.blockLookalike) {
    stop.push(`Lookalike: it uses the ${token.identity.matchedBy} of the real ${token.identity.realSymbol}, which is ${token.identity.realAddress}.`);
  }

  const priced = token.pools.flatMap((pool) => ("cost" in pool && pool.cost ? [{ id: pool.id, cost: pool.cost as PoolCost }] : []));
  if (priced.length === 0) {
    notes.push("No pool could be simulated (no hooked pool with USDC or EURC, or the simulation was late).");
  } else {
    // A pool that refuses a buy or a sell can't be used; the best of the rest is what a trade would pay.
    const usable = priced.filter((p) => p.cost.buy.ok && p.cost.sell.ok).sort((a, b) => worstCost(a.cost) - worstCost(b.cost));
    if (usable.length === 0) {
      const refusal = priced.flatMap((p) => [p.cost.sell, p.cost.buy]).find((t) => !t.ok);
      stop.push(`No simulated pool accepts both a buy and a sell${refusal && !refusal.ok ? ` (${refusal.reason})` : ""}.`);
    } else {
      const best = usable[0];
      const percent = (worstCost(best.cost) * 100).toFixed(1);
      if (worstCost(best.cost) > limit) stop.push(`The cheapest simulated pool costs ${percent}% on a $5 trade, over your ${rules.maxCostPercent}% limit.`);
      else notes.push(`The cheapest simulated pool costs ${percent}% on a $5 trade: pool ${best.id}.`);
      if (usable.length < priced.length) notes.push("Some pools refuse a trade; use the pool named above.");
    }
  }

  const decision = stop.length > 0 ? "stop" : priced.length === 0 ? "unknown" : "proceed";
  return {
    decision,
    reasons: stop.length > 0 ? stop : notes,
    ...(stop.length > 0 && notes.length > 0 ? { notes } : {}),
    rules,
    token: token.token,
    links: { reader: `${SITE_URL}/hooks/${token.address}` },
    about: ABOUT,
  };
}
