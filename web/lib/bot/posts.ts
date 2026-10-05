import { APP_NAME, SITE_URL } from "../config";
import { formatAmount, formatUsd } from "../format";
import { getAnalytics } from "../server/analytics";
import { getFeed } from "../server/feed";
import { getPoolCard } from "../server/pool-card";
import { credentialsFrom, postToX } from "./x";

export type BotPost = { kind: "pool" | "trade" | "recap"; text: string };

/** Trades on Arcsmith pools at least this big (USD) get a post. */
const DEFAULT_MIN_TRADE_USD = 250;
/** Never more than this many posts from one run, whatever happened. */
const MAX_POSTS_PER_RUN = 5;
/** The daily recap goes out in the run whose window contains this UTC hour. */
const RECAP_HOUR_UTC = 14;

/**
 * The posts for one time window [from, to) in unix seconds: Arcsmith pools that opened, big
 * trades in Arcsmith pools, and the daily recap if the window covers its hour.
 *
 * Windows are fixed slices of time, so the bot needs no stored state: each event falls in
 * exactly one window, and if a run repeats, X rejects the identical text as a duplicate.
 */
export async function composePosts({
  from,
  to,
  minTradeUSD = DEFAULT_MIN_TRADE_USD,
  forceRecap = false,
}: {
  from: number;
  to: number;
  minTradeUSD?: number;
  forceRecap?: boolean;
}): Promise<BotPost[]> {
  const feed = await getFeed("arcsmith");
  const inWindow = feed.filter((item) => item.time >= from && item.time < to);
  const posts: BotPost[] = [];

  for (const item of inWindow.filter((i) => i.kind === "pool").reverse()) {
    if (item.marketId === null || item.poolPath === null) continue;
    const card = await getPoolCard(BigInt(item.marketId)).catch(() => null);
    if (!card) continue;
    const rules = card.blocks.length > 0 ? card.blocks.join(" + ") : "the base fee";
    posts.push({
      kind: "pool",
      text:
        `New on ${APP_NAME}: ${card.symbol} (${card.name}) ${card.isLaunch ? "just launched" : "got its own market"}.\n\n` +
        `Rules: ${rules}. Buy fee ${card.buyFee}, sell fee ${card.sellFee}. Frozen at launch.\n\n` +
        `${SITE_URL}${item.poolPath}`,
    });
  }

  for (const item of inWindow) {
    if (item.kind !== "swap" || item.valueUSD < minTradeUSD) continue;
    const link = item.poolPath !== null ? `${SITE_URL}${item.poolPath}` : SITE_URL;
    posts.push({
      kind: "trade",
      text: `A ${formatUsd(item.valueUSD)} ${item.side} of ${item.base.symbol} on ${APP_NAME}: ${formatAmount(item.baseAmount)} ${item.base.symbol}.\n\n${link}`,
    });
  }

  if (forceRecap || coversRecapHour(from, to)) {
    const recap = await composeRecap().catch(() => null);
    if (recap) posts.push(recap);
  }
  return posts.slice(0, MAX_POSTS_PER_RUN);
}

function coversRecapHour(from: number, to: number) {
  const day = Math.floor(to / 86_400) * 86_400;
  const recapAt = day + RECAP_HOUR_UTC * 3600;
  return recapAt >= from && recapAt < to;
}

async function composeRecap(): Promise<BotPost | null> {
  const data = await getAnalytics();
  const yesterday = data.daily.at(-2);
  if (!yesterday) return null;
  const lines = [
    `Yesterday on Arc: ${formatUsd(yesterday.volumeUSD)} traded through Uniswap v4, ${formatUsd(yesterday.feesUSD)} in fees.`,
    `${Math.round(data.hookedShare.volume * 100)}% of all v4 volume on Arc so far ran through pools with a hook (wash-traded pools excluded).`,
  ];
  // Arcsmith's own line waits until there is something worth saying.
  if (data.arcsmith && data.arcsmith.volumeUSD >= 1_000) {
    lines.push(`${APP_NAME}: ${data.arcsmith.pools} pools, ${formatUsd(data.arcsmith.volumeUSD)} volume to date.`);
  }
  lines.push(`${SITE_URL}/analytics`);
  return { kind: "recap", text: lines.join("\n\n") };
}

export type BotRun = { window: { from: number; to: number }; dryRun: boolean; posts: (BotPost & { result?: string })[] };

/**
 * One scheduled run: compose the window's posts and, when X credentials are configured,
 * post them. Without credentials it's a dry run that only reports what it would post.
 */
export async function runBot({
  scheduledTime,
  intervalSeconds,
  env,
}: {
  scheduledTime: number;
  intervalSeconds: number;
  env: Record<string, unknown>;
}): Promise<BotRun> {
  // Trail the clock by a minute so the index (a few seconds behind the chain) has caught up.
  const to = Math.floor(scheduledTime / 1000) - 60;
  const from = to - intervalSeconds;
  const minTrade = Number(env.BOT_MIN_TRADE_USD) || DEFAULT_MIN_TRADE_USD;
  const posts = await composePosts({ from, to, minTradeUSD: minTrade });
  const credentials = credentialsFrom(env);
  if (!credentials) return { window: { from, to }, dryRun: true, posts };

  const results: BotRun["posts"] = [];
  for (const post of posts) {
    const result = await postToX(post.text, credentials);
    results.push({ ...post, result: result.ok ? `posted ${result.id}` : result.duplicate ? "already posted" : `failed: ${result.message}` });
  }
  return { window: { from, to }, dryRun: false, posts: results };
}
