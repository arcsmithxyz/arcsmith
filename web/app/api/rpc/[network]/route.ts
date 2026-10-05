import { getCloudflareContext } from "@opennextjs/cloudflare";
import { arcMainnet, arcTestnet } from "@/lib/chains";
import { READ_ENDPOINTS } from "@/lib/rpc";

/**
 * Same-origin JSON-RPC relay to Arc's public nodes — the last fallback for the app's reads
 * (see lib/rpc.ts).
 *
 * Why it exists: the EasyPrivacy list (used by Brave Shields and uBlock) blocks every
 * third-party request to arc.io (`||arc.io^$third-party`, left over from an old ad network on
 * that domain). The browser normally reaches Arc directly or through other public endpoints;
 * this relay covers whatever is left. Upstreams are tried in order, moving on when one is
 * rate-limiting (Cloudflare's shared addresses hit per-IP limits) or failing.
 *
 * Scope: read-only methods only, to fixed upstreams (no user-supplied URLs), with size and
 * batch limits so this can't be used as a general-purpose proxy.
 */
const UPSTREAMS: Record<string, string[]> = {
  mainnet: READ_ENDPOINTS[arcMainnet.id],
  testnet: READ_ENDPOINTS[arcTestnet.id],
};

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
]);

const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH = 100;
const RATE_LIMITED = /"code":\s*-32005|rate limit/i;

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

function rpcError(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message } }, { status, headers });
}

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * Per-IP allowance from the Workers rate-limiting binding (wrangler.jsonc: 60 requests per
 * 10 seconds). Outside Cloudflare (`next dev` / `next start`) there's no binding and nothing
 * is limited.
 */
async function checkLimit(request: Request): Promise<{ allowed: boolean; state: string }> {
  let limiter: RateLimiter | undefined;
  try {
    limiter = (getCloudflareContext().env as { RPC_RATE_LIMITER?: RateLimiter }).RPC_RATE_LIMITER;
  } catch {
    return { allowed: true, state: "no-context" };
  }
  if (!limiter) return { allowed: true, state: "no-binding" };
  // Keyed by the visitor's IP. Counts are per Cloudflare location and eventually consistent,
  // so short bursts can pass; sustained abuse from one place is cut off.
  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await limiter.limit({ key: ip });
  return { allowed: success, state: success ? "ok" : "limited" };
}

export async function POST(request: Request, context: RouteContext<"/api/rpc/[network]">) {
  const { network } = await context.params;
  const upstreams = UPSTREAMS[network];
  if (!upstreams) return rpcError(404, "Unknown network.");
  const limit = await checkLimit(request);
  if (!limit.allowed) {
    return rpcError(429, "Too many requests. Slow down and try again in a few seconds.", { "retry-after": "10" });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return rpcError(413, "Request too large.");

  let payload: RpcCall | RpcCall[];
  try {
    payload = JSON.parse(text);
  } catch {
    return rpcError(400, "Invalid JSON.");
  }
  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > MAX_BATCH) return rpcError(400, "Invalid batch size.");
  if (calls.some((c) => typeof c?.method !== "string" || !ALLOWED_METHODS.has(c.method))) {
    return rpcError(403, "Method not allowed through this relay.");
  }

  // Try each upstream until one answers without failing or rate-limiting.
  let last: { status: number; body: string } | null = null;
  for (const upstream of upstreams) {
    try {
      const response = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
        signal: AbortSignal.timeout(8_000),
      });
      const body = await response.text();
      last = { status: response.status, body };
      if (response.ok && !RATE_LIMITED.test(body)) break;
    } catch {
      // Timeout or network error: try the next upstream.
    }
  }
  if (!last) return rpcError(502, "No upstream answered.");
  return new Response(last.body, {
    status: last.status,
    // x-relay-limiter says whether the per-IP limit was applied (ok) or unavailable here.
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-relay-limiter": limit.state },
  });
}
