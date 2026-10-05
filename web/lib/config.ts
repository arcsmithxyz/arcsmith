import { arcMainnet, arcTestnet, localChain } from "./chains";
import { deployments } from "./deployments";

/** Product name shown in the UI. A placeholder — change it here and nowhere else. */
export const APP_NAME = "Arcsmith";

/** Public address of the site, for share links and absolute image URLs. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://arcsmith.xyz";

/** The project's X (Twitter) profile. While null, the X icon shows as "soon" and links nowhere. */
export const X_URL: string | null = "https://x.com/ArcSmith_xyz";

/** The Arcsmith token: its ticker, and its contract address (while null, the CA slot shows "Soon"). */
export const TOKEN_SYMBOL = "SMITH";
export const TOKEN_ADDRESS: `0x${string}` | null = "0xe8ac3CD26df2BB82D1752057438e51B482496D05";

/**
 * Which network this build talks to: "testnet" (default), "mainnet" for production, or
 * "local" for the Anvil chain that `pnpm dev:local` starts.
 */
const NETWORK = process.env.NEXT_PUBLIC_ARC_NETWORK;
export const chain = NETWORK === "mainnet" ? arcMainnet : NETWORK === "local" ? localChain : arcTestnet;

/** Contract addresses for the active network, or null before they are deployed. */
export const deployment = deployments[chain.id] ?? null;

export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;
export const TOKEN_SUPPLY = 1_000_000_000n * 10n ** 18n;

/** Default slippage tolerance for trades, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100;

/** Explorer links, or undefined on the local chain, which has no explorer. */
const explorer = chain.blockExplorers?.default.url;

export function explorerAddressUrl(address: string) {
  return explorer ? `${explorer}/address/${address}` : undefined;
}

/** A contract's source code tab on the explorer. */
export function explorerCodeUrl(address: string) {
  return explorer ? `${explorer}/address/${address}?tab=contract` : undefined;
}

export function explorerTxUrl(hash: string) {
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}

/** True when `address` is the network's USDC, so amounts in it can be shown as dollars. */
export function isUsdc(address: string | undefined) {
  return Boolean(address && deployment && address.toLowerCase() === deployment.usdc.toLowerCase());
}
