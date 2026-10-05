import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Token images uploaded in the builder. The browser crops and re-encodes them to small
 * squares first (lib/token-image.ts); here they're checked, stored in Workers KV under their
 * SHA-256 (so the same image is stored once and a URL never changes), and served from
 * /media/<hash>.<ext>. That URL is what goes on-chain as the token's image.
 */

/** Far more than a re-encoded 512 px square needs; keeps KV values small. */
export const MAX_MEDIA_BYTES = 512 * 1024;

const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" } as const;
type Extension = keyof typeof TYPES;

/** The minimal Workers KV surface this uses. */
type MediaStore = {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer): Promise<void>;
};
type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

function bindings(): { store: MediaStore | null; limiter: RateLimiter | null } {
  try {
    const env = getCloudflareContext().env as { MEDIA?: MediaStore; MEDIA_RATE_LIMITER?: RateLimiter };
    return { store: env.MEDIA ?? null, limiter: env.MEDIA_RATE_LIMITER ?? null };
  } catch {
    return { store: null, limiter: null };
  }
}

/** The image format from the file's first bytes, never from what the uploader claims. */
function sniff(bytes: Uint8Array): Extension | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

export type SaveResult = { ok: true; file: string } | { ok: false; status: number; message: string };

/** Checks and stores one upload. `ip` is used for the per-visitor limit (10 a minute). */
export async function saveMedia(body: ArrayBuffer, ip: string): Promise<SaveResult> {
  const { store, limiter } = bindings();
  if (!store) return { ok: false, status: 503, message: "Image uploads aren't available here." };
  if (limiter && !(await limiter.limit({ key: ip })).success) {
    return { ok: false, status: 429, message: "Too many uploads. Try again in a minute." };
  }
  if (body.byteLength === 0 || body.byteLength > MAX_MEDIA_BYTES) {
    return { ok: false, status: 413, message: "The image is too large." };
  }
  const extension = sniff(new Uint8Array(body));
  if (!extension) return { ok: false, status: 415, message: "Upload a PNG, JPG or WebP image." };

  const digest = await crypto.subtle.digest("SHA-256", body);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const file = `${hash}.${extension}`;
  // Content-addressed: if it's already there it's identical, so skip the write (KV writes are metered).
  if ((await store.get(`media/${file}`, "arrayBuffer")) === null) await store.put(`media/${file}`, body);
  return { ok: true, file };
}

const FILE = /^([0-9a-f]{64})\.(webp|png|jpg)$/;

/** One stored image, or null if the name is malformed or unknown. */
export async function loadMedia(file: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const match = FILE.exec(file);
  const { store } = bindings();
  if (!match || !store) return null;
  const body = await store.get(`media/${file}`, "arrayBuffer");
  return body ? { body, type: TYPES[match[2] as Extension] } : null;
}
