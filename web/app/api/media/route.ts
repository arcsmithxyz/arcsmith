import { SITE_URL } from "@/lib/config";
import { MAX_MEDIA_BYTES, saveMedia } from "@/lib/server/media";

/**
 * Upload a token image: the raw image bytes as the request body. Answers with the permanent
 * URL to put on-chain. Images are checked by content and stored by hash (lib/server/media.ts).
 */
export async function POST(request: Request) {
  // Refuse oversized bodies before reading them.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) {
    return Response.json({ error: "The image is too large." }, { status: 413 });
  }
  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = await saveMedia(await request.arrayBuffer(), ip);
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });

  // The URL goes on-chain for good, so it uses the site's public address, except under
  // `next dev`, where the image only exists in the local store. (The workerd preview reports
  // the production host, so it gets the public address too.)
  const { origin, hostname } = new URL(request.url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  return Response.json({ url: `${local ? origin : SITE_URL}/media/${result.file}` }, { headers: { "cache-control": "no-store" } });
}
