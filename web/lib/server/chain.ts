import { createPublicClient, fallback, http, type Chain } from "viem";
import { READ_ENDPOINTS } from "../rpc";

/**
 * Read-only client for server code (route handlers, server components, scripts). Uses the
 * same public endpoints as the browser, in order: Arc's own RPC rate-limits Cloudflare's
 * shared addresses, so the fallbacks matter more here than in the browser.
 */
export function serverClient(chain: Chain) {
  const endpoints = READ_ENDPOINTS[chain.id] ?? chain.rpcUrls.default.http;
  return createPublicClient({
    chain,
    transport: fallback(endpoints.map((url) => http(url, { batch: true, retryCount: 0, timeout: 8_000 }))),
  });
}

/** Latest block number from one endpoint, with how long it took; for health panels. */
export async function probeEndpoint(url: string): Promise<{ ok: boolean; block: number | null; latencyMs: number }> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(6_000),
    });
    const body = (await response.json()) as { result?: string };
    const block = body.result ? Number.parseInt(body.result, 16) : null;
    return { ok: response.ok && block !== null, block, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, block: null, latencyMs: Date.now() - started };
  }
}
