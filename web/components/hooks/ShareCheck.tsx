"use client";

import { useEffect, useState } from "react";
import { SITE_URL } from "@/lib/config";

/**
 * Share a Hook Reader page: a post on X with the link (whose preview card shows what the hook
 * can do), a plain copy of the link, and for a hook the Markdown for its badge.
 */
export function ShareCheck({ path, text, badgeAddress }: { path: string; text: string; badgeAddress?: string }) {
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);
  const url = `${SITE_URL}${path}`;

  // Say "Copied" for a moment, then go back to the label.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(kind: "link" | "badge", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the link is in the address bar.
    }
  }

  const post = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const badge = badgeAddress
    ? `[![Arcsmith hook check](${SITE_URL}/api/v1/hooks/${badgeAddress}/badge.svg)](${SITE_URL}/hooks/${badgeAddress})`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <a className="pill pill-sm pill-outline" href={post} target="_blank" rel="noreferrer">
        Share on X
      </a>
      <button type="button" className="pill pill-sm pill-outline" onClick={() => copy("link", url)}>
        {copied === "link" ? "Link copied" : "Copy link"}
      </button>
      {badge && (
        <button type="button" className="pill pill-sm pill-outline" onClick={() => copy("badge", badge)} title="Markdown for a README or listing">
          {copied === "badge" ? "Badge copied" : "Copy badge"}
        </button>
      )}
    </div>
  );
}
