"use client";

import { useEffect, useState } from "react";
import { SITE_URL, TOKEN_ADDRESS, TOKEN_SYMBOL } from "@/lib/config";
import { AddToWallet } from "./AddToWallet";

/**
 * Contract-address pill for the Arcsmith token. Shows "CA · Soon" until `TOKEN_ADDRESS` is
 * set; after that it shows the ticker and the shortened address, copies the full one on click,
 * and has a wallet button beside it that adds the token to the visitor's wallet.
 */
export function ContractAddress({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const [copied, setCopied] = useState(false);

  // The "Copied" confirmation fades back to the address after a moment.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  // "lg" matches the height of `.pill-lg`, so it can sit next to a large button.
  const pill = `inline-flex items-center rounded-full border border-current/20 font-serif text-sm ${size === "lg" ? "h-[3.25rem]" : "h-10"} ${className}`;
  const tag = (
    <span className="grid h-7 place-items-center rounded-full bg-current/10 px-2.5 font-sans text-xs font-semibold tracking-wide">
      {TOKEN_ADDRESS ? `$${TOKEN_SYMBOL}` : "CA"}
    </span>
  );

  if (!TOKEN_ADDRESS) {
    return (
      <p className={`${pill} gap-2.5 ${size === "lg" ? "pl-2.5 pr-5" : "pl-1.5 pr-4"}`}>
        {tag}
        <span className="sr-only">Contract address:</span>
        <span className="opacity-70">Soon</span>
      </p>
    );
  }

  const address = TOKEN_ADDRESS;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const segment = "transition-colors duration-300 ease-spring hover:bg-current/5 focus-visible:outline-2 focus-visible:outline-validator";
  // One pill, two buttons: copy the address, or add the token to a wallet.
  return (
    <div className={`${pill} overflow-hidden`}>
      <button
        type="button"
        className={`inline-flex h-full items-center gap-2.5 ${size === "lg" ? "pl-2.5 pr-4" : "pl-1.5 pr-3"} ${segment}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
          } catch {
            // Clipboard can be blocked (insecure context, permissions); the address stays visible.
          }
        }}
        aria-label={`Copy the $${TOKEN_SYMBOL} contract address ${address}`}
      >
        {tag}
        <span aria-live="polite" className="font-mono tabular">
          {copied ? "Copied" : short}
        </span>
        <CopyIcon />
      </button>
      <span aria-hidden className="h-1/2 w-px bg-current/15" />
      <AddToWallet
        variant="icon"
        address={address}
        symbol={TOKEN_SYMBOL}
        decimals={18} // $SMITH's decimals, as the token reports them
        image={`${SITE_URL}/icon.png`}
        className={`grid h-full place-items-center ${size === "lg" ? "pl-3.5 pr-4" : "pl-2.5 pr-3"} ${segment}`}
      />
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="5" y="5" width="8.5" height="8.5" rx="2" />
      <path d="M3 10.5V4a1.5 1.5 0 0 1 1.5-1.5H10" strokeLinecap="round" />
    </svg>
  );
}
