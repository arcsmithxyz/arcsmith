import { fallback, http, type Chain, type Transport } from "viem";
import { arcMainnet, arcTestnet } from "./chains";

/**
 * Public read endpoints per Arc network, in order of preference (from the chainid.network
 * registry, checked for CORS and batching). The official arc.io endpoints come first, but ad
 * blockers block arc.io (EasyPrivacy `||arc.io^$third-party`), so the rest are on other
 * domains. Also used by the /api/rpc relay as its upstreams.
 */
export const READ_ENDPOINTS: Record<number, string[]> = {
  [arcMainnet.id]: [arcMainnet.rpcUrls.default.http[0], "https://arc.drpc.org", "https://rpc.beamrpc.com"],
  [arcTestnet.id]: [arcTestnet.rpcUrls.default.http[0], "https://rpc.testnet.arc.network", "https://arc-testnet.drpc.org"],
};

const RELAYED: Record<number, string> = {
  [arcMainnet.id]: "mainnet",
  [arcTestnet.id]: "testnet",
};

function customUrl(chainId: number) {
  if (chainId === arcMainnet.id) return process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL;
  if (chainId === arcTestnet.id) return process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL;
  return undefined;
}

/**
 * Transport for the app's own reads (wallet transactions use the wallet's own RPC).
 *
 * On Arc: the public endpoints in order, then our same-origin relay as a last resort. A
 * visitor whose browser blocks arc.io fails that endpoint instantly and moves on; nobody
 * depends on the relay, which shares Cloudflare's addresses and so Arc's per-IP rate limits.
 * A dedicated RPC set in NEXT_PUBLIC_ARC_*_RPC_URL replaces all of this.
 */
export function appTransport(chain: Chain): Transport {
  const custom = customUrl(chain.id);
  if (custom) return http(custom, { batch: true });

  const endpoints = READ_ENDPOINTS[chain.id];
  // Server-side (and the local Anvil chain): plain public URL; reads only run in the browser.
  if (!endpoints || typeof window === "undefined") return http(undefined, { batch: true });

  return fallback([
    // No retries per endpoint: a blocked or failing one should hand over immediately.
    ...endpoints.map((url) => http(url, { batch: true, retryCount: 0, timeout: 8_000 })),
    http(`${window.location.origin}/api/rpc/${RELAYED[chain.id]}`, { batch: true }),
  ]);
}
