import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { APP_NAME, chain } from "./config";
import { appTransport } from "./rpc";

export const wagmiConfig = getDefaultConfig({
  appName: APP_NAME,
  // A WalletConnect Cloud project ID is only needed for the QR-code / mobile wallet flow;
  // injected wallets (MetaMask, Rabby, Bitget…) work with the placeholder. Get a free one
  // at cloud.reown.com before a public launch if mobile wallets matter.
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [chain],
  // Direct to Arc, with our same-origin relay as fallback (ad blockers block arc.io); the
  // wallet's transactions still use its own connection.
  transports: { [chain.id]: appTransport(chain) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
