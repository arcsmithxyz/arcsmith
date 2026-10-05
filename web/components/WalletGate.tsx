"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { chain } from "@/lib/config";

/**
 * Renders its children (the real action button) only once a wallet is connected on the
 * app's network; otherwise a full-width connect or switch-network button in its place.
 */
export function WalletGate({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();

  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <button type="button" className="pill pill-ink w-full" onClick={openConnectModal}>
            Connect wallet
          </button>
        )}
      </ConnectButton.Custom>
    );
  }
  if (chainId !== chain.id) {
    return (
      <button type="button" className="pill pill-ink w-full" onClick={() => switchChain.mutate({ chainId: chain.id })}>
        Switch to {chain.name}
      </button>
    );
  }
  return <>{children}</>;
}
