import type { BlockKind } from "@/lib/blocks";

/** Minimal line icon per block family, in a small bordered tile like the references. */
export function BlockIcon({ kind, size = "md" }: { kind: BlockKind; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-6 rounded-[7px]" : "size-9 rounded-[10px]";
  const icon = size === "sm" ? "size-[13px]" : "size-[18px]";
  return (
    <span className={`grid shrink-0 place-items-center border border-line bg-panel text-text ${box}`}>
      <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {kind === "guard" && (
          <>
            <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
            <path d="m9.5 12 1.8 1.8 3.4-3.6" />
          </>
        )}
        {kind === "damper" && (
          <>
            <path d="M3 17c3 0 3-4 6-4s3 4 6 4 3-7 6-7" />
            <path d="M3 21h18" />
          </>
        )}
        {kind === "burn" && (
          <path d="M12 21c3.9 0 6.5-2.6 6.5-6.3 0-4.2-3.5-6.2-4.3-10.2-2.5 1.6-4 4.2-3.9 6.8-1-.6-1.8-1.7-2-3-1.9 1.8-2.8 4-2.8 6.3C5.5 18.4 8.1 21 12 21Z" />
        )}
        {kind === "surge" && (
          <>
            <path d="M4 18 10 12l3 3 7-8" />
            <path d="M15 7h5v5" />
          </>
        )}
        {kind === "custom" && (
          <>
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <path d="M16.5 13.5v6M13.5 16.5h6" />
          </>
        )}
      </svg>
    </span>
  );
}

/** The kernel's own guarantees, shown wherever a pool's rules are. */
export function LockIcon() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-panel">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      </svg>
    </span>
  );
}
