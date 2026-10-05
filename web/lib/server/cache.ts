import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Short-lived cache for server routes that read the public Arc index and RPCs, so a page
 * view doesn't turn into a fresh upstream request. Three layers:
 *
 * - memory: per Worker isolate (or per `next start` process). Always available.
 * - Cloudflare's Cache API: shared across isolates in one location. Only works on a custom
 *   domain (on *.workers.dev `cache.put` is a silent no-op), and absent in `next dev`.
 * - KV (`INDEX_CACHE`), for keys cached with `{ keep: true }`: one last good copy shared by every
 *   location, written at most once per KEEP_WRITE_SECONDS per key (KV's free plan allows 1,000
 *   writes a day). Read only when the upstream fails and nothing nearer has a stale value.
 *
 * When a value has expired and its upstream fails (the free index answering 429, an RPC down),
 * the last good value is served instead of an error, up to STALE_SECONDS past its expiry (or, for
 * kept keys, as long as KV holds it). So an outage shows older data rather than a broken page.
 *
 * Concurrent misses for the same key in one isolate share a single upstream request.
 *
 * Values must be JSON-serialisable.
 */
type Entry = {
  /** Until when the value counts as fresh. */
  expires: number;
  value: unknown;
  /** Until when it may still be served if the upstream is failing. Fixed when the value is loaded. */
  staleUntil: number;
};

/** What KV holds for a kept key. */
type Kept = { value: unknown; savedAt: number };

type KeyValueStore = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type CacheOptions = {
  /** Also keep the last good value in KV, for outages longer than the nearer layers remember. */
  keep?: boolean;
};

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
/** When this isolate last wrote (or found fresh) each kept key in KV. */
const keptAt = new Map<string, number>();
const MAX_ENTRIES = 200;
/** How long past its expiry a value may still be served while its upstream fails. */
const STALE_SECONDS = 48 * 60 * 60;
/** After a failed refresh, how long the stale value is reused before the upstream is tried again. */
const RETRY_AFTER_FAILURE_SECONDS = 60;
/** At most one KV write per kept key in this long. */
const KEEP_WRITE_SECONDS = 60 * 60;
/** KV drops a kept copy that hasn't been refreshed in this long. */
const KEEP_TTL_SECONDS = 7 * 24 * 60 * 60;

function edgeCache(): Cache | null {
  const storage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return storage?.default ?? null;
}

function keptStore(): KeyValueStore | null {
  try {
    return (getCloudflareContext().env as { INDEX_CACHE?: KeyValueStore }).INDEX_CACHE ?? null;
  } catch {
    // Outside Cloudflare (`next dev` without bindings) there is no KV.
    return null;
  }
}

export function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
  const entry = memory.get(key);
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.value as T);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const refresh = refreshEntry(key, ttlSeconds, load, options).finally(() => inflight.delete(key));
  inflight.set(key, refresh);
  return refresh;
}

async function refreshEntry<T>(key: string, ttlSeconds: number, load: () => Promise<T>, options: CacheOptions): Promise<T> {
  const now = Date.now();
  const entry = memory.get(key);
  // The newest expired value we know of, to fall back on if the upstream fails.
  let stale: Entry | undefined = entry && entry.staleUntil > now ? entry : undefined;

  const edge = edgeCache();
  const url = `https://cache.arcsmith.internal/${encodeURIComponent(key)}`;
  if (edge) {
    try {
      const hit = await edge.match(url);
      const stored = hit ? ((await hit.json()) as Partial<Entry> | null) : null;
      // Entries written before stale values were kept were the bare value; they read as a miss.
      if (stored && typeof stored.expires === "number" && typeof stored.staleUntil === "number" && "value" in stored) {
        const found = stored as Entry;
        if (found.expires > now) {
          remember(key, found);
          return found.value as T;
        }
        if (found.staleUntil > now && (!stale || found.expires > stale.expires)) stale = found;
      }
    } catch {
      // A broken cache read is just a miss.
    }
  }

  let value: T;
  try {
    value = await load();
  } catch (error) {
    if (!stale && options.keep) stale = await readKept(key);
    if (stale) {
      // Serve the old value, and leave the upstream alone for a moment so a struggling one can recover.
      remember(key, { ...stale, expires: now + RETRY_AFTER_FAILURE_SECONDS * 1000 });
      return stale.value as T;
    }
    throw error;
  }

  const expires = Date.now() + ttlSeconds * 1000;
  const fresh: Entry = { expires, value, staleUntil: expires + STALE_SECONDS * 1000 };
  remember(key, fresh);
  if (edge) {
    try {
      await edge.put(
        url,
        new Response(JSON.stringify(fresh), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttlSeconds + STALE_SECONDS}` },
        }),
      );
    } catch {
      // Caching is best effort.
    }
  }
  if (options.keep) inBackground(writeKept(key, value));
  return value;
}

/** Lets a task finish after the response is sent (Workers' waitUntil), so callers don't wait on it. */
function inBackground(task: Promise<unknown>) {
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    // No request context (`next dev`): the task simply runs on.
    void task;
  }
}

/** The last good copy of a kept key from KV, as a stale entry, or undefined. */
async function readKept(key: string): Promise<Entry | undefined> {
  const store = keptStore();
  if (!store) return undefined;
  try {
    const kept = (await store.get(`kept:${key}`, "json")) as Kept | null;
    if (!kept || typeof kept.savedAt !== "number" || !("value" in kept)) return undefined;
    return { value: kept.value, expires: kept.savedAt, staleUntil: Number.POSITIVE_INFINITY };
  } catch {
    return undefined;
  }
}

/**
 * Saves a fresh value as the kept copy, unless one was saved within KEEP_WRITE_SECONDS. Other
 * isolates may have written it, so KV is checked (a cheap read) before spending a write.
 */
async function writeKept(key: string, value: unknown) {
  const store = keptStore();
  if (!store) return;
  const now = Date.now();
  const recent = (at: number | undefined) => at !== undefined && now - at < KEEP_WRITE_SECONDS * 1000;
  if (recent(keptAt.get(key))) return;
  try {
    const existing = (await store.get(`kept:${key}`, "json")) as Kept | null;
    if (existing && recent(existing.savedAt)) {
      keptAt.set(key, existing.savedAt);
      return;
    }
    const kept: Kept = { value, savedAt: now };
    await store.put(`kept:${key}`, JSON.stringify(kept), { expirationTtl: KEEP_TTL_SECONDS });
    keptAt.set(key, now);
  } catch {
    // Keeping a copy is best effort; the answer itself is already on its way.
  }
}

function remember(key: string, entry: Entry) {
  if (memory.size >= MAX_ENTRIES) {
    // Drop the oldest insertion; Map keeps insertion order.
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, entry);
}
