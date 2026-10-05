"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useConnection, useSwitchChain, useWatchAsset } from "wagmi";
import { chain } from "@/lib/config";

type Status = "idle" | "busy" | "added" | "declined";

const LABELS: Record<Status, string> = {
  idle: "Add to wallet",
  busy: "Confirm in your wallet",
  added: "Added to wallet",
  declined: "Not added",
};

/**
 * Asks the wallet to track a token (EIP-747), logo included. Wallets add a token to the network
 * they're on, so this switches to Arc first; without a connected wallet it opens the connect
 * dialog instead. `variant="icon"` is a bare icon button, for use inside another control.
 */
export function AddToWallet({
  address,
  symbol,
  decimals,
  image,
  variant = "pill",
  className = "",
}: {
  address: Address;
  symbol: string;
  decimals: number;
  /** The token's logo; only https URLs are passed on, since wallets fetch it themselves. */
  image?: string;
  variant?: "pill" | "icon";
  className?: string;
}) {
  const { isConnected, chainId } = useConnection();
  const { openConnectModal } = useConnectModal();
  const switchChain = useSwitchChain();
  const { watchAssetAsync } = useWatchAsset();
  const [status, setStatus] = useState<Status>("idle");

  // The result shows for a moment, then the button resets.
  useEffect(() => {
    if (status !== "added" && status !== "declined") return;
    const timer = setTimeout(() => setStatus("idle"), 2400);
    return () => clearTimeout(timer);
  }, [status]);

  async function add() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    setStatus("busy");
    try {
      if (chainId !== chain.id) await switchChain.mutateAsync({ chainId: chain.id });
      const added = await watchAssetAsync({
        type: "ERC20",
        options: { address, symbol, decimals, image: image?.startsWith("https://") ? image : undefined },
      });
      setStatus(added ? "added" : "declined");
    } catch {
      // Declined, or the wallet can't add tokens (some mobile and WalletConnect wallets).
      setStatus("declined");
    }
  }

  const icon = status === "added" ? <CheckIcon /> : <WalletIcon className={status === "busy" ? "animate-pulse" : ""} />;

  if (variant === "icon") {
    const label = `Add $${symbol} to your wallet`;
    return (
      <button type="button" onClick={add} disabled={status === "busy"} aria-label={label} title={label} className={className}>
        {icon}
        <span aria-live="polite" className="sr-only">
          {status === "idle" ? "" : LABELS[status]}
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={add} disabled={status === "busy"} className={`pill pill-sm pill-outline ${className}`}>
      {icon}
      <span aria-live="polite">{LABELS[status]}</span>
    </button>
  );
}

function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`size-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
      <path d="M12.5 5V3.75A1.25 1.25 0 0 0 11.25 2.5H3.5A1.5 1.5 0 0 0 2 4v8a1.5 1.5 0 0 0 1.5 1.5h9.25a1.25 1.25 0 0 0 1.25-1.25v-6A1.25 1.25 0 0 0 12.75 5H3.5A1.5 1.5 0 0 1 2 3.5" />
      <circle cx="11" cy="9.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0 text-buy" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 8.5 3 3 6-6.5" />
    </svg>
  );
}
