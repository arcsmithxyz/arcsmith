"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * Wallet button in the site's own button style (RainbowKit's stock button uses its own
 * type and shape). Covers every state: not connected, wrong network, and connected.
 * `tone="quiet"` makes it an outlined secondary, for places where another button is the
 * main action (the header, next to "Launch token").
 */
export function WalletButton({
  size = "sm",
  tone = "primary",
  className = "",
}: {
  size?: "sm" | "lg";
  tone?: "primary" | "quiet";
  className?: string;
}) {
  const sizing = size === "sm" ? "pill-sm" : "pill-lg";
  const quiet = tone === "quiet";
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        // Before hydration the wallet state is unknown; keep the space without flashing.
        if (!mounted) {
          return (
            <span aria-hidden className={`pill ${sizing} pill-ghost invisible ${className}`}>
              Connect wallet
            </span>
          );
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={`pill ${sizing} ${quiet ? "pill-outline" : "pill-ink"} ${className}`}>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={`pill ${sizing} pill-soft ${className}`}>
              Switch network
            </button>
          );
        }
        return (
          <button type="button" onClick={openAccountModal} className={`pill ${sizing} ${quiet ? "pill-outline" : "pill-ghost"} ${className}`}>
            <span aria-hidden className="size-2 rounded-full bg-buy" />
            <span className="tabular">{account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
