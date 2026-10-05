"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress } from "@/lib/permissions";

/**
 * Address box for the Hook Reader. Takes a hook, or a token: the page works out which, and for
 * a token lists the pools it trades in with each pool's hook.
 */
export function HookSearch({ autoFocus, id = "hook-address" }: { autoFocus?: boolean; /** Unique per page when there's more than one box. */ id?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const address = value.trim();
          if (!isAddress(address)) {
            setError("That isn't an address. Hook and token addresses look like 0x followed by 40 characters.");
            return;
          }
          router.push(`/hooks/${address}`);
        }}
      >
        <label htmlFor={id} className="sr-only">
          Hook or token address
        </label>
        <input
          id={id}
          className="field h-12 font-mono text-sm"
          placeholder="0x… hook or token address"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="submit" className="pill pill-ink h-12 shrink-0">
          Read
        </button>
      </form>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-sell">
          {error}
        </p>
      )}
    </div>
  );
}
