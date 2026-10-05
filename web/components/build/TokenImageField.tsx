"use client";

import { useState } from "react";
import { prepareTokenImage, TOKEN_IMAGE_ACCEPT } from "@/lib/token-image";

/** A picked image, already cropped and re-encoded, waiting to be uploaded at launch. */
export type TokenImage = { blob: Blob; preview: string; name: string };

/**
 * The token's image: pick or drop a file. It's prepared in the browser right away (so the
 * preview is exactly what will be stored) and only uploaded when the token launches.
 */
export function TokenImageField({ value, onChange }: { value: TokenImage | null; onChange: (next: TokenImage | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareTokenImage(file);
      onChange({ blob, preview: await dataUrl(blob), name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That image couldn't be used.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="flex items-baseline text-sm font-medium">
        Image
        <span className="ml-1.5 font-normal text-subtle">optional</span>
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        // Moving onto a child element also fires dragleave; only leaving the box counts.
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void pick(e.dataTransfer.files[0]);
        }}
        className={`field mt-2 flex items-center gap-2 pr-1.5 pl-1.5 focus-within:border-validator focus-within:shadow-[0_0_0_3px_rgb(47_87_140/0.15)] ${
          dragging ? "border-validator bg-surface" : ""
        }`}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch">
          <input
            type="file"
            accept={TOKEN_IMAGE_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              // Let the same file be picked again after a removal.
              e.target.value = "";
            }}
          />
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface text-subtle">
            {value ? (
              // A local data URL, so a plain <img>.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.preview} alt="" className="size-full object-cover" />
            ) : (
              <UploadIcon />
            )}
          </span>
          <span className={`truncate ${value ? "text-text" : "text-subtle"}`}>
            {busy ? "Preparing…" : value ? value.name : dragging ? "Drop it here" : "Upload an image"}
          </span>
        </label>
        {value && (
          <button type="button" className="pill pill-ghost pill-sm h-8 shrink-0" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <p aria-live="polite" className={`mt-1 text-xs ${error ? "text-sell" : "text-subtle"}`}>
        {error ?? "PNG, JPG, WebP or GIF. Cropped to a square."}
      </p>
    </div>
  );
}

/** A data URL rather than an object URL: nothing to revoke, and it survives the field remounting. */
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("That image couldn't be read."));
    reader.readAsDataURL(blob);
  });
}

function UploadIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
    </svg>
  );
}
