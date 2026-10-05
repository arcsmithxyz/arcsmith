"use client";

import { useState } from "react";

// Arc palette: navy, validator blue, sky, gold, sand, plum, clay, mauve.
const PALETTE = ["#1b3158", "#2f578c", "#acc6e9", "#e9a13f", "#ffcc6f", "#664c88", "#c0827a", "#908290"];

/** Deterministic gradient orb for a token without an image, seeded by its address. */
function orbBackground(seed: string) {
  const hex = seed.replace(/^0x/, "").padEnd(12, "0");
  const pick = (offset: number) => PALETTE[parseInt(hex.slice(offset, offset + 2), 16) % PALETTE.length];
  return `radial-gradient(70% 70% at 25% 25%, ${pick(0)} 0%, transparent 70%),
    radial-gradient(70% 70% at 80% 30%, ${pick(2)} 0%, transparent 70%),
    radial-gradient(80% 80% at 50% 90%, ${pick(4)} 0%, transparent 75%), ${pick(6)}`;
}

export function TokenAvatar({
  src,
  seed,
  size = 48,
  label,
}: {
  src?: string;
  seed: string;
  size?: number;
  label: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken && /^https?:\/\//.test(src ?? "");

  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full border border-line"
      style={{ width: size, height: size, background: showImage ? "var(--surface)" : orbBackground(seed) }}
    >
      {showImage && (
        // Creator-supplied URLs from any host, so a plain <img> rather than next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
