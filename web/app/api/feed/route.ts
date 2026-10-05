import { getFeed } from "@/lib/server/feed";

/** Live activity on Arc mainnet: ?scope=arcsmith (our pools) or ?scope=hooked (every hooked pool). */
export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") === "arcsmith" ? "arcsmith" : "hooked";
  try {
    const items = await getFeed(scope);
    return Response.json(items, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "The Arc index didn't answer." }, { status: 502 });
  }
}
