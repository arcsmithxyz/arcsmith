"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { chain, deployment } from "@/lib/config";

/**
 * A small floating note for the states that change what works: no contracts, wrong
 * network, or a test network. It floats at the bottom so it never pushes the page around
 * under the fixed header.
 */
export function NetworkNotice() {
  const { isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();

  if (!deployment) {
    return (
      <Note tone="warn">
        Contracts aren&apos;t deployed on {chain.name} yet. Browsing works; launching and trading are disabled.
      </Note>
    );
  }
  if (isConnected && chainId !== chain.id) {
    return (
      <Note tone="warn">
        Your wallet is on another network.{" "}
        <button
          type="button"
          className="font-semibold underline underline-offset-2"
          onClick={() => switchChain.mutate({ chainId: chain.id })}
        >
          Switch to {chain.name}
        </button>
      </Note>
    );
  }
  if (chain.testnet) {
    return <Note tone="quiet">{chain.name}: tokens and USDC here have no real value.</Note>;
  }
  return null;
}

function Note({ children, tone }: { children: React.ReactNode; tone: "warn" | "quiet" }) {
  return (
    <p
      role="status"
      className={`fixed bottom-4 left-4 z-40 max-w-[calc(100%-2rem)] rounded-xl border px-4 py-2 text-sm shadow-panel backdrop-blur-lg sm:max-w-md ${
        tone === "warn" ? "border-warn/20 bg-warn-soft/95 text-warn" : "border-ink/8 bg-bg/85 text-muted"
      }`}
    >
      {children}
    </p>
  );
}
