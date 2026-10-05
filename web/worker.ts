// Worker entry: OpenNext's generated handler for every request, plus a cron handler for the X bot.
// wrangler.jsonc points `main` here; the cron only runs once `triggers.crons` is set there.
//
// Bundled by wrangler, not by Next, and left out of tsconfig: `.open-next/worker.js` only
// exists after `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js";
import { runBot } from "./lib/bot/posts";

/** Must match the cron in wrangler.jsonc, so consecutive runs cover back-to-back windows. */
const BOT_INTERVAL_SECONDS = 10 * 60;

/** www.arcsmith.xyz sends visitors to the bare domain, so every link and share card has one address. */
const CANONICAL_HOST = "arcsmith.xyz";

type Scheduled = { scheduledTime: number };
type Context = { waitUntil(promise: Promise<unknown>): void };

const worker = {
  fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller: Scheduled, env: Record<string, unknown>, ctx: Context) {
    ctx.waitUntil(
      runBot({ scheduledTime: controller.scheduledTime, intervalSeconds: BOT_INTERVAL_SECONDS, env }).then((run) =>
        // Shows up in Workers logs (observability is on).
        console.log(JSON.stringify({ bot: run.dryRun ? "dry-run" : "posted", window: run.window, posts: run.posts })),
      ),
    );
  },
};

export default worker;
