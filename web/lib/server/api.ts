import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Shared plumbing for the public API (`/api/v1`): JSON answers that any website may read,
 * errors in one shape, and a per-visitor allowance. No keys: the API is open and free.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

/** A successful answer. Clients and the edge may reuse it for `maxAge` seconds, and a stale one while refreshing. */
export function apiJson(body: unknown, maxAge = 60) {
  return Response.json(body, {
    headers: { ...CORS, "cache-control": `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}` },
  });
}

/** Every error has the same shape: `{ error: { code, message } }`. */
export function apiError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return Response.json({ error: { code, message } }, { status, headers: { ...CORS, "cache-control": "no-store", ...headers } });
}

/** The answer to a browser's CORS preflight. */
export function apiPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * Per-visitor allowance from the Workers rate-limiting binding (wrangler.jsonc, API_RATE_LIMITER:
 * 60 requests a minute). Returns the 429 answer to send, or null when the request may go ahead.
 * Outside Cloudflare (`next dev`) there is no binding and nothing is limited. Counts are per
 * Cloudflare location and eventually consistent, so short bursts can pass.
 */
export async function overLimit(request: Request) {
  let limiter: RateLimiter | undefined;
  try {
    limiter = (getCloudflareContext().env as { API_RATE_LIMITER?: RateLimiter }).API_RATE_LIMITER;
  } catch {
    return null;
  }
  if (!limiter) return null;
  const visitor =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await limiter.limit({ key: visitor });
  return success ? null : apiError(429, "rate_limited", "Too many requests. The limit is 60 a minute per address; try again shortly.", { "retry-after": "60" });
}
