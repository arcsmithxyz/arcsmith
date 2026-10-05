import { loadMedia } from "@/lib/server/media";

/**
 * Serves an uploaded token image. Names are content hashes, so a file never changes and can
 * be cached for good. Served as an inert image: no sniffing, no scripts, embeddable anywhere.
 */
export async function GET(request: Request, context: RouteContext<"/media/[file]">) {
  const { file } = await context.params;
  const edge = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;
  const hit = await edge?.match(request).catch(() => undefined);
  if (hit) return hit;

  const media = await loadMedia(file);
  if (!media) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });

  const response = new Response(media.body, {
    headers: {
      "content-type": media.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
  // Keep KV reads down: later requests in this location come from the edge cache.
  await edge?.put(request, response.clone()).catch(() => undefined);
  return response;
}
