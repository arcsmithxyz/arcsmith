import { defineChain } from "viem";

// viem doesn't ship Arc yet. Chain IDs, RPCs, explorers and Multicall3 were verified live
// with eth_chainId / eth_getCode on both networks.

// Arc's native gas token is USDC with 18 decimals; the ERC-20 interface at 0x3600…0000 shows
// the same balance with 6. The app always reads and moves the ERC-20.
const nativeCurrency = { name: "USD Coin", symbol: "USDC", decimals: 18 } as const;
const multicall3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } as const;

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency,
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: { multicall3 },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency,
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io"] },
  },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  contracts: { multicall3 },
  testnet: true,
});

/** Local Anvil chain for development. `pnpm dev:local` starts it, deploys and seeds it. */
export const localChain = defineChain({
  id: 31337,
  name: "Local (Anvil)",
  nativeCurrency,
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  contracts: { multicall3 },
  testnet: true,
});
